import test from "node:test";
import assert from "node:assert/strict";

import { loadServerSalesState } from "../src/lib/salesViewState.js";

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
