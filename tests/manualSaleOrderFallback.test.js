import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer.js";

test("manual sale creation infers listing and item from linked order", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-sale-order-fallback-" });

  const itemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "order-fallback-item",
      name: "Order Fallback Card",
      set: "Route Set",
      number: "51",
      costBasis: 12,
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(itemResponse.status, 201);

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "order-fallback-listing",
      cardId: "order-fallback-item",
      cardName: "Order Fallback Card",
      cardSet: "Route Set",
      cardNumber: "51",
      platform: "ebay",
      format: "fixed",
      startPrice: 39.99,
      shipping: 1.25,
      status: "draft",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const soldAt = "2026-04-24T21:15:00.000Z";
  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "order-fallback-order",
      itemId: "order-fallback-item",
      listingId: "order-fallback-listing",
      platform: "ebay",
      salePrice: 39.99,
      soldAt,
    }),
  });
  assert.equal(orderResponse.status, 201);

  const saleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "order-fallback-sale",
      orderId: "order-fallback-order",
      cardName: "Order Fallback Card",
      cardSet: "Route Set",
      netProfit: 27.99,
    }),
  });
  assert.equal(saleResponse.status, 201);
  const salePayload = await saleResponse.json();
  assert.equal(salePayload.cardId, "order-fallback-item");
  assert.equal(salePayload.listingId, "order-fallback-listing");
  assert.equal(salePayload.orderId, "order-fallback-order");
  assert.equal(salePayload.platform, "ebay");
  assert.equal(salePayload.salePrice, 39.99);

  const itemAfterResponse = await fetch(`${baseUrl}/api/items/order-fallback-item`);
  assert.equal(itemAfterResponse.status, 200);
  const itemAfterPayload = await itemAfterResponse.json();
  assert.equal(itemAfterPayload.status, "sold");
  assert.equal(itemAfterPayload.listingStatus, "ended");
  assert.equal(itemAfterPayload.saleStatus, "sold");
  assert.equal(itemAfterPayload.profitRealized, 27.99);
  assert.equal(itemAfterPayload.soldAt, soldAt);

  const listingAfterResponse = await fetch(`${baseUrl}/api/listings`);
  assert.equal(listingAfterResponse.status, 200);
  const listingAfterPayload = await listingAfterResponse.json();
  const listing = listingAfterPayload.find((entry) => entry.id === "order-fallback-listing");
  assert.ok(listing);
  assert.equal(listing.status, "sold");
  assert.equal(listing.publishStatus, "sold");
  assert.equal(listing.soldDate, soldAt);
});
