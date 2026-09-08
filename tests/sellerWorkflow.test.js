import test from "node:test";
import assert from "node:assert/strict";
import { deriveSellerWorkflow, isDraftSaveRunning, listingPreparationIssue, proposedListingPrice, saveReviewedListingDrafts } from "../src/lib/sellerWorkflow.js";
import { CONDITIONS } from "../src/lib/constants.js";

const card = (id, mid = 20) => ({ id, name: `Card ${id}`, status: "inventory", condition: CONDITIONS[0].v, priceEstimate: { mid } });

test("seller work excludes reserved and sold cards and prioritizes paid shipping", () => {
  const result = deriveSellerWorkflow({
    catalog: [card("a"), card("b", 60), card("c"), { ...card("d"), status: "sold" }, card("e"), card("f"), card("g"), { ...card("hold"), status: "hold" }],
    listings: [{ id: "draft", cardId: "c", status: "draft" }, { id: "sold", cardId: "e", status: "sold" }, { id: "ended", cardId: "f", status: "ended" }],
    orders: [{ id: "paid", itemId: "g", paymentStatus: "paid", fulfillmentStatus: "label_purchased" }, { id: "unpaid", paymentStatus: "awaiting_payment", fulfillmentStatus: "pending" }, { id: "shipped", paymentStatus: "paid", fulfillmentStatus: "shipped" }, { id: "cancelled", paymentStatus: "paid", fulfillmentStatus: "cancelled" }, { id: "refunded", paymentStatus: "refunded", fulfillmentStatus: "pending" }],
  });
  assert.deepEqual(result.prepare.map((entry) => entry.id), ["b", "a", "f"]);
  assert.deepEqual(result.ship.map((entry) => entry.id), ["paid"]);
  assert.deepEqual(result.awaitingPayment.map((entry) => entry.id), ["unpaid"]);
  assert.equal(result.nextGroup, "ship");
});

test("drafts and unconfirmed publication never count as live", () => {
  const result = deriveSellerWorkflow({ listings: [
    { id: "unknown", status: "draft", publishStatus: "publish_unknown" },
    { id: "stub", status: "active", platform: "ebay", publishStatus: "active", externalListingId: "ebay-stub" },
    { id: "live", status: "active", publishStatus: "active", externalListingId: "12345678" },
    { id: "busy", status: "draft", publishStatus: "publishing" },
    { id: "handoff", status: "active", publishStatus: "handoff_ready" },
  ] });
  assert.equal(result.nextGroup, "review");
  assert.deepEqual(result.live.map((entry) => entry.id), ["live"]);
  assert.deepEqual(result.drafts.map((entry) => entry.id), ["stub"]);
  assert.equal(result.publishing.length, 1);
  assert.equal(result.handoff.length, 1);
});

test("price suggestions retain unknown values and preparation requires inspected condition", () => {
  for (const value of [undefined, null, "", -1, 0, "bad", Infinity]) assert.equal(proposedListingPrice({ priceEstimate: { mid: value } }), "");
  assert.equal(proposedListingPrice(card("a", 31.5)), "31.50");
  assert.match(listingPreparationIssue({ ...card("a"), condition: "" }, 20), /condition/);
  assert.match(listingPreparationIssue(card("a"), ""), /price/);
  assert.match(listingPreparationIssue(card("a"), 0.001), /price/);
  assert.match(listingPreparationIssue({ ...card("a"), name: " " }, 20), /identity/);
});

test("draft retry ids are durable before requests and survive a new component session", async () => {
  let checkpoint;
  let fail = true;
  const seen = [];
  const options = {
    selections: [{ cardId: "a", price: 25, condition: "excellent" }], catalog: [{ ...card("a"), condition: "" }], listings: [], shipping: "0", ids: new Map(), idFactory: () => "durable-draft", useServer: true,
    persistIds: async (entries) => { checkpoint = JSON.stringify(entries); },
    itemsAPI: { create: async (item) => { assert.ok(checkpoint); assert.equal(item.condition, "excellent"); } },
    listingsAPI: { create: async (listing) => { seen.push(listing.id); if (fail) throw new Error("Lost response"); return listing; } },
    onSaved: () => {},
  };
  assert.equal((await saveReviewedListingDrafts(options)).failed.length, 1);
  fail = false;
  const resumed = await saveReviewedListingDrafts({ ...options, ids: new Map(JSON.parse(checkpoint)), idFactory: () => assert.fail("Must reuse persisted id") });
  assert.equal(resumed.saved.length, 1);
  assert.deepEqual(seen, ["durable-draft", "durable-draft"]);
});

