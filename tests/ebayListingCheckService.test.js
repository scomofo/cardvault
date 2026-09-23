import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initDB, get, run } from "../src/server/database.js";
import { saveImageFile } from "../src/server/services/imageStore.js";
import { createEbayListingCheckService } from "../src/server/services/listings/ebayListingCheckService.js";
import { publishListingToMarketplace, recoverEbayDraft } from "../src/server/services/marketplaces/publishService.js";
import { getMarketplaceAdapter } from "../src/server/integrations/marketplaces/marketplaceRegistry.js";

const config = { fulfillmentPolicyId: "101", paymentPolicyId: "202", returnPolicyId: "303", postalCode: "t5j 0n3", sport: "Ice Hockey", manufacturer: "Upper Deck" };
const policyFixture = () => ({
  fulfillmentPolicies: [{ fulfillmentPolicyId: "101", marketplaceId: "EBAY_CA", name: "Canada flat rate", shippingOptions: [{ optionType: "DOMESTIC", costType: "FLAT_RATE", shippingServices: [{ shippingServiceCode: "CA_RegularParcel", shippingCost: { currency: "CAD", value: "2.50" } }] }] }],
  paymentPolicies: [{ paymentPolicyId: "202", marketplaceId: "EBAY_CA", name: "Managed payments" }],
  returnPolicies: [{ returnPolicyId: "303", marketplaceId: "EBAY_CA", name: "30 day returns", returnPeriod: { value: 30, unit: "DAY" } }],
});
const options = (receipt) => ({ checkId: receipt.id, confirmChecked: true, environment: receipt.environment });

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "cardvault-ebay-check-service-"));
  const previousPath = process.env.CARDVAULT_DB_PATH, originalFetch = globalThis.fetch;
  process.env.CARDVAULT_DB_PATH = join(dir, "cards.db");
  const db = initDB();
  globalThis.fetch = () => { throw new Error("Unexpected outbound request in listing-check test"); };
  t.after(async () => {
    db.close();
    globalThis.fetch = originalFetch;
    if (previousPath === undefined) delete process.env.CARDVAULT_DB_PATH;
    else process.env.CARDVAULT_DB_PATH = previousPath;
    await rm(dir, { recursive: true, force: true });
  });
  saveImageFile("front", "data:image/png;base64,ZnJvbnQ=");
  saveImageFile("back", "data:image/png;base64,YmFjaw==");
  run("INSERT INTO user_items(id,name,condition,front_img_id,back_img_id) VALUES (?,?,?,?,?)", ["card", "Reviewed hockey card", "excellent", "front", "back"]);
  run("INSERT INTO listings(id,card_id,platform,status,listing_title,listing_description,start_price,shipping) VALUES (?,?,?,?,?,?,?,?)", ["draft", "card", "ebay", "draft", "Reviewed card title", "Photographed card, seller-assessed condition.", 15, 2.5]);
  const state = { account: { key: "account-A", environment: "sandbox" }, connected: true, policies: policyFixture(), now: Date.now(), calls: [], verification: { ready: true, messages: [], fees: [{ name: "InsertionFee", amount: 0, currency: "CAD" }] } };
  const service = createEbayListingCheckService({
    account: () => ({ ...state.account }),
    status: () => ({ connected: state.connected, sandbox: state.account.environment === "sandbox" }),
    policies: async () => { state.calls.push("policies"); await state.onPolicies?.(); return structuredClone(state.policies); },
    upload: async (buffer, mime) => {
      state.calls.push({ operation: "upload", bytes: buffer.toString(), mime });
      await state.onUpload?.();
      return `https://pictures.example/${buffer.toString()}.png`;
    },
    verify: async (xml, accountKey) => {
      state.calls.push({ operation: "verify", xml, accountKey });
      await state.onVerify?.();
      return structuredClone(state.verification);
    },
    now: () => state.now,
  });
  await service.saveSetup(config);
  state.calls.length = 0;
  return { service, state };
}

