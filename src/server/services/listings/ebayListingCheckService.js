import { randomUUID } from "node:crypto";
import { all, get, run, runInImmediateTransaction } from "../../database.js";
import { getEbayStatus } from "../../integrations/ebay/ebayAuth.js";
import { uploadSiteHostedPictures } from "../../integrations/ebay/ebayClient.js";
import { checkedAccount, loadSellingPolicies, verifyListingDefinition } from "../../integrations/ebay/ebayListingCheckClient.js";
import { readImageFile } from "../imageStore.js";
import { assertDraftEditable, assertEbayPublishReady } from "./draftReviewService.js";
import { buildDefinition, choosePolicies, contentFingerprint, fail, normalizeConfig } from "./ebayListingDefinition.js";
import { ungradedCardCondition } from "../../../lib/listingContent.js";

const SETUP_KEY = "ebay_selling_setup";
const CHECK_TTL = 15 * 60 * 1000;

// Inject provider operations in tests; never allow request bodies to supply XML,
// account identity, policy definitions or a successful verification result.
export function createEbayListingCheckService(dependencies = {}) {
  const api = { account: checkedAccount, status: getEbayStatus, policies: loadSellingPolicies,
    verify: verifyListingDefinition, upload: uploadSiteHostedPictures, now: Date.now, ...dependencies };

  function setup() {
    const status = api.status();
    const environment = status.sandbox ? "sandbox" : "production";
    if (!status.connected) return { connected: false, environment, config: null };
    const account = api.account();
    const stored = JSON.parse(get("SELECT value FROM settings WHERE key=?", [SETUP_KEY])?.value || "null");
    return { connected: true, environment: account.environment, config: stored?.accountKey === account.key ? stored.config : null };
  }

  async function saveSetup(input) {
    const account = api.account();
    const config = normalizeConfig(input);
    choosePolicies(config, await api.policies());
    if (api.account().key !== account.key) fail("eBay account changed. Reload selling policies.");
    runInImmediateTransaction(() => {
      const value = JSON.stringify({ accountKey: account.key, config });
      if (get("SELECT value FROM settings WHERE key=?", [SETUP_KEY])?.value !== value) run("DELETE FROM ebay_listing_checks");
      run("INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [SETUP_KEY, value]);
    });
    return setup();
  }

  function source(listingId, allowClaim = false) {
    const listing = get("SELECT * FROM listings WHERE id=?", [listingId]);
    if (!listing) fail("Listing not found", 404);
    if (!allowClaim) assertDraftEditable(listing);
    else {
      if (["sold", "ended"].includes(listing.status)) fail("This listing is sold or ended.");
      const realId = listing.external_listing_id && listing.external_listing_id !== `ebay-${listingId.slice(0, 12)}`;
      if (realId || ["publish_unknown", "needs_review", "sold", "ended"].includes(listing.publish_status)) fail("The listing has confirmed or uncertain publication evidence. Refresh Sales before publishing.");
      const channels = all("SELECT * FROM listing_channels WHERE listing_id=?", [listingId]);
      if (channels.some((channel) => !["draft", "failed", "publishing"].includes(channel.status)
        || (channel.external_listing_id && channel.external_listing_id !== `${channel.marketplace}-${listingId.slice(0, 12)}`))) fail("Publication state changed. Refresh Sales before publishing.");
    }
    assertEbayPublishReady(listing);
    const item = get("SELECT * FROM user_items WHERE id=?", [listing.card_id]);
    if (listing.format !== "fixed" || listing.platform !== "ebay") fail("Checked publication supports eBay fixed-price drafts only.", 400);
    const images = [item.front_img_id, item.back_img_id].map((id) => id && readImageFile(id));
    if (images.some((image) => !image?.buffer?.length)) fail("Add both front and back photos before checking with eBay.", 400);
    const config = setup().config;
    if (!config) fail("Save your eBay selling policies and ship-from details before checking.");
    return { listing, item, images, config, account: api.account() };
  }

  function fingerprint(current, policies) {
    return contentFingerprint(current.listing, current.item, current.images, current.config, current.account.key, policies);
  }

  async function check(listingId) {
    const initial = source(listingId);
    const policies = choosePolicies(initial.config, await api.policies());
    // Validate before uploading any data. Actual URLs replace placeholders below.
    buildDefinition(initial.listing, initial.item, initial.config, policies, ["https://check.invalid/front", "https://check.invalid/back"]);
    const proof = fingerprint(initial, policies);
    const urls = [];
    for (const image of initial.images) {
      if (api.account().key !== initial.account.key) fail("eBay account changed. Check again.");
      urls.push(await api.upload(image.buffer, image.mime, { beforeSend: () => {
        if (api.account().key !== initial.account.key) fail("eBay account changed before photo upload. Check again.");
      } }));
    }
    const xml = buildDefinition(initial.listing, initial.item, initial.config, policies, urls);
    if (fingerprint(source(listingId), policies) !== proof) fail("Draft, photos or selling setup changed during checking. Check again.");
    const verification = await api.verify(xml, initial.account.key);
    // Remote policies can change while photos/verification are in flight.
    const current = source(listingId);
    const freshPolicies = choosePolicies(current.config, await api.policies());
    if (fingerprint(source(listingId), freshPolicies) !== proof) fail("Draft, photos, account or policies changed during checking. Check again.");
    const expiresAt = api.now() + CHECK_TTL;
    const result = {
      id: randomUUID(), ready: verification.ready === true, environment: initial.account.environment,
      expiresAt: new Date(expiresAt).toISOString(), messages: verification.messages, fees: verification.fees,
      review: { title: initial.listing.listing_title, description: initial.listing.listing_description,
        price: Number(initial.listing.start_price), shipping: policies.shipping,
        condition: ungradedCardCondition(initial.item.condition).label, postalCode: initial.config.postalCode,
        sport: initial.item.sport || initial.config.sport, manufacturer: initial.item.manufacturer || initial.config.manufacturer,
        policyNames: { fulfillment: policies.fulfillment.name, payment: policies.payment.name, returns: policies.returns.name }, pictureUrls: urls },
    };
    run("INSERT INTO ebay_listing_checks(id,listing_id,account_key,fingerprint,item_xml,result_json,expires_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(listing_id) DO UPDATE SET id=excluded.id,account_key=excluded.account_key,fingerprint=excluded.fingerprint,item_xml=excluded.item_xml,result_json=excluded.result_json,expires_at=excluded.expires_at,used_at=NULL",
      [result.id, listingId, initial.account.key, proof, xml, JSON.stringify(result), expiresAt]);
    return result;
  }

  async function authorize(listingId, options = {}) {
    try {
      if (!options.checkId || options.confirmChecked !== true) fail("Open Review & publish, check with eBay, then explicitly approve the checked listing.");
      const receipt = get("SELECT * FROM ebay_listing_checks WHERE id=? AND listing_id=?", [options.checkId, listingId]);
      if (!receipt || receipt.used_at != null || receipt.expires_at <= api.now()) fail("This check is missing, used or expired. Check the draft again.");
      const result = JSON.parse(receipt.result_json);
      if (!result.ready || options.environment !== result.environment) fail("Approve the successful check for the displayed eBay environment.");
      const current = source(listingId, true);
      const policies = choosePolicies(current.config, await api.policies());
      const guard = () => {
        const row = get("SELECT * FROM ebay_listing_checks WHERE id=? AND listing_id=?", [receipt.id, listingId]);
        const live = source(listingId, true);
        if (!row || row.used_at != null || row.expires_at <= api.now() || live.account.key !== receipt.account_key
          || live.account.environment !== options.environment || fingerprint(live, policies) !== receipt.fingerprint
          || row.item_xml !== receipt.item_xml) fail("The checked draft, photos, account or policies changed. Check again before publishing.");
      };
      guard();
      return { xml: receipt.item_xml, beforeSend: () => runInImmediateTransaction(() => {
        guard();
        run("UPDATE ebay_listing_checks SET used_at=? WHERE id=?", [api.now(), receipt.id]);
      }) };
    } catch (cause) {
      if (cause.code === "EBAY_PREPARATION_FAILED") throw cause;
      const error = new Error(`Could not recheck selling policies; no listing was submitted. ${cause.message}`, { cause });
      error.code = "EBAY_PREPARATION_FAILED";
      error.status = cause.status || 409;
      throw error;
    }
  }

  return { setup, saveSetup, check, authorize, loadPolicies: api.policies };
}

export const ebayListingChecks = createEbayListingCheckService();
