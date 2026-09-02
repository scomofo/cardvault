import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer.js";

async function postJson(baseUrl, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Regression test for a raw FOREIGN KEY constraint error: sales.card_id,
// listings.card_id, orders.sale_id/listing_id/item_id, and shipments.item_id
// were declared with no ON DELETE action, so deleting a card that had ever
// been listed or sold failed with a 500 instead of detaching its history.
test("deleting a card that was listed and sold detaches history instead of failing", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-delete-fk-" });

  assert.equal(
    (await postJson(baseUrl, "/api/items", {
      id: "fk-item",
      name: "Wayne Gretzky",
      listedOn: [],
      priceHistory: [],
    })).status,
    201,
  );

  assert.equal(
    (await postJson(baseUrl, "/api/listings", {
      id: "fk-listing",
      cardId: "fk-item",
      cardName: "Wayne Gretzky",
      platform: "ebay",
      startPrice: 49.99,
      status: "active",
    })).status,
    201,
  );

  assert.equal(
    (await postJson(baseUrl, "/api/sales", {
      id: "fk-sale",
      cardId: "fk-item",
      cardName: "Wayne Gretzky",
      salePrice: 60,
      fees: 5,
      platform: "ebay",
      date: "2026-07-01T00:00:00.000Z",
    })).status,
    201,
  );

  const deleteResponse = await fetch(`${baseUrl}/api/items/fk-item`, { method: "DELETE" });
  const deletePayload = await deleteResponse.json();
  assert.equal(deleteResponse.status, 200, JSON.stringify(deletePayload));
  assert.deepEqual(deletePayload, { deleted: true });

  const listings = await (await fetch(`${baseUrl}/api/listings`)).json();
  const listing = listings.find((row) => row.id === "fk-listing");
  assert.ok(listing, "the listing survives the item delete");
  assert.equal(listing.cardId, null);

  const sales = await (await fetch(`${baseUrl}/api/sales`)).json();
  const sale = sales.find((row) => row.id === "fk-sale");
  assert.ok(sale, "the sale survives the item delete");
  assert.equal(sale.cardId, null);
});

test("deleting a sale detaches its linked order instead of failing", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-delete-fk-order-" });

  assert.equal(
    (await postJson(baseUrl, "/api/items", {
      id: "fk-order-item",
      name: "Connor McDavid",
      listedOn: [],
      priceHistory: [],
    })).status,
    201,
  );

  assert.equal(
    (await postJson(baseUrl, "/api/sales", {
      id: "fk-order-sale",
      cardId: "fk-order-item",
      cardName: "Connor McDavid",
      salePrice: 120,
      fees: 8,
      platform: "ebay",
      date: "2026-07-02T00:00:00.000Z",
    })).status,
    201,
  );

  assert.equal(
    (await postJson(baseUrl, "/api/orders", {
      id: "fk-order",
      saleId: "fk-order-sale",
      itemId: "fk-order-item",
      platform: "ebay",
      salePrice: 120,
    })).status,
    201,
  );

  const deleteResponse = await fetch(`${baseUrl}/api/sales/fk-order-sale`, { method: "DELETE" });
  const deletePayload = await deleteResponse.json();
  assert.equal(deleteResponse.status, 200, JSON.stringify(deletePayload));

  const orders = await (await fetch(`${baseUrl}/api/orders`)).json();
  const order = orders.find((row) => row.id === "fk-order");
  assert.ok(order, "the order survives the sale delete");
  assert.equal(order.saleId, null);
});
