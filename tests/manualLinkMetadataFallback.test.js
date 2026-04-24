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

test("linked manual sales and orders inherit platform and buyer metadata", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-link-metadata-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 4000 + Math.floor(Math.random() * 400);
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
      id: "metadata-fallback-item",
      name: "Metadata Fallback Card",
      set: "Route Set",
      number: "52",
      costBasis: 9,
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(itemResponse.status, 201);

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "metadata-fallback-listing",
      cardId: "metadata-fallback-item",
      cardName: "Metadata Fallback Card",
      cardSet: "Route Set",
      cardNumber: "52",
      platform: "ebay",
      format: "fixed",
      startPrice: 29.99,
      shipping: 1.25,
      status: "draft",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "metadata-fallback-order",
      itemId: "metadata-fallback-item",
      listingId: "metadata-fallback-listing",
      platform: "ebay",
      buyerHandle: "buyer_meta",
      salePrice: 29.99,
      soldAt: "2026-04-24T21:30:00.000Z",
    }),
  });
  assert.equal(orderResponse.status, 201);

  const saleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "metadata-fallback-sale",
      orderId: "metadata-fallback-order",
      cardName: "Metadata Fallback Card",
      cardSet: "Route Set",
      salePrice: 29.99,
      netProfit: 20.99,
    }),
  });
  assert.equal(saleResponse.status, 201);
  const salePayload = await saleResponse.json();
  assert.equal(salePayload.platform, "ebay");
  assert.equal(salePayload.buyerHandle, "buyer_meta");

  const secondItemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "metadata-fallback-item-2",
      name: "Metadata Fallback Card 2",
      set: "Route Set",
      number: "52B",
      costBasis: 11,
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(secondItemResponse.status, 201);

  const secondListingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "metadata-fallback-listing-2",
      cardId: "metadata-fallback-item-2",
      cardName: "Metadata Fallback Card 2",
      cardSet: "Route Set",
      cardNumber: "52B",
      platform: "ebay",
      format: "fixed",
      startPrice: 32.99,
      shipping: 1.25,
      status: "draft",
    }),
  });
  assert.equal(secondListingResponse.status, 201);

  const standaloneSaleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "metadata-fallback-sale-2",
      cardId: "metadata-fallback-item-2",
      listingId: "metadata-fallback-listing-2",
      cardName: "Metadata Fallback Card 2",
      cardSet: "Route Set",
      platform: "ebay",
      buyerHandle: "buyer_meta_2",
      salePrice: 32.99,
      netProfit: 21.99,
    }),
  });
  assert.equal(standaloneSaleResponse.status, 201);

  const linkedOrderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "metadata-fallback-order-2",
      saleId: "metadata-fallback-sale-2",
    }),
  });
  assert.equal(linkedOrderResponse.status, 201);
  const linkedOrderPayload = await linkedOrderResponse.json();
  assert.equal(linkedOrderPayload.platform, "ebay");
  assert.equal(linkedOrderPayload.buyer_handle, "buyer_meta_2");
  assert.equal(linkedOrderPayload.sale_price, 32.99);
});