test("selling setup is normalized, remembered only for its account, and invalidates changed checks", async (t) => {
  const { service, state } = await fixture(t);
  assert.deepEqual(service.setup(), { connected: true, environment: "sandbox", config: { ...config, postalCode: "T5J0N3" } });
  const receipt = await service.check("draft");
  await service.saveSetup(config);
  assert.ok(get("SELECT id FROM ebay_listing_checks WHERE id=?", [receipt.id]), "saving unchanged preferences preserves the check");
  await service.saveSetup({ ...config, postalCode: "T6G2R3" });
  assert.equal(get("SELECT id FROM ebay_listing_checks WHERE id=?", [receipt.id]), undefined);
  state.account.key = "account-B";
  assert.equal(service.setup().config, null);
  await assert.rejects(service.check("draft"), /Save your eBay selling policies/);
  state.connected = false;
  assert.deepEqual(service.setup(), { connected: false, environment: "sandbox", config: null });
});

test("both stored photos and matching shipping are required before any uploads", async (t) => {
  const { service, state } = await fixture(t);
  run("UPDATE user_items SET back_img_id=NULL WHERE id='card'");
  await assert.rejects(service.check("draft"), /both front and back photos/);
  assert.deepEqual(state.calls, []);
  run("UPDATE user_items SET back_img_id='back' WHERE id='card'");
  run("UPDATE listings SET shipping=0 WHERE id='draft'");
  await assert.rejects(service.check("draft"), /selected policy charges/);
  assert.equal(state.calls.some((call) => call.operation === "upload"), false);
  assert.equal(get("SELECT COUNT(*) AS count FROM ebay_listing_checks").count, 0);
});

test("checking produces a review snapshot and exact XML but never publishes or claims a listing", async (t) => {
  const { service, state } = await fixture(t);
  const receipt = await service.check("draft");
  assert.equal(receipt.ready, true);
  assert.equal(receipt.environment, "sandbox");
  assert.equal(Date.parse(receipt.expiresAt), state.now + 15 * 60 * 1000);
  assert.equal(receipt.review.title, "Reviewed card title");
  assert.equal(receipt.review.price, 15);
  assert.equal(receipt.review.shipping, 2.5);
  assert.equal(receipt.review.postalCode, "T5J0N3");
  assert.deepEqual(receipt.review.pictureUrls, ["https://pictures.example/front.png", "https://pictures.example/back.png"]);
  assert.deepEqual(receipt.fees, state.verification.fees);
  const verify = state.calls.find((call) => call.operation === "verify");
  assert.equal(verify.accountKey, "account-A");
  assert.match(verify.xml, /<ShippingProfileID>101<\/ShippingProfileID>/);
  assert.match(verify.xml, /<StartPrice currencyID="CAD">15.00<\/StartPrice>/);
  assert.equal(get("SELECT item_xml FROM ebay_listing_checks WHERE id=?", [receipt.id]).item_xml, verify.xml);
  assert.equal(get("SELECT COUNT(*) AS count FROM listing_channels").count, 0);
  assert.deepEqual(get("SELECT status,publish_status,external_listing_id FROM listings WHERE id='draft'"), { status: "draft", publish_status: "draft", external_listing_id: null });
});

test("provider issues remain visible and unsuccessful checks cannot authorize publication", async (t) => {
  const { service, state } = await fixture(t);
  state.verification = { ready: false, messages: [{ code: "21919303", severity: "error", message: "Missing item specifics" }], fees: [] };
  const receipt = await service.check("draft");
  assert.equal(receipt.ready, false);
  assert.deepEqual(receipt.messages, state.verification.messages);
  await assert.rejects(service.authorize("draft", options(receipt)), /successful check/);
  assert.equal(get("SELECT used_at FROM ebay_listing_checks WHERE id=?", [receipt.id]).used_at, null);
});

test("authorization returns the verified XML and consumes it once immediately before sending", async (t) => {
  const { service, state } = await fixture(t);
  const receipt = await service.check("draft");
  run("INSERT INTO listing_channels(id,listing_id,marketplace,status) VALUES ('claim','draft','ebay','publishing')");
  run("UPDATE listings SET publish_status='publishing' WHERE id='draft'");
  const checked = await service.authorize("draft", options(receipt));
  assert.equal(checked.xml, state.calls.find((call) => call.operation === "verify").xml);
  assert.equal(get("SELECT used_at FROM ebay_listing_checks WHERE id=?", [receipt.id]).used_at, null);
  checked.beforeSend();
  assert.equal(get("SELECT used_at FROM ebay_listing_checks WHERE id=?", [receipt.id]).used_at, state.now);
  assert.throws(() => checked.beforeSend(), /changed/);
  await assert.rejects(service.authorize("draft", options(receipt)), /used or expired/);
});

