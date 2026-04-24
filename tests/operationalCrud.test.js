import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

async function waitForServer(baseUrl, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/settings`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

test("sales, orders, and purchases support full CRUD for sync flows", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-operational-crud-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 7100 + Math.floor(Math.random() * 200);
  const baseUrl = `http://127.0.0.1:${port}`;

  const server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CARDVAULT_DB_PATH: dbPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  t.after(async () => {
    if (!server.killed) {
      server.kill("SIGTERM");
    }
    await new Promise((resolve) => server.once("exit", resolve));
    await rm(tempDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl);

  const itemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "crud-item",
      name: "CRUD Card",
      set: "Route Set",
      number: "88",
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
      id: "crud-listing",
      cardId: "crud-item",
      cardName: "CRUD Card",
      cardSet: "Route Set",
      cardNumber: "88",
      platform: "ebay",
      format: "fixed",
      startPrice: 29.99,
      shipping: 1.25,
      status: "draft",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const saleCreateResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "crud-sale",
      cardId: "crud-item",
      listingId: "crud-listing",
      cardName: "CRUD Card",
      cardSet: "Route Set",
      platform: "ebay",
      salePrice: 29.99,
      netProfit: 17.99,
    }),
  });
  assert.equal(saleCreateResponse.status, 201);

  const saleUpdateResponse = await fetch(`${baseUrl}/api/sales/crud-sale`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      buyerHandle: "sync_buyer",
      trackingNumber: "SYNC-TRK-1",
      netProfit: 18.49,
    }),
  });
  assert.equal(saleUpdateResponse.status, 200);
  const salePayload = await saleUpdateResponse.json();
  assert.equal(salePayload.buyerHandle, "sync_buyer");
  assert.equal(salePayload.trackingNumber, "SYNC-TRK-1");
  assert.equal(salePayload.netProfit, 18.49);

  const orderCreateResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "crud-order",
      saleId: "crud-sale",
      platform: "ebay",
    }),
  });
  assert.equal(orderCreateResponse.status, 201);

  const orderUpdateResponse = await fetch(`${baseUrl}/api/orders/crud-order`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      destinationCountry: "US",
      destinationPostalCode: "10001",
      fulfillmentStatus: "shipped",
    }),
  });
  assert.equal(orderUpdateResponse.status, 200);
  const orderPayload = await orderUpdateResponse.json();
  assert.equal(orderPayload.destinationCountry, "US");
  assert.equal(orderPayload.destinationPostalCode, "10001");
  assert.equal(orderPayload.fulfillmentStatus, "shipped");

  const saleRelinkResponse = await fetch(`${baseUrl}/api/sales/crud-sale`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: null,
    }),
  });
  assert.equal(saleRelinkResponse.status, 200);

  const ordersAfterSaleUnlinkResponse = await fetch(`${baseUrl}/api/orders`);
  assert.equal(ordersAfterSaleUnlinkResponse.status, 200);
  const ordersAfterSaleUnlink = await ordersAfterSaleUnlinkResponse.json();
  const unlinkedOrder = ordersAfterSaleUnlink.find((order) => order.id === "crud-order");
  assert.equal(unlinkedOrder.saleId, null);

  const orderRelinkResponse = await fetch(`${baseUrl}/api/orders/crud-order`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      saleId: "crud-sale",
    }),
  });
  assert.equal(orderRelinkResponse.status, 200);

  const salesAfterOrderRelinkResponse = await fetch(`${baseUrl}/api/sales`);
  assert.equal(salesAfterOrderRelinkResponse.status, 200);
  const salesAfterOrderRelink = await salesAfterOrderRelinkResponse.json();
  const relinkedSale = salesAfterOrderRelink.find((sale) => sale.id === "crud-sale");
  assert.equal(relinkedSale.orderId, "crud-order");

  const purchaseCreateResponse = await fetch(`${baseUrl}/api/purchases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "crud-purchase",
      name: "CRUD Purchase",
      cardSet: "Route Set",
      platform: "ebay",
      price: 20,
      shipping: 2,
      totalCost: 22,
      date: "2026-04-24",
    }),
  });
  assert.equal(purchaseCreateResponse.status, 201);

  const purchaseUpdateResponse = await fetch(`${baseUrl}/api/purchases/crud-purchase`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      seller: "sync_seller",
      totalCost: 24,
    }),
  });
  assert.equal(purchaseUpdateResponse.status, 200);
  const purchasePayload = await purchaseUpdateResponse.json();
  assert.equal(purchasePayload.seller, "sync_seller");
  assert.equal(purchasePayload.totalCost, 24);

  const orderDeleteResponse = await fetch(`${baseUrl}/api/orders/crud-order`, {
    method: "DELETE",
  });
  assert.equal(orderDeleteResponse.status, 200);

  const salesAfterOrderDeleteResponse = await fetch(`${baseUrl}/api/sales`);
  assert.equal(salesAfterOrderDeleteResponse.status, 200);
  const salesAfterOrderDelete = await salesAfterOrderDeleteResponse.json();
  const unlinkedSale = salesAfterOrderDelete.find((sale) => sale.id === "crud-sale");
  assert.equal(unlinkedSale.orderId, null);

  const saleDeleteResponse = await fetch(`${baseUrl}/api/sales/crud-sale`, {
    method: "DELETE",
  });
  assert.equal(saleDeleteResponse.status, 200);

  const itemsAfterSaleDeleteResponse = await fetch(`${baseUrl}/api/items`);
  assert.equal(itemsAfterSaleDeleteResponse.status, 200);
  const itemsAfterSaleDelete = await itemsAfterSaleDeleteResponse.json();
  const reopenedItem = itemsAfterSaleDelete.find((item) => item.id === "crud-item");
  assert.equal(reopenedItem.status, "listed");
  assert.equal(reopenedItem.listingStatus, "draft");
  assert.equal(reopenedItem.saleStatus, "available");
  assert.equal(reopenedItem.soldAt, null);

  const listingsAfterSaleDeleteResponse = await fetch(`${baseUrl}/api/listings`);
  assert.equal(listingsAfterSaleDeleteResponse.status, 200);
  const listingsAfterSaleDelete = await listingsAfterSaleDeleteResponse.json();
  const reopenedListing = listingsAfterSaleDelete.find((listing) => listing.id === "crud-listing");
  assert.equal(reopenedListing.status, "draft");
  assert.equal(reopenedListing.publishStatus, "draft");
  assert.equal(reopenedListing.soldPrice, null);
  assert.equal(reopenedListing.soldDate, null);

  const orderOnlyItemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "order-only-item",
      name: "Order Only Card",
      set: "Route Set",
      number: "89",
      costBasis: 9,
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(orderOnlyItemResponse.status, 201);

  const orderOnlyListingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "order-only-listing",
      cardId: "order-only-item",
      cardName: "Order Only Card",
      cardSet: "Route Set",
      cardNumber: "89",
      platform: "shopify",
      format: "fixed",
      startPrice: 19.99,
      shipping: 1.25,
      status: "active",
    }),
  });
  assert.equal(orderOnlyListingResponse.status, 201);

  const directOrderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "direct-order",
      listingId: "order-only-listing",
      itemId: "order-only-item",
      platform: "shopify",
      salePrice: 19.99,
    }),
  });
  assert.equal(directOrderResponse.status, 201);

  const directOrderDeleteResponse = await fetch(`${baseUrl}/api/orders/direct-order`, {
    method: "DELETE",
  });
  assert.equal(directOrderDeleteResponse.status, 200);

  const itemsAfterOrderDeleteResponse = await fetch(`${baseUrl}/api/items`);
  assert.equal(itemsAfterOrderDeleteResponse.status, 200);
  const itemsAfterOrderDelete = await itemsAfterOrderDeleteResponse.json();
  const reopenedOrderOnlyItem = itemsAfterOrderDelete.find((item) => item.id === "order-only-item");
  assert.equal(reopenedOrderOnlyItem.status, "listed");
  assert.equal(reopenedOrderOnlyItem.listingStatus, "listed");
  assert.equal(reopenedOrderOnlyItem.saleStatus, "available");
  assert.equal(reopenedOrderOnlyItem.soldAt, null);

  const listingsAfterOrderDeleteResponse = await fetch(`${baseUrl}/api/listings`);
  assert.equal(listingsAfterOrderDeleteResponse.status, 200);
  const listingsAfterOrderDelete = await listingsAfterOrderDeleteResponse.json();
  const reopenedOrderOnlyListing = listingsAfterOrderDelete.find((listing) => listing.id === "order-only-listing");
  assert.equal(reopenedOrderOnlyListing.status, "active");
  assert.equal(reopenedOrderOnlyListing.publishStatus, "active");
  assert.equal(reopenedOrderOnlyListing.soldPrice, null);
  assert.equal(reopenedOrderOnlyListing.soldDate, null);

  const purchaseDeleteResponse = await fetch(`${baseUrl}/api/purchases/crud-purchase`, {
    method: "DELETE",
  });
  assert.equal(purchaseDeleteResponse.status, 200);
});
