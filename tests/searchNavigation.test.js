import test from "node:test";
import assert from "node:assert/strict";
import {
  navigationTargetForQueue,
  navigationTargetForSearchResult,
} from "../src/lib/search/searchNavigation.js";

test("search navigation sends watchlist results to the watch tools tab", () => {
  assert.deepEqual(
    navigationTargetForSearchResult("watch"),
    { view: "tools", toolsTab: "watch" },
  );
});

test("search navigation sends trade results to the trade tools tab", () => {
  assert.deepEqual(
    navigationTargetForSearchResult("trade"),
    { view: "tools", toolsTab: "trade" },
  );
});

test("search navigation preserves existing top-level destinations for cards and sales data", () => {
  assert.deepEqual(navigationTargetForSearchResult("card"), { view: "cards" });
  assert.deepEqual(navigationTargetForSearchResult("sale"), { view: "sales" });
  assert.deepEqual(navigationTargetForSearchResult("order"), { view: "sales" });
});

test("action queue navigation sends order and listing work to sales", () => {
  for (const queue of [
    "shipping_exception",
    "marketplace_handoff_exception",
    "ship_now",
    "orders_awaiting_payment",
    "stub_publish",
    "list_now",
    "high_value_unlisted",
    "reprice_now",
  ]) {
    assert.deepEqual(navigationTargetForQueue(queue), { view: "sales" });
  }
});

test("action queue navigation carries intents for listing and repricing work", () => {
  assert.deepEqual(
    navigationTargetForQueue("list_now", { subjectType: "inventory_item", subjectId: "item-1" }),
    { view: "sales", focus: { type: "inventory_item", id: "item-1", intent: "list" } },
  );
  assert.deepEqual(
    navigationTargetForQueue("reprice_now", { subjectType: "inventory_item", subjectId: "item-2" }),
    { view: "sales", focus: { type: "inventory_item", id: "item-2", intent: "reprice" } },
  );
  // A concrete pricing recommendation rides along for the reprice panel.
  assert.deepEqual(
    navigationTargetForQueue("reprice_now", {
      subjectType: "inventory_item",
      subjectId: "item-3",
      recommendedPrice: 42.5,
    }),
    { view: "sales", focus: { type: "inventory_item", id: "item-3", intent: "reprice", price: 42.5 } },
  );
  // Stub publishes focus the listing itself with no intent.
  assert.deepEqual(
    navigationTargetForQueue("stub_publish", { subjectType: "listing", subjectId: "listing-1" }),
    { view: "sales", focus: { type: "listing", id: "listing-1" } },
  );
});

test("action queue navigation routes grading and inventory queues to their views", () => {
  assert.deepEqual(navigationTargetForQueue("grade_now"), { view: "tools", toolsTab: "grade" });
  assert.deepEqual(
    navigationTargetForQueue("grade_now", { subjectType: "inventory_item", subjectId: "item-9" }),
    { view: "tools", toolsTab: "grade", focus: { type: "inventory_item", id: "item-9", intent: "grade" } },
  );
  assert.deepEqual(navigationTargetForQueue("dead_inventory"), { view: "cards" });
  assert.deepEqual(navigationTargetForQueue("bundle_low_value"), { view: "cards" });
  assert.deepEqual(navigationTargetForQueue("review_alerts"), { view: "dashboard" });
  assert.deepEqual(navigationTargetForQueue("something_unknown"), { view: "dashboard" });
});

test("action queue navigation carries a record focus from the entry subject", () => {
  assert.deepEqual(
    navigationTargetForQueue("ship_now", { subjectType: "order", subjectId: "order-1" }),
    { view: "sales", focus: { type: "order", id: "order-1" } },
  );
  assert.deepEqual(
    navigationTargetForQueue("dead_inventory", { subjectType: "inventory_item", subjectId: "item-1" }),
    { view: "cards", focus: { type: "inventory_item", id: "item-1" } },
  );
  // Entries without a subject stay plain view targets.
  assert.deepEqual(navigationTargetForQueue("ship_now", {}), { view: "sales" });
});

test("search navigation carries a record focus from the selected result", () => {
  assert.deepEqual(
    navigationTargetForSearchResult("card", { id: "card-1" }),
    { view: "cards", focus: { type: "card", id: "card-1" } },
  );
  assert.deepEqual(
    navigationTargetForSearchResult("order", { id: "order-1" }),
    { view: "sales", focus: { type: "order", id: "order-1" } },
  );
  // Sales render as completed listings, so a sale focuses its linked listing.
  assert.deepEqual(
    navigationTargetForSearchResult("sale", { id: "sale-1", listingId: "listing-1" }),
    { view: "sales", focus: { type: "sale", id: "listing-1" } },
  );
  // Watch/trade land on tools tabs with no record focus consumer.
  assert.deepEqual(
    navigationTargetForSearchResult("watch", { id: "w-1" }),
    { view: "tools", toolsTab: "watch" },
  );
});
