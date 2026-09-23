import test from "node:test";
import assert from "node:assert/strict";
import { checkedEbayPublishRequest, formatCheckedAmount, freshEbayCheck, sellingSetupComplete } from "../src/lib/ebayReviewState.js";
import { ebaySellingAPI, listingsAPI, marketplacesAPI } from "../src/lib/api.js";

const NOW = Date.parse("2026-09-23T12:00:00Z");
const check = { id: "check-1", ready: true, environment: "sandbox", expiresAt: "2026-09-23T12:05:00Z" };

test("checked publication requires explicit approval of a fresh same-environment check", () => {
  assert.equal(freshEbayCheck(check, "sandbox", NOW), true);
  assert.equal(freshEbayCheck(check, "production", NOW), false);
  assert.equal(freshEbayCheck(check, "sandbox", Date.parse(check.expiresAt)), false);
  assert.equal(freshEbayCheck({ ...check, ready: false }, "sandbox", NOW), false);
  assert.equal(freshEbayCheck({ ...check, expiresAt: "invalid" }, "sandbox", NOW), false);
  assert.equal(freshEbayCheck({ ...check, id: "" }, "sandbox", NOW), false);
  assert.equal(freshEbayCheck(null, "sandbox", NOW), false);
  const input = { check, environment: "sandbox", confirmed: true, listingId: "listing-1", now: NOW };
  assert.deepEqual(checkedEbayPublishRequest(input), { listingId: "listing-1", marketplace: "ebay", checkId: "check-1", confirmChecked: true, environment: "sandbox" });
  assert.throws(() => checkedEbayPublishRequest({ ...input, confirmed: false }), /fresh eBay check/);
  assert.throws(() => checkedEbayPublishRequest({ ...input, environment: "production" }), /fresh eBay check/);
  assert.throws(() => checkedEbayPublishRequest({ ...input, now: Date.parse(check.expiresAt) }), /fresh eBay check/);
});

test("saved selling defaults require policies and accurate card and ship-from fields", () => {
  const config = { fulfillmentPolicyId: "shipping-1", paymentPolicyId: "payment-1", returnPolicyId: "returns-1", postalCode: "T5J 0N3", sport: "Ice Hockey", manufacturer: "Upper Deck" };
  assert.equal(sellingSetupComplete(config), true);
  for (const key of Object.keys(config)) assert.equal(sellingSetupComplete({ ...config, [key]: " " }), false);
  assert.equal(sellingSetupComplete(null), false);
});

test("checked money renders zero honestly and does not invent missing fee estimates", () => {
  assert.equal(formatCheckedAmount(0), "$0.00");
  assert.equal(formatCheckedAmount("2.50"), "$2.50");
  assert.equal(formatCheckedAmount(null), "Not supplied");
  assert.equal(formatCheckedAmount(""), "Not supplied");
  assert.equal(formatCheckedAmount("bad"), "Not supplied");
});

test("selling APIs separate read-only settings load, explicit account check, and checked publication", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (path, options) => {
    calls.push({ path, method: options.method, body: options.body && JSON.parse(options.body) });
    return new Response("{}", { headers: { "Content-Type": "application/json" } });
  };
  await ebaySellingAPI.setup();
  await ebaySellingAPI.policies();
  await ebaySellingAPI.saveSetup({ postalCode: "T5J 0N3" });
  await listingsAPI.checkEbay("draft/1");
  await listingsAPI.recoverEbay("draft/1");
  const request = checkedEbayPublishRequest({ check, environment: "sandbox", confirmed: true, listingId: "draft/1", now: NOW });
  await marketplacesAPI.publish(request);
  assert.deepEqual(calls, [
    { path: "/api/ebay/selling-setup", method: "GET", body: undefined },
    { path: "/api/ebay/selling-policies", method: "POST", body: {} },
    { path: "/api/ebay/selling-setup", method: "PUT", body: { config: { postalCode: "T5J 0N3" } } },
    { path: "/api/listings/draft%2F1/ebay-check", method: "POST", body: {} },
    { path: "/api/listings/draft%2F1/ebay-recover", method: "POST", body: { confirmNotPublished: true } },
    { path: "/api/marketplaces/publish", method: "POST", body: request },
  ]);
});
