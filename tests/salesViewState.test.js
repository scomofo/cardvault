import test from "node:test";
import assert from "node:assert/strict";

import {
  loadServerSalesState,
  summarizeMarketplaceSyncResults,
} from "../src/lib/salesViewState.js";

test("loadServerSalesState normalizes each collection independently", async () => {
  const state = await loadServerSalesState({
    actionQueueAPI: {
      list: async () => [{ subjectId: "queue-1" }],
    },
    ordersAPI: {
      list: async () => [{ id: "order-1" }],
    },
    listingsAPI: {
      list: async () => "bad-listings-payload",
    },
    salesAPI: {
      list: async () => {
        throw new Error("sales unavailable");
      },
    },
    itemsAPI: {
      list: async () => [{ id: "item-1" }],
    },
  });

  assert.deepEqual(state, {
    actionQueue: [{ subjectId: "queue-1" }],
    orders: [{ id: "order-1" }],
    listings: [],
    sales: [],
    catalog: [{ id: "item-1" }],
  });
});

test("summarizeMarketplaceSyncResults reports sold listings with created orders", () => {
  assert.deepEqual(
    summarizeMarketplaceSyncResults([
      {
        synced: { status: "sold" },
        sale: { id: "sale-1" },
        order: { id: "order-1" },
      },
    ], "ebay"),
    {
      type: "success",
      message: "Synced ebay sale and created order",
    },
  );
});

test("summarizeMarketplaceSyncResults reports sync conflicts as warnings", () => {
  assert.deepEqual(
    summarizeMarketplaceSyncResults([
      {
        synced: { status: "active" },
        reconciliation: {
          conflicts: [
            { message: "Local status differs from remote sold" },
          ],
        },
      },
    ], "ebay"),
    {
      type: "warning",
      message: "Sync needs review: Local status differs from remote sold",
    },
  );
});

test("summarizeMarketplaceSyncResults reports clean status refreshes", () => {
  assert.deepEqual(
    summarizeMarketplaceSyncResults([
      {
        synced: { status: "active" },
        reconciliation: { conflicts: [] },
      },
    ], "ebay"),
    {
      type: "info",
      message: "Refreshed ebay status: active",
    },
  );
});