test("linked manual sales and orders reject duplicate one-to-one pairings", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-link-duplicate-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 4400 + Math.floor(Math.random() * 400);
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
      id: "duplicate-link-item",
      name: "Duplicate Link Card",
      set: "Route Set",
      number: "53",
      costBasis: 10,
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(itemResponse.status, 201);

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "duplicate-link-listing",
      cardId: "duplicate-link-item",
      cardName: "Duplicate Link Card",
      cardSet: "Route Set",
      cardNumber: "53",
      platform: "ebay",
      format: "fixed",
      startPrice: 31.99,
      shipping: 1.25,
      status: "draft",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const saleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "duplicate-link-sale",
      cardId: "duplicate-link-item",
      listingId: "duplicate-link-listing",
      cardName: "Duplicate Link Card",
      cardSet: "Route Set",
      platform: "ebay",
      salePrice: 31.99,
      netProfit: 21.99,
    }),
  });
  assert.equal(saleResponse.status, 201);

  const firstOrderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "duplicate-link-order-a",
      saleId: "duplicate-link-sale",
    }),
  });
  assert.equal(firstOrderResponse.status, 201);

  const secondOrderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "duplicate-link-order-b",
      saleId: "duplicate-link-sale",
    }),
  });
  assert.equal(secondOrderResponse.status, 409);

  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "duplicate-link-order",
      itemId: "duplicate-link-item",
      listingId: "duplicate-link-listing",
      platform: "ebay",
      salePrice: 31.99,
    }),
  });
  assert.equal(orderResponse.status, 201);

  const firstSaleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "duplicate-link-sale-a",
      orderId: "duplicate-link-order",
      cardName: "Duplicate Link Card",
      cardSet: "Route Set",
      salePrice: 31.99,
      netProfit: 21.99,
    }),
  });
  assert.equal(firstSaleResponse.status, 201);

  const secondSaleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "duplicate-link-sale-b",
      orderId: "duplicate-link-order",
      cardName: "Duplicate Link Card",
      cardSet: "Route Set",
      salePrice: 31.99,
      netProfit: 21.99,
    }),
  });
  assert.equal(secondSaleResponse.status, 409);
});

test("linked manual sales and orders reject dangling link ids", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-link-missing-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 4800 + Math.floor(Math.random() * 400);
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

  const missingSaleOrderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "missing-link-order",
      saleId: "missing-sale-id",
      platform: "ebay",
      salePrice: 12.99,
    }),
  });
  assert.equal(missingSaleOrderResponse.status, 404);

  const missingOrderSaleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "missing-link-sale",
      orderId: "missing-order-id",
      cardName: "Missing Link Card",
      cardSet: "Route Set",
      platform: "ebay",
      salePrice: 12.99,
    }),
  });
  assert.equal(missingOrderSaleResponse.status, 404);
});

test("linked manual sales and orders reject conflicting explicit ids", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-link-conflict-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 5200 + Math.floor(Math.random() * 400);
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

  for (const item of [
    { id: "conflict-item-a", name: "Conflict Card A", number: "54A" },
    { id: "conflict-item-b", name: "Conflict Card B", number: "54B" },
  ]) {
    const itemResponse = await fetch(`${baseUrl}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...item,
        set: "Route Set",
        costBasis: 8,
        listedOn: [],
        priceHistory: [],
      }),
    });
    assert.equal(itemResponse.status, 201);
  }

  for (const listing of [
    { id: "conflict-listing-a", cardId: "conflict-item-a", cardNumber: "54A" },
    { id: "conflict-listing-b", cardId: "conflict-item-b", cardNumber: "54B" },
  ]) {
    const listingResponse = await fetch(`${baseUrl}/api/listings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...listing,
        cardName: "Conflict Card",
        cardSet: "Route Set",
        platform: "ebay",
        format: "fixed",
        startPrice: 22.99,
        shipping: 1.25,
        status: "draft",
      }),
    });
    assert.equal(listingResponse.status, 201);
  }

  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "conflict-order",
      itemId: "conflict-item-a",
      listingId: "conflict-listing-a",
      platform: "ebay",
      salePrice: 22.99,
    }),
  });
  assert.equal(orderResponse.status, 201);

  const saleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "conflict-sale",
      cardId: "conflict-item-a",
      listingId: "conflict-listing-a",
      cardName: "Conflict Card",
      cardSet: "Route Set",
      platform: "ebay",
      salePrice: 22.99,
      netProfit: 14.99,
    }),
  });
  assert.equal(saleResponse.status, 201);

  const conflictingOrderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "conflict-order-bad",
      saleId: "conflict-sale",
      itemId: "conflict-item-b",
    }),
  });
  assert.equal(conflictingOrderResponse.status, 409);

  const conflictingSaleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "conflict-sale-bad",
      orderId: "conflict-order",
      cardId: "conflict-item-b",
      cardName: "Conflict Card",
      cardSet: "Route Set",
      salePrice: 22.99,
      netProfit: 14.99,
    }),
  });
  assert.equal(conflictingSaleResponse.status, 409);
});
