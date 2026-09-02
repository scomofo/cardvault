import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { startTestServer } from "./helpers/testServer.js";

import { loadServerSalesState } from "../src/lib/salesViewState.js";

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Request failed ${response.status} ${path}: ${body}`);
  }
  return response.json();
}

test("Sales refresh loader sees marketplace sold sync state across all server-backed collections", async (t) => {
  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-sales-refresh-" });

  await requestJson(baseUrl, "/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "refresh-sync-item",
      name: "Leon Draisaitl",
      set: "Upper Deck",
      listedOn: [],
      priceHistory: [],
      marketPrice: 110,
      suggestedListingPrice: 119.99,
      costBasis: 35,
    }),
  });

  await requestJson(baseUrl, "/api/listings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "refresh-sync-listing",
      cardId: "refresh-sync-item",
      cardName: "Leon Draisaitl",
      cardSet: "Upper Deck",
      platform: "ebay",
      listingTitle: "Leon Draisaitl card",
      listingDescription: "Should appear across refreshed sales state",
      startPrice: 119.99,
      status: "active",
    }),
  });

  await requestJson(baseUrl, "/api/marketplaces/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: "refresh-sync-listing", marketplace: "ebay" }),
  });

  const db = new Database(dbPath);
  db.prepare("UPDATE listings SET sold_price = ? WHERE id = ?").run(119.99, "refresh-sync-listing");
  db.close();

  const syncPayload = await requestJson(baseUrl, "/api/marketplaces/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ marketplace: "ebay", listingId: "refresh-sync-listing" }),
  });
  assert.equal(syncPayload.length, 1);

  const state = await loadServerSalesState({
    actionQueueAPI: {
      list: () => requestJson(baseUrl, "/api/action-queue"),
    },
    ordersAPI: {
      list: () => requestJson(baseUrl, "/api/orders"),
    },
    listingsAPI: {
      list: () => requestJson(baseUrl, "/api/listings"),
    },
    salesAPI: {
      list: () => requestJson(baseUrl, "/api/sales"),
    },
    itemsAPI: {
      list: () => requestJson(baseUrl, "/api/items"),
    },
  });

  const syncedListing = state.listings.find((entry) => entry.id === "refresh-sync-listing");
  const syncedSale = state.sales.find((entry) => entry.listingId === "refresh-sync-listing");
  const syncedOrder = state.orders.find((entry) => entry.listingId === "refresh-sync-listing");
  const syncedItem = state.catalog.find((entry) => entry.id === "refresh-sync-item");
  const queuedShipment = state.actionQueue.find(
    (entry) => entry.subjectType === "order" && entry.subjectId === syncedOrder?.id,
  );

  assert.ok(syncedListing);
  assert.equal(syncedListing.status, "sold");
  assert.equal(syncedListing.publishStatus, "sold");

  assert.ok(syncedSale);
  assert.equal(syncedSale.salePrice, 119.99);
  assert.equal(syncedSale.costBasis, 35);

  assert.ok(syncedOrder);
  assert.equal(syncedOrder.fulfillmentStatus, "pending");
  assert.equal(syncedOrder.paymentStatus, "paid");

  assert.ok(syncedItem);
  assert.equal(syncedItem.status, "sold");
  assert.equal(syncedItem.saleStatus, "sold");
  assert.equal(syncedItem.listingStatus, "ended");

  assert.ok(queuedShipment);
  assert.equal(queuedShipment.queue, "ship_now");
});
