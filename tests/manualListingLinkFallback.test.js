import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer.js";

test("manual listing-linked sales and orders infer the item id from the listing", async (t) => {
  const { baseUrl } = await startTestServer(t, {
    dirPrefix: "cardvault-manual-link-",
    portBase: 3700,
    stdio: ["ignore", "pipe", "pipe"],
  });

  async function createItemAndListing(suffix) {
    const itemId = `manual-link-item-${suffix}`;
    const listingId = `manual-link-listing-${suffix}`;

    const itemResponse = await fetch(`${baseUrl}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: itemId,
        name: `Manual Link ${suffix}`,
        set: "Route Set",
        number: suffix,
        costBasis: 4.5,
        listedOn: [],
        priceHistory: [],
      }),
    });
    assert.equal(itemResponse.status, 201);

    const listingResponse = await fetch(`${baseUrl}/api/listings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: listingId,
        cardId: itemId,
        cardName: `Manual Link ${suffix}`,
        cardSet: "Route Set",
        cardNumber: suffix,
        platform: "ebay",
        format: "fixed",
        startPrice: 12.5,
        shipping: 1.25,
        status: "active",
      }),
    });
    assert.equal(listingResponse.status, 201);

    return { itemId, listingId };
  }

  const saleCase = await createItemAndListing("sale");
  const saleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "manual-link-sale",
      listingId: saleCase.listingId,
      cardName: "Manual Link sale",
      cardSet: "Route Set",
      platform: "ebay",
      salePrice: 13.5,
      netProfit: 9,
      date: "2026-04-24T20:00:00.000Z",
    }),
  });
  assert.equal(saleResponse.status, 201);
  const salePayload = await saleResponse.json();
  assert.equal(salePayload.cardId, saleCase.itemId);

  const soldViaSaleItemResponse = await fetch(`${baseUrl}/api/items/${saleCase.itemId}`);
  assert.equal(soldViaSaleItemResponse.status, 200);
  const soldViaSaleItemPayload = await soldViaSaleItemResponse.json();
  assert.equal(soldViaSaleItemPayload.status, "sold");
  assert.equal(soldViaSaleItemPayload.listingStatus, "ended");
  assert.equal(soldViaSaleItemPayload.saleStatus, "sold");

  const orderCase = await createItemAndListing("order");
  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "manual-link-order",
      listingId: orderCase.listingId,
      platform: "ebay",
      salePrice: 14.5,
      soldAt: "2026-04-24T20:05:00.000Z",
    }),
  });
  assert.equal(orderResponse.status, 201);
  const orderPayload = await orderResponse.json();
  assert.equal(orderPayload.itemId, orderCase.itemId);

  const soldViaOrderItemResponse = await fetch(`${baseUrl}/api/items/${orderCase.itemId}`);
  assert.equal(soldViaOrderItemResponse.status, 200);
  const soldViaOrderItemPayload = await soldViaOrderItemResponse.json();
  assert.equal(soldViaOrderItemPayload.status, "sold");
  assert.equal(soldViaOrderItemPayload.listingStatus, "ended");
  assert.equal(soldViaOrderItemPayload.saleStatus, "sold");
});
