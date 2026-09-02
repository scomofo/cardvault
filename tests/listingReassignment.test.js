import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer.js";

test("moving a listing to another item repairs both item states", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-listing-move-" });

  for (const item of [
    { id: "listing-move-item-a", name: "Listing Move A", number: "10" },
    { id: "listing-move-item-b", name: "Listing Move B", number: "11" },
  ]) {
    const response = await fetch(`${baseUrl}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...item,
        set: "Route Set",
        costBasis: 5,
        listedOn: [],
        priceHistory: [],
      }),
    });
    assert.equal(response.status, 201);
  }

  const listingCreateResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "listing-move-listing",
      cardId: "listing-move-item-a",
      cardName: "Listing Move A",
      cardSet: "Route Set",
      cardNumber: "10",
      platform: "ebay",
      format: "fixed",
      startPrice: 21.5,
      shipping: 1.25,
      status: "active",
    }),
  });
  assert.equal(listingCreateResponse.status, 201);

  const movedListingResponse = await fetch(`${baseUrl}/api/listings/listing-move-listing`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "listing-move-listing",
      cardId: "listing-move-item-b",
      cardName: "Listing Move B",
      cardSet: "Route Set",
      cardNumber: "11",
      platform: "ebay",
      format: "fixed",
      startPrice: 21.5,
      shipping: 1.25,
      status: "active",
    }),
  });
  assert.equal(movedListingResponse.status, 200);

  const originalItemResponse = await fetch(`${baseUrl}/api/items/listing-move-item-a`);
  assert.equal(originalItemResponse.status, 200);
  const originalItemPayload = await originalItemResponse.json();
  assert.equal(originalItemPayload.status, "inventory");
  assert.equal(originalItemPayload.listingStatus, "not_listed");
  assert.equal(originalItemPayload.saleStatus, "available");

  const targetItemResponse = await fetch(`${baseUrl}/api/items/listing-move-item-b`);
  assert.equal(targetItemResponse.status, 200);
  const targetItemPayload = await targetItemResponse.json();
  assert.equal(targetItemPayload.status, "listed");
  assert.equal(targetItemPayload.listingStatus, "listed");
  assert.equal(targetItemPayload.saleStatus, "available");
});
