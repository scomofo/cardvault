import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digest, fail, normalizeConfig, choosePolicies, buildDefinition, contentFingerprint } from "../src/server/services/listings/ebayListingDefinition.js";
import { checkedAccount, loadSellingPolicies, parseVerification, verifyListingDefinition } from "../src/server/integrations/ebay/ebayListingCheckClient.js";

const CONFIG = { fulfillmentPolicyId: "11", paymentPolicyId: "22", returnPolicyId: "33", postalCode: "T5J0N3", sport: "Hockey", manufacturer: "Upper Deck" };
const LISTING = { id: "draft-1", card_id: "card-1", platform: "ebay", format: "fixed", listing_title: "Card & <title>", listing_description: "Inspected card ]]> and photos", start_price: 9.5, shipping: 0 };
const ITEM = { id: "card-1", type: "sports", condition: "NM", name: "Test Player", card_number: 0, year: 2020 };
const PICTURES = ["https://i.ebayimg.com/front.jpg", "https://i.ebayimg.com/back.jpg"];
const IMAGES = [{ mime: "image/jpeg", buffer: Buffer.from("front") }, { mime: "image/jpeg", buffer: Buffer.from("back") }];
function allPolicies() {
  return {
    fulfillmentPolicies: [{ fulfillmentPolicyId: "11", marketplaceId: "EBAY_CA", handlingTime: { value: 3, unit: "DAY" }, shippingOptions: [{ optionType: "DOMESTIC", costType: "FLAT_RATE", shippingServices: [{ shippingServiceCode: "CA_RegularParcel", freeShipping: true }] }] }],
    paymentPolicies: [{ paymentPolicyId: "22", marketplaceId: "EBAY_CA" }],
    returnPolicies: [{ returnPolicyId: "33", marketplaceId: "EBAY_CA", returnsAccepted: false }],
  };
}
const verification = (body) => `<VerifyAddFixedPriceItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">${body}</VerifyAddFixedPriceItemResponse>`;

test("selling configuration validates policy IDs and Canadian origin without retaining secrets", () => {
  assert.deepEqual(normalizeConfig({ ...CONFIG, postalCode: "t5j 0n3", sport: " Hockey ", accessToken: "private" }), CONFIG);
  for (const input of [null, [], { ...CONFIG, fulfillmentPolicyId: "11<bad>" }, { ...CONFIG, paymentPolicyId: 22 }, { ...CONFIG, postalCode: "D1A1A1" }, { ...CONFIG, sport: " " }, { ...CONFIG, manufacturer: "x".repeat(121) }]) assert.throws(() => normalizeConfig(input), (error) => error.status === 400 && error.code === "EBAY_PREPARATION_FAILED");
  assert.throws(() => fail("Blocked"), (error) => error.status === 409 && error.code === "EBAY_PREPARATION_FAILED");
  assert.equal(digest({ b: 2, a: 1 }), digest({ a: 1, b: 2 }));
});

test("selected Canadian policies preserve free shipping and reject ambiguous buyer charges", () => {
  assert.equal(choosePolicies(CONFIG, allPolicies()).shipping, 0);
  const paid = allPolicies();
  paid.fulfillmentPolicies[0].shippingOptions[0].shippingServices[0] = { shippingServiceCode: "CA_RegularParcel", shippingCost: { value: "4.50", currency: "CAD" } };
  assert.equal(choosePolicies(CONFIG, paid).shipping, 4.5);
  for (const change of [
    (p) => { p.marketplaceId = "EBAY_US"; },
    (p) => { p.shippingOptions.push({ ...p.shippingOptions[0], optionType: "INTERNATIONAL" }); },
    (p) => { p.shippingOptions[0].costType = "CALCULATED"; },
    (p) => { p.shippingOptions[0].shippingServices.push({ ...p.shippingOptions[0].shippingServices[0] }); },
    (p) => { p.shippingOptions[0].rateTableId = "100"; },
    (p) => { p.shippingOptions[0].shippingDiscountProfileId = "100"; },
    (p) => { p.shippingOptions[0].shippingPromotionOffered = true; },
    (p) => { p.shippingOptions[0].packageHandlingCost = { value: "1.00", currency: "CAD" }; },
    (p) => { p.localPickup = true; },
    (p) => { p.globalShipping = true; },
    (p) => { p.shippingOptions[0].shippingServices[0].buyerResponsibleForShipping = true; },
    (p) => { p.shippingOptions[0].shippingServices[0].shippingServiceCode = ""; },
    (p) => { p.shippingOptions[0].shippingServices[0] = { shippingServiceCode: "CA_RegularParcel", shippingCost: { value: 1, currency: "USD" } }; },
    (p) => { p.shippingOptions[0].shippingServices[0].shippingCost = { value: 5, currency: "CAD" }; },
  ]) {
    const policies = allPolicies(); change(policies.fulfillmentPolicies[0]);
    assert.throws(() => choosePolicies(CONFIG, policies), (error) => error.code === "EBAY_PREPARATION_FAILED");
  }
});

