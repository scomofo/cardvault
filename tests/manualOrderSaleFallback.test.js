import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer.js";

test("manual order creation infers listing and item from linked sale", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-order-sale-fallback-" });

  const itemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "sale-fallback-item",
      name: "Sale Fallback Card",
      set: "Route Set",
      number: "50",
      costBasis: 15,
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(itemResponse.status, 201);

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "sale-fallback-listing",
      cardId: "sale-fallback-item",
      cardName: "Sale Fallback Card",
      cardSet: "Route Set",
      cardNumber: "50",
      platform: "ebay",
      format: "fixed",
      startPrice: 49.99,
      shipping: 1.25,
      status: "draft",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const saleDate = "2026-04-24T21:00:00.000Z";
  const saleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "sale-fallback-sale",
      cardId: "sale-fallback-item",
      listingId: "sale-fallback-listing",
      cardName: "Sale Fallback Card",
      cardSet: "Route Set",
      platform: "ebay",
      salePrice: 49.99,
      costBasis: 15,
      netProfit: 34.99,
      date: saleDate,
    }),
  });
  assert.equal(saleResponse.status, 201);

  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "sale-fallback-order",
      saleId: "sale-fallback-sale",
      platform: "ebay",
    }),
  });
  assert.equal(orderResponse.status, 201);
  const orderPayload = await orderResponse.json();
  assert.equal(orderPayload.listingId, "sale-fallback-listing");
  assert.equal(orderPayload.itemId, "sale-fallback-item");
  assert.equal(orderPayload.salePrice, 49.99);
  assert.equal(orderPayload.soldAt, saleDate);

  const listingAfterResponse = await fetch(`${baseUrl}/api/listings`);
  assert.equal(listingAfterResponse.status, 200);
  const listingAfterPayload = await listingAfterResponse.json();
  const listing = listingAfterPayload.find((entry) => entry.id === "sale-fallback-listing");
  assert.ok(listing);
  assert.equal(listing.status, "sold");
  assert.equal(listing.publishStatus, "sold");

  const itemAfterResponse = await fetch(`${baseUrl}/api/items/sale-fallback-item`);
  assert.equal(itemAfterResponse.status, 200);
  const itemAfterPayload = await itemAfterResponse.json();
  assert.equal(itemAfterPayload.status, "sold");
  assert.equal(itemAfterPayload.listingStatus, "ended");
  assert.equal(itemAfterPayload.saleStatus, "sold");
  assert.equal(itemAfterPayload.profitRealized, 34.99);
  assert.equal(itemAfterPayload.soldAt, saleDate);
});