test("failed retry checkpoint prevents writes and local save errors retain the draft for retry", async () => {
  const base = { selections: [{ cardId: "a", price: 25 }], catalog: [card("a")], listings: [], shipping: "0", ids: new Map(), idFactory: () => "local-draft", useServer: true,
    persistIds: () => { throw new Error("Storage full"); },
    itemsAPI: { create: () => assert.fail("No request without retry checkpoint") }, onSaved: () => assert.fail("Not saved"),
  };
  const blocked = await saveReviewedListingDrafts(base);
  assert.equal(blocked.saved.length, 0);
  assert.match(blocked.failed[0].error, /Storage full/);
  const local = await saveReviewedListingDrafts({ ...base, useServer: false, persistIds: () => {}, onSaved: () => { throw new Error("Storage full"); } });
  assert.equal(local.saved.length, 0);
  assert.equal(local.failed[0].cardId, "a");
  assert.equal(base.ids.get("a"), "local-draft");
});

test("deliberately relisting an ended draft uses a new id", async () => {
  const result = await saveReviewedListingDrafts({ selections: [{ cardId: "a", price: 25 }], catalog: [card("a")], listings: [{ id: "old", cardId: "a", status: "ended" }], shipping: "0", ids: new Map([["a", "old"]]), idFactory: () => "new", useServer: false, onSaved: () => {} });
  assert.equal(result.saved[0].id, "new");
});

test("navigation cannot start overlapping saves and pauses subsequent cards", async () => {
  let release;
  let mounted = true;
  const gate = new Promise((resolve) => { release = resolve; });
  const saved = [];
  const options = { selections: [{ cardId: "a", price: 25 }, { cardId: "b", price: 25 }], catalog: [card("a"), card("b")], listings: [], shipping: "0", ids: new Map(), idFactory: () => "first", useServer: false,
    shouldContinue: () => mounted, persistIds: () => gate, onSaved: (listing) => saved.push(listing),
  };
  const running = saveReviewedListingDrafts(options);
  assert.equal(isDraftSaveRunning(), true);
  await assert.rejects(saveReviewedListingDrafts({ ...options, ids: new Map() }), /still finishing/);
  mounted = false;
  release();
  const result = await running;
  assert.equal(result.failed[0].cardId, "b");
  assert.equal(saved.length, 1);
  assert.equal(isDraftSaveRunning(), false);
});

test("partial batch saves persist items before drafts and retry the same listing id", async () => {
  const ids = new Map();
  const calls = [];
  let fail = true;
  let counter = 0;
  const options = {
    selections: [{ cardId: "a", price: "25" }, { cardId: "b", price: "40" }], catalog: [card("a"), card("b")], listings: [], shipping: "5", ids,
    idFactory: () => `draft-${++counter}`, useServer: true,
    itemsAPI: { create: async (item) => calls.push(`item:${item.id}`) },
    listingsAPI: { create: async (listing) => { calls.push(`listing:${listing.id}`); if (listing.cardId === "b" && fail) throw new Error("Response lost"); } },
    onSaved: async (listing) => calls.push(`saved:${listing.id}`),
  };
  const first = await saveReviewedListingDrafts(options);
  assert.equal(first.saved.length, 1);
  assert.equal(first.failed.length, 1);
  assert.deepEqual(calls, ["item:a", "listing:draft-1", "saved:draft-1", "item:b", "listing:draft-2"]);
  fail = false;
  const retry = await saveReviewedListingDrafts({ ...options, listings: first.saved });
  assert.equal(retry.saved[0].id, "draft-2");
  assert.equal(retry.saved[0].status, "draft");
  assert.equal(retry.saved[0].publishStatus, "draft");
  assert.equal(counter, 2);
});

test("batch validation does not create drafts for reserved, unreviewed, or invalid rows", async () => {
  const saved = [];
  const result = await saveReviewedListingDrafts({
    selections: [{ cardId: "a", price: 30 }, { cardId: "b", price: 30 }, { cardId: "c", price: 0 }, { cardId: "d", price: 45 }, { cardId: "d", price: 45 }],
    catalog: [card("a"), { ...card("b"), condition: "" }, card("c"), card("d")], listings: [{ id: "existing", cardId: "a", status: "draft" }],
    shipping: "0", ids: new Map(), idFactory: () => "new", useServer: false, onSaved: (listing) => saved.push(listing),
  });
  assert.equal(result.failed.length, 3);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].cardId, "d");
  assert.equal(saved[0].shipping, 0);
});