test("missing approval, wrong check or environment, and expired checks never authorize", async (t) => {
  const { service, state } = await fixture(t);
  const receipt = await service.check("draft");
  for (const input of [{}, { ...options(receipt), checkId: "wrong" }, { ...options(receipt), confirmChecked: false }, { ...options(receipt), environment: "production" }]) {
    await assert.rejects(service.authorize("draft", input), (error) => error.code === "EBAY_PREPARATION_FAILED");
  }
  assert.equal(get("SELECT used_at FROM ebay_listing_checks WHERE id=?", [receipt.id]).used_at, null);
  state.now = Date.parse(receipt.expiresAt);
  await assert.rejects(service.authorize("draft", options(receipt)), /expired/);
});

test("price, photo bytes, account, policy and setup changes invalidate checks", async (t) => {
  const { service, state } = await fixture(t);
  const attempts = [
    () => run("UPDATE listings SET start_price=start_price+1 WHERE id='draft'"),
    () => saveImageFile("front", "data:image/png;base64,bmV3LWZyb250"),
    () => { state.policies.returnPolicies[0].returnPeriod.value = 60; },
    () => { state.account.key = "account-B"; },
    () => service.saveSetup({ ...config, sport: "Baseball" }),
  ];
  for (const mutate of attempts) {
    state.account.key = "account-A";
    await service.saveSetup(config);
    const receipt = await service.check("draft");
    await mutate();
    await assert.rejects(service.authorize("draft", options(receipt)), (error) => error.code === "EBAY_PREPARATION_FAILED");
    assert.equal(get("SELECT used_at FROM ebay_listing_checks WHERE id=?", [receipt.id])?.used_at ?? null, null);
    assert.equal(get("SELECT COUNT(*) AS count FROM listing_channels").count, 0);
  }
});

test("mutations during upload or verification cannot produce an approved receipt", async (t) => {
  const { service, state } = await fixture(t);
  state.onUpload = () => run("UPDATE listings SET start_price=start_price+1 WHERE id='draft'");
  await assert.rejects(service.check("draft"), /changed during checking/);
  assert.equal(state.calls.some((call) => call.operation === "verify"), false);
  state.onUpload = null;
  state.onVerify = () => { state.policies.returnPolicies[0].name = "Changed policy"; };
  await assert.rejects(service.check("draft"), /changed during checking/);
  assert.equal(get("SELECT COUNT(*) AS count FROM ebay_listing_checks").count, 0);
});

test("last-moment local edits after authorization block the outgoing create request", async (t) => {
  const { service } = await fixture(t);
  const receipt = await service.check("draft"), checked = await service.authorize("draft", options(receipt));
  run("UPDATE listings SET listing_title='Changed after approval' WHERE id='draft'");
  assert.throws(() => checked.beforeSend(), /changed/);
  assert.equal(get("SELECT used_at FROM ebay_listing_checks WHERE id=?", [receipt.id]).used_at, null);
});

test("listing-level provider evidence after checking blocks approval even without a matching channel", async (t) => {
  const { service } = await fixture(t);
  const receipt = await service.check("draft");
  run("UPDATE listings SET external_listing_id='confirmed-provider-id' WHERE id='draft'");
  await assert.rejects(service.authorize("draft", options(receipt)), (error) => error.code === "EBAY_PREPARATION_FAILED");
  run("UPDATE listings SET external_listing_id=NULL WHERE id='draft'");
  for (const status of ["publish_unknown", "needs_review", "sold", "ended"]) {
    run("UPDATE listings SET publish_status=? WHERE id='draft'", [status]);
    await assert.rejects(service.authorize("draft", options(receipt)), (error) => error.code === "EBAY_PREPARATION_FAILED");
  }
  assert.equal(get("SELECT used_at FROM ebay_listing_checks WHERE id=?", [receipt.id]).used_at, null);
  assert.equal(get("SELECT COUNT(*) AS count FROM listing_channels").count, 0);
});