test("checked XML uses explicit raw condition, exact policies and both actual photo URLs", () => {
  const policies = choosePolicies(CONFIG, allPolicies());
  const xml = buildDefinition(LISTING, ITEM, CONFIG, policies, PICTURES);
  assert.match(xml, /<Title>Card &amp; &lt;title&gt;<\/Title>/);
  assert.match(xml, /<StartPrice currencyID="CAD">9\.50<\/StartPrice>/);
  assert.match(xml, /<ConditionID>4000<\/ConditionID>/);
  assert.match(xml, /<Name>40001<\/Name><Value>400010<\/Value>/);
  assert.match(xml, /<Name>Card Number<\/Name><Value>0<\/Value>/);
  assert.match(xml, /<Name>Sport<\/Name><Value>Hockey<\/Value>/);
  assert.match(xml, /<Name>Manufacturer<\/Name><Value>Upper Deck<\/Value>/);
  assert.match(xml, /<ShippingProfileID>11<\/ShippingProfileID>/);
  assert.match(xml, /<PaymentProfileID>22<\/PaymentProfileID>/);
  assert.match(xml, /<ReturnProfileID>33<\/ReturnProfileID>/);
  assert.equal((xml.match(/<PictureURL>/g) || []).length, 2);
  assert.ok(xml.includes("Inspected card ]]]]><![CDATA[> and photos"));
  assert.doesNotMatch(xml, /<ShippingServiceCost>|<ConditionID>2750/);
  assert.throws(() => buildDefinition({ ...LISTING, shipping: 4.99 }, ITEM, CONFIG, policies, PICTURES), /policy charges CAD 0.00/);
  for (const price of [" ", [], false, -1, 0]) assert.throws(() => buildDefinition({ ...LISTING, start_price: price }, ITEM, CONFIG, policies, PICTURES), /Invalid price/);
  for (const pictures of [[], [PICTURES[0]], [PICTURES[0], "http://image.test/back.jpg"]]) assert.throws(() => buildDefinition(LISTING, ITEM, CONFIG, policies, pictures), /Both card photos/);
  for (const item of [{ ...ITEM, condition: "uninspected" }, { ...ITEM, type: "tcg" }]) assert.throws(() => buildDefinition(LISTING, item, CONFIG, policies, PICTURES), /raw sports-card singles/);
});

test("fingerprint ignores claims and private inventory metadata but binds buyer content, bytes and account", () => {
  const policies = choosePolicies(CONFIG, allPolicies());
  const fingerprint = (listing = LISTING, item = ITEM, images = IMAGES, config = CONFIG, key = "account-1", selected = policies) => contentFingerprint(listing, item, images, config, key, selected);
  const original = fingerprint();
  assert.equal(fingerprint({ ...LISTING, status: "publishing", publish_status: "publishing", updated_at: "new" }, { ...ITEM, listing_status: "listed", updated_at: "new", purchase_price: 50, notes: "private", storage_location: "box-2" }), original);
  assert.equal(fingerprint(LISTING, { ...ITEM, condition: "near_mint" }), original, "condition aliases have identical publication meaning");
  assert.notEqual(fingerprint({ ...LISTING, start_price: 20 }), original);
  assert.notEqual(fingerprint({ ...LISTING, listing_description: "Changed description" }), original);
  assert.notEqual(fingerprint(LISTING, { ...ITEM, condition: "EX" }), original);
  assert.notEqual(fingerprint(LISTING, ITEM, [{ ...IMAGES[0], buffer: Buffer.from("different front") }, IMAGES[1]]), original);
  assert.notEqual(fingerprint(LISTING, ITEM, IMAGES, { ...CONFIG, postalCode: "T6C0A1" }), original);
  assert.notEqual(fingerprint(LISTING, ITEM, IMAGES, CONFIG, "account-2"), original);
  assert.notEqual(fingerprint(LISTING, ITEM, IMAGES, CONFIG, "account-1", { ...policies, returns: { ...policies.returns, returnsAccepted: true } }), original);
});

