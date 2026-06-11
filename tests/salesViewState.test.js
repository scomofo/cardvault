import test from "node:test";
import assert from "node:assert/strict";

import {
  buildManualSaleFulfillment,
  summarizeMarketplaceCrosspostResults,
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

test("summarizeMarketplaceCrosspostResults names ready handoff channels", () => {
  assert.deepEqual(
    summarizeMarketplaceCrosspostResults([
      { marketplace: "comc", status: "handoff_ready" },
      { marketplace: "shopify", status: "active" },
    ]),
    {
      type: "success",
      message: "Crosspost ready: comc, shopify",
    },
  );
});

test("summarizeMarketplaceCrosspostResults deduplicates marketplace names", () => {
  assert.deepEqual(
    summarizeMarketplaceCrosspostResults([
      { marketplace: "shopify", status: "active" },
      { marketplace: "shopify", status: "revised" },
      { marketplace: "comc", status: "handoff_ready" },
    ]),
    {
      type: "success",
      message: "Crosspost ready: shopify, comc",
    },
  );
});

test("summarizeMarketplaceCrosspostResults explains empty plans", () => {
  assert.deepEqual(
    summarizeMarketplaceCrosspostResults([]),
    {
      type: "info",
      message: "No additional marketplaces were added",
    },
  );
});

test("buildManualSaleFulfillment preserves explicit zero sale price", () => {
  const result = buildManualSaleFulfillment({
    idFactory: () => "fixed-id",
    listing: {
      id: "listing-free",
      cardId: "item-free",
      cardName: "Promo Giveaway",
      set: "Upper Deck",
      platform: "shopify",
      shipping: 0,
      startPrice: 19.99,
    },
    card: { id: "item-free", costBasis: 0 },
    feeRate: 0.029,
    salePrice: "0",
    trackingNumber: "",
    soldAt: "2026-06-11T06:40:00.000Z",
  });

  assert.equal(result.sale.salePrice, 0);
  assert.equal(result.order.salePrice, 0);
  assert.equal(result.sale.netProfit, 0);
});

test("buildManualSaleFulfillment falls back to start price for invalid sale price", () => {
  const result = buildManualSaleFulfillment({
    idFactory: () => "fixed-id",
    listing: {
      id: "listing-invalid",
      cardId: "item-invalid",
      cardName: "Invalid Price Fallback",
      set: "Upper Deck",
      platform: "ebay",
      shipping: 0,
      startPrice: 10,
    },
    card: { id: "item-invalid", costBasis: 0 },
    feeRate: 0.1,
    salePrice: "abc",
    trackingNumber: "",
    soldAt: "2026-06-11T06:40:00.000Z",
  });

  assert.equal(result.sale.salePrice, 10);
  assert.equal(result.order.salePrice, 10);
  assert.equal(result.sale.netProfit, 9);
});

test("buildManualSaleFulfillment creates a pending shipment task for a confirmed sale", () => {
  const now = "2026-06-11T06:40:00.000Z";
  const result = buildManualSaleFulfillment({
    idFactory: () => "fixed-id",
    listing: {
      id: "listing-1",
      cardId: "item-1",
      cardName: "Connor Bedard Young Guns",
      set: "Upper Deck",
      platform: "ebay",
      shipping: 4.99,
      startPrice: 79.99,
    },
    card: { id: "item-1", costBasis: 25 },
    feeRate: 0.1312,
    salePrice: "79.99",
    trackingNumber: "",
    soldAt: now,
  });

  assert.equal(result.sale.id, "fixed-id");
  assert.equal(result.sale.cardId, "item-1");
  assert.equal(result.sale.listingId, "listing-1");
  assert.equal(result.sale.netProfit, 39.51);
  assert.equal(result.order.saleId, "fixed-id");
  assert.equal(result.order.listingId, "listing-1");
  assert.equal(result.order.itemId, "item-1");
  assert.equal(result.order.fulfillmentStatus, "pending");
});
