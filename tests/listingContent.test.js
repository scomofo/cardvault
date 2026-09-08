import test from "node:test";
import assert from "node:assert/strict";
import { buildDraftContent, draftContentIssues, draftReviewValues, ungradedCardCondition, changeDraftReviewField } from "../src/lib/listingContent.js";
import { saveDraftReviewWithRecovery } from "../src/lib/draftReview.js";

test("draft copy uses card facts without adding shipping, return or grading promises", () => {
  const card = { name: "Wayne Gretzky", set: "O-Pee-Chee", year: 1980, number: "250", parallel: "Base", condition: "gem_mint", notes: "Private cost basis $10" };
  const content = buildDraftContent(card);
  assert.equal(content.listingTitle, "1980 O-Pee-Chee Wayne Gretzky #250 Base");
  assert.match(content.listingDescription, /Ungraded.*Near Mint or Better/);
  assert.doesNotMatch(content.listingDescription, /top loader|combined shipping|returns|PSA|Private cost|Gem Mint 10/i);
  assert.equal(buildDraftContent({ name: "A".repeat(100) }).listingTitle.length, 80);
  assert.deepEqual(buildDraftContent({ name: "Card", card_set: "Set", card_number: 0 }), buildDraftContent({ name: "Card", set: "Set", number: 0 }));
});

test("old drafts get complete editable defaults while saved edits and zero shipping survive", () => {
  const old = draftReviewValues({ startPrice: 10, shipping: 0 }, { name: "Card", condition: "NM" });
  assert.equal(old.listingTitle, "Card");
  assert.ok(old.listingDescription);
  assert.equal(old.shipping, "0");
  assert.equal(old.condition, "near_mint");
  const edited = draftReviewValues({ listingTitle: "My title", listingDescription: "My description", shipping: 0 }, { name: "Card" });
  assert.equal(edited.listingTitle, "My title");
  assert.equal(edited.listingDescription, "My description");
  const blank = draftReviewValues({ listingTitle: "", listingDescription: "  ", shipping: 0 }, { name: "Card", condition: "NM" });
  assert.equal(blank.listingTitle, "Card");
  const changed = changeDraftReviewField(blank, "condition", "excellent");
  assert.match(changed.listingDescription, /Seller-assessed condition: Excellent/);
  assert.doesNotMatch(changed.listingDescription, /Near Mint/);
  assert.equal(changeDraftReviewField({ ...blank, listingDescription: "My custom description" }, "condition", "poor").listingDescription, "My custom description");
});

test("publication content validation rejects unknown conditions, absent prices and blank descriptions", () => {
  const values = { listingTitle: "Card", listingDescription: "Condition visible in photos", startPrice: 10, shipping: 0 };
  assert.deepEqual(draftContentIssues(values, { name: "Card", condition: "NM" }), []);
  assert.equal(draftContentIssues({ ...values, shipping: "" }, { name: "Card", condition: "NM" }).length, 1);
  assert.ok(draftContentIssues({ ...values, startPrice: 0.001 }, { name: "Card", condition: "NM" }).length);
  assert.ok(draftContentIssues({ ...values, listingDescription: " " }, { name: "Card", condition: "unknown" }).length >= 2);
  assert.equal(ungradedCardCondition("MT").descriptor, "400010");
  assert.equal(ungradedCardCondition("unknown"), null);
});

test("offline draft recovery creates only missing records and preserves IDs", async () => {
  const calls = [];
  let exists = false;
  const missing = () => Object.assign(new Error("Missing"), { status: 404 });
  const options = { listing: { id: "draft", cardId: "card" }, card: { id: "card", name: "Card" }, values: {},
    listingsAPI: { saveReview: async (id) => { calls.push(`review:${id}`); if (!exists) throw missing(); return { saved: true }; }, create: async (listing) => { calls.push(`listing:${listing.id}`); exists = true; } },
    itemsAPI: { get: async () => { throw missing(); }, create: async (card) => { calls.push(`item:${card.id}`); return card; } },
  };
  assert.deepEqual(await saveDraftReviewWithRecovery(options), { saved: true });
  assert.deepEqual(calls, ["review:draft", "item:card", "listing:draft", "review:draft"]);
});

test("a timeout or sold server item never triggers recovery writes", async () => {
  const noWrite = () => assert.fail("Must not create a replacement");
  const options = { listing: { id: "draft" }, card: { id: "card" }, values: {}, listingsAPI: { saveReview: async () => { throw new Error("Timeout"); }, create: noWrite }, itemsAPI: { get: async () => ({ status: "sold" }), create: noWrite } };
  await assert.rejects(saveDraftReviewWithRecovery(options), /Timeout/);
  options.listingsAPI.saveReview = async () => { throw Object.assign(new Error("Missing"), { status: 404 }); };
  await assert.rejects(saveDraftReviewWithRecovery(options), /already sold/);
});