test("verification handles errors, warnings and all fee rows without claiming ItemID zero is live", () => {
  const result = parseVerification(verification('<Ack>Success</Ack><ItemID>0</ItemID><Fees><Fee><Name>InsertionFee</Name><Fee currencyID="CAD">0.25</Fee></Fee><Fee><Fee currencyID="CAD">0.0</Fee><Name>ListingFee</Name></Fee></Fees>'));
  assert.deepEqual(result, { ready: true, messages: [], fees: [{ name: "InsertionFee", currency: "CAD", amount: 0.25 }, { name: "ListingFee", currency: "CAD", amount: 0 }] });
  assert.equal("externalListingId" in result, false);
  const warning = parseVerification(verification('<Ack>Warning</Ack><Errors><SeverityCode>Warning</SeverityCode><ErrorCode>7</ErrorCode><LongMessage>Review &amp; confirm</LongMessage></Errors>'));
  assert.equal(warning.ready, true); assert.equal(warning.messages[0].message, "Review & confirm");
  for (const ack of ["Success", "Warning", "Failure", "PartialFailure"]) {
    assert.equal(parseVerification(verification(`<Ack>${ack}</Ack><Errors><SeverityCode>Error</SeverityCode><ShortMessage>Fix shipping</ShortMessage></Errors>`)).ready, false);
  }
  assert.equal(parseVerification(verification("<Ack>Failure</Ack>")).messages[0].severity, "error");
  assert.equal(parseVerification(verification("<Ack>Success</Ack><Message>Seller account needs attention</Message>")).messages[0].severity, "warning");
  for (const xml of ["", "<R><Ack>Success</Ack></R>", verification("<ItemID>0</ItemID>"), verification("<Ack>CustomCode</Ack>"), "<VerifyAddFixedPriceItemResponse><Ack>Success</Ack>"]) assert.throws(() => parseVerification(xml), (error) => error.status === 502);
});

test("account-bound policy and verification calls never publish and reject account changes around awaits", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "cardvault-ebay-definition-"));
  const previousPath = process.env.CARDVAULT_DB_PATH, originalFetch = globalThis.fetch;
  process.env.CARDVAULT_DB_PATH = join(dir, "cards.db");
  const { initDB, run } = await import("../src/server/database.js");
  const db = initDB();
  const save = (key, value) => run("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [key, value]);
  t.after(async () => {
    globalThis.fetch = originalFetch; db.close();
    if (previousPath === undefined) delete process.env.CARDVAULT_DB_PATH; else process.env.CARDVAULT_DB_PATH = previousPath;
    await rm(dir, { recursive: true, force: true });
  });
  for (const [key, value] of Object.entries({ ebay_app_id: "test-app", ebay_cert_id: "test-cert", ebay_ru_name: "test-runame", ebay_access_token: "test-access", ebay_refresh_token: "test-refresh", ebay_token_expires: new Date(Date.now() + 3600000).toISOString() })) save(key, value);
  const account = checkedAccount(), calls = [];
  assert.equal(account.environment, "sandbox");
  assert.doesNotMatch(account.key, /test-refresh|test-access/);
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, "error");
    if (url.includes("/sell/account/")) {
      const type = url.match(/\/(fulfillment|payment|return)_policy/)[1];
      return Response.json({ [`${type}Policies`]: allPolicies()[`${type}Policies`] });
    }
    assert.equal(options.headers["X-EBAY-API-CALL-NAME"], "VerifyAddFixedPriceItem");
    assert.doesNotMatch(options.body, /<AddFixedPriceItemRequest/);
    return new Response(verification("<Ack>Success</Ack><ItemID>0</ItemID>"));
  };
  assert.equal((await loadSellingPolicies()).fulfillmentPolicies.length, 1);
  assert.equal((await verifyListingDefinition("<Item/>", account.key)).ready, true);
  assert.equal(calls.length, 4);
  await assert.rejects(verifyListingDefinition("<Item/>", "old-account"), /account changed/);
  assert.equal(calls.length, 4, "known account mismatch makes no request");
  save("ebay_token_expires", "2000-01-01T00:00:00Z");
  globalThis.fetch = async (url) => {
    calls.push({ url });
    assert.match(url, /oauth2\/token$/);
    save("ebay_refresh_token", "another-account");
    return Response.json({ access_token: "refreshed", expires_in: 3600 });
  };
  await assert.rejects(verifyListingDefinition("<Item/>", account.key), /account changed/);
  assert.equal(calls.length, 5, "account changed during refresh sends no verification");
  const nextAccount = checkedAccount();
  globalThis.fetch = async () => {
    save("ebay_sandbox", "false");
    return new Response(verification("<Ack>Success</Ack>"));
  };
  await assert.rejects(verifyListingDefinition("<Item/>", nextAccount.key), /account changed/);
});