test("publication failing its final approval guard cannot overwrite a concurrent sale", async (t) => {
  const { service, state } = await fixture(t);
  const adapter = getMarketplaceAdapter("ebay");
  const originalPublish = adapter.publish, originalConnected = adapter.isConnected;
  t.after(() => { adapter.publish = originalPublish; adapter.isConnected = originalConnected; });
  adapter.isConnected = () => true;
  let createCalls = 0;
  adapter.publish = async (listing, approval) => {
    const checked = await service.authorize(listing.id, approval);
    checked.beforeSend();
    createCalls++;
    throw new Error("The simulated create request must never be reached");
  };
  for (const soldEvidence of ["listing", "channel"]) {
    state.onPolicies = null;
    run("DELETE FROM listing_channels WHERE listing_id='draft'");
    run("UPDATE listings SET status='draft',publish_status='draft',external_listing_id=NULL WHERE id='draft'");
    const receipt = await service.check("draft");
    let releasePolicies, enterPolicies;
    const entered = new Promise((resolve) => { enterPolicies = resolve; });
    state.onPolicies = () => new Promise((resolve) => { releasePolicies = resolve; enterPolicies(); });
    const publishing = publishListingToMarketplace("draft", "ebay", options(receipt));
    await entered;
    assert.equal(get("SELECT status FROM listing_channels WHERE listing_id='draft'").status, "publishing");
    if (soldEvidence === "listing") {
      run("UPDATE listings SET status='sold',publish_status='sold',sold_price=15 WHERE id='draft'");
    } else {
      run("UPDATE listing_channels SET status='sold',external_listing_id='confirmed-sale-id' WHERE listing_id='draft'");
    }
    releasePolicies();
    await assert.rejects(publishing, (error) => error.code === "EBAY_PREPARATION_FAILED");
    if (soldEvidence === "listing") {
      assert.deepEqual(get("SELECT status,publish_status,sold_price FROM listings WHERE id='draft'"), { status: "sold", publish_status: "sold", sold_price: 15 });
    } else {
      assert.deepEqual(get("SELECT status,external_listing_id FROM listing_channels WHERE listing_id='draft'"), { status: "sold", external_listing_id: "confirmed-sale-id" });
    }
    assert.equal(get("SELECT used_at FROM ebay_listing_checks WHERE id=?", [receipt.id]).used_at, null);
  }
  assert.equal(createCalls, 0);
});

test("publication recovery requires explicit confirmation and preserves active claims, real IDs and sold cards", async (t) => {
  const { service } = await fixture(t);
  const receipt = await service.check("draft");
  run("INSERT INTO listing_channels(id,listing_id,marketplace,status) VALUES ('claim','draft','ebay','publishing')");
  run("UPDATE listings SET publish_status='publishing' WHERE id='draft'");
  assert.throws(() => recoverEbayDraft("draft", false), /Confirm in Seller Hub/);
  assert.throws(() => recoverEbayDraft("draft", true), /still in progress/);
  run("UPDATE listing_channels SET status='publish_unknown',external_listing_id='real-provider-id' WHERE id='claim'");
  assert.throws(() => recoverEbayDraft("draft", true), /confirmed listing ID/);
  run("UPDATE listing_channels SET external_listing_id=NULL WHERE id='claim'");
  run("UPDATE user_items SET status='sold' WHERE id='card'");
  assert.throws(() => recoverEbayDraft("draft", true), /missing or sold/);
  assert.ok(get("SELECT id FROM ebay_listing_checks WHERE id=?", [receipt.id]));
  run("UPDATE user_items SET status='inventory' WHERE id='card'");
  const recovered = recoverEbayDraft("draft", true);
  assert.equal(recovered.status, "draft");
  assert.equal(recovered.publish_status, "draft");
  assert.equal(get("SELECT status FROM listing_channels WHERE id='claim'").status, "draft");
  assert.equal(get("SELECT id FROM ebay_listing_checks WHERE id=?", [receipt.id]), undefined);
  assert.equal(get("SELECT COUNT(*) AS count FROM listing_channel_events WHERE event_type='publication_review'").count, 1);
});
