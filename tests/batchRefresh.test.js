import test from "node:test";
import assert from "node:assert/strict";
import { refreshPricingForAllOwned } from "../src/server/services/pricing/batchRefresh.js";

function fakeItems(count) {
  return Array.from({ length: count }, (_, i) => ({ id: `item-${i}` }));
}

test("batch refresh iterates every owned item and counts successes", async () => {
  const calls = [];
  const summary = await refreshPricingForAllOwned({
    delayMs: 0,
    listItems: () => fakeItems(4),
    refresh: async (itemId, options) => {
      calls.push({ itemId, options });
      return {};
    },
  });
  assert.equal(summary.total, 4);
  assert.equal(summary.refreshed, 4);
  assert.equal(summary.failed, 0);
  assert.equal(summary.errors.length, 0);
  assert.deepEqual(calls.map((c) => c.itemId), ["item-0", "item-1", "item-2", "item-3"]);
});

test("batch refresh isolates failures and continues", async () => {
  const summary = await refreshPricingForAllOwned({
    delayMs: 0,
    listItems: () => fakeItems(3),
    refresh: async (itemId) => {
      if (itemId === "item-1") throw new Error("boom");
      return {};
    },
  });
  assert.equal(summary.total, 3);
  assert.equal(summary.refreshed, 2);
  assert.equal(summary.failed, 1);
  assert.equal(summary.errors.length, 1);
  assert.equal(summary.errors[0].itemId, "item-1");
  assert.match(summary.errors[0].message, /boom/);
});

test("batch refresh returns zero totals for an empty catalog", async () => {
  const summary = await refreshPricingForAllOwned({
    delayMs: 0,
    listItems: () => [],
    refresh: async () => {
      throw new Error("should not be called");
    },
  });
  assert.equal(summary.total, 0);
  assert.equal(summary.refreshed, 0);
  assert.equal(summary.failed, 0);
});

test("batch refresh forwards the source option to each refresh call", async () => {
  const received = [];
  await refreshPricingForAllOwned({
    delayMs: 0,
    source: "ebay-browse",
    listItems: () => fakeItems(2),
    refresh: async (itemId, options) => {
      received.push(options);
    },
  });
  assert.deepEqual(received, [{ source: "ebay-browse" }, { source: "ebay-browse" }]);
});

test("batch refresh forwards forceRefresh to each refresh call", async () => {
  const received = [];
  await refreshPricingForAllOwned({
    delayMs: 0,
    source: "ebay-browse",
    forceRefresh: true,
    listItems: () => fakeItems(2),
    refresh: async (itemId, options) => {
      received.push(options);
    },
  });
  assert.deepEqual(received, [
    { source: "ebay-browse", forceRefresh: true },
    { source: "ebay-browse", forceRefresh: true },
  ]);
});
