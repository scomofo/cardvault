import test from "node:test";
import assert from "node:assert/strict";
import { normalizeConfig, choosePolicies, buildDefinition, contentFingerprint } from "../src/server/services/batchPublish/definition.js";
import { parseVerification } from "../src/server/integrations/ebay/batchPublishClient.js";

const config = { postalCode: "T5A 1A1", sport: "Hockey", manufacturer: "Upper Deck", fulfillmentPolicyId: "123", paymentPolicyId: "234", returnPolicyId: "345" };
const policySet = { fulfillmentPolicies: [{ fulfillmentPolicyId: "123", marketplaceId: "EBAY_CA", name: "Flat", shippingOptions: [{ optionType: "DOMESTIC", costType: "FLAT_RATE", shippingServices: [{ shippingServiceCode: "CA_RegularParcel", shippingCost: { value: "0", currency: "CAD" }, freeShipping: true }] }] }], paymentPolicies: [{ paymentPolicyId: "234", marketplaceId: "EBAY_CA", name: "Pay" }], returnPolicies: [{ returnPolicyId: "345", marketplaceId: "EBAY_CA", name: "Return" }] };
const listing = { id: "draft", card_id: "card", platform: "ebay", format: "fixed", quantity: 1, listing_title: 'Player & <card>', listing_description: "Photo details ]]> end", start_price: 10, shipping: 0 };
const item = { id: "card", type: "sports", name: "Player", condition: "near_mint" };
const urls = ["https://i.ebayimg.com/front.jpg", "https://i.ebayimg.com/back.jpg"];

test("batch config requires explicit policies, location and missing-card metadata defaults", () => {
  assert.equal(normalizeConfig(config).postalCode, "T5A1A1");
  for (const key of Object.keys(config)) assert.throws(() => normalizeConfig({ ...config, [key]: "" }));
  assert.throws(() => normalizeConfig({ ...config, paymentPolicyId: "123</PaymentProfileID>" }));
  assert.throws(() => normalizeConfig(null));
});
test("batch policy selection refuses currencies, variable rates, multiple services and stale policy IDs", () => {
  assert.equal(choosePolicies(config, policySet).shipping, 0);
  for (const mutate of [
    (policies) => { policies.fulfillmentPolicies[0].shippingOptions[0].costType = "CALCULATED"; },
    (policies) => { policies.fulfillmentPolicies[0].shippingOptions.push({ optionType: "INTERNATIONAL" }); },
    (policies) => { policies.fulfillmentPolicies[0].shippingOptions[0].rateTableId = "123"; },
    (policies) => { policies.fulfillmentPolicies[0].shippingOptions[0].shippingServices[0] = { shippingCost: { value: 1, currency: "USD" } }; },
    (policies) => { policies.paymentPolicies = []; },
    (policies) => { policies.fulfillmentPolicies[0].marketplaceId = "EBAY_US"; },
  ]) { const data = structuredClone(policySet); mutate(data); assert.throws(() => choosePolicies(config, data)); }
});
test("exact raw-card definition preserves free shipping through policy and escapes XML without grading claims", () => {
  const xml = buildDefinition(listing, item, config, choosePolicies(config, policySet), urls);
  assert.match(xml, /Player &amp; &lt;card&gt;/);
  assert.match(xml, /\]\]\]\]><!\[CDATA\[>/);
  assert.match(xml, /<ConditionID>4000<\/ConditionID>/);
  assert.match(xml, /<Name>40001<\/Name><Value>400010<\/Value>/);
  assert.match(xml, /<ShippingProfileID>123<\/ShippingProfileID>/);
  assert.match(xml, /<Value>Hockey<\/Value>/);
  assert.doesNotMatch(xml, /4\.99|PSA|<ShippingServiceCost>/);
  assert.throws(() => buildDefinition({ ...listing, shipping: 5 }, item, config, choosePolicies(config, policySet), urls), /policy charges/);
});
test("definition rejects unsupported cards, prices, quantities and missing photos", () => {
  const policies = choosePolicies(config, policySet);
  for (const patch of [{ format: "auction" }, { quantity: 2 }, { start_price: null }, { start_price: -1 }, { listing_title: "A".repeat(81) }]) assert.throws(() => buildDefinition({ ...listing, ...patch }, item, config, policies, urls));
  assert.throws(() => buildDefinition(listing, { ...item, type: "pokemon" }, config, policies, urls));
  assert.throws(() => buildDefinition(listing, { ...item, condition: "graded" }, config, policies, urls));
  assert.throws(() => buildDefinition(listing, item, config, policies, [urls[0]]));
});
test("verification ItemID zero is never treated as a published listing", () => {
  const result = parseVerification('<VerifyAddFixedPriceItemResponse><Ack>Warning</Ack><ItemID>0</ItemID><Errors><SeverityCode>Warning</SeverityCode><ErrorCode>1</ErrorCode><LongMessage>A &amp; B</LongMessage></Errors><Fees><Name>InsertionFee</Name><Fee currencyID="CAD">0.30</Fee></Fees></VerifyAddFixedPriceItemResponse>');
  assert.equal(result.ok, true); assert.equal(result.externalId, undefined);
  assert.deepEqual(result.fees, [{ name: "InsertionFee", currency: "CAD", amount: .3 }]);
  assert.equal(result.messages[0].message, "A & B");
});
test("verification fails closed on missing ack, wrong root and error-severity responses", () => {
  for (const xml of ["", "<html>ok</html>", "<VerifyAddFixedPriceItemResponse><ItemID>0</ItemID></VerifyAddFixedPriceItemResponse>"]) assert.throws(() => parseVerification(xml));
  assert.equal(parseVerification('<VerifyAddFixedPriceItemResponse><Ack>Success</Ack><Errors><SeverityCode>Error</SeverityCode><ShortMessage>Wrong category</ShortMessage></Errors></VerifyAddFixedPriceItemResponse>').ok, false);
  assert.equal(parseVerification('<VerifyAddFixedPriceItemResponse><Ack>Failure</Ack></VerifyAddFixedPriceItemResponse>').ok, false);
});
test("fingerprints cover content, actual photo bytes, policies, account and location but not publish claims", () => {
  const images = [{ mime: "image/jpeg", buffer: Buffer.from("front") }, { mime: "image/jpeg", buffer: Buffer.from("back") }];
  const policies = choosePolicies(config, policySet);
  const fingerprint = contentFingerprint(listing, item, images, config, "account-a", policies);
  assert.equal(fingerprint, contentFingerprint({ ...listing, publish_status: "publishing" }, item, images, config, "account-a", policies));
  for (const [l, i, photos, c, key, p] of [
    [{ ...listing, start_price: 11 }, item, images, config, "account-a", policies],
    [listing, { ...item, condition: "excellent" }, images, config, "account-a", policies],
    [listing, item, [{ ...images[0], buffer: Buffer.from("retake") }, images[1]], config, "account-a", policies],
    [listing, item, images, { ...config, postalCode: "T5A1A2" }, "account-a", policies],
    [listing, item, images, config, "account-b", policies],
    [listing, item, images, config, "account-a", { ...policies, payment: { changed: true } }],
  ]) assert.notEqual(fingerprint, contentFingerprint(l, i, photos, c, key, p));
});
