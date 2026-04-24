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

  const linkedOrderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "metadata-fallback-order-2",
      saleId: "metadata-fallback-sale",
    }),
  });
  assert.equal(linkedOrderResponse.status, 201);
  const linkedOrderPayload = await linkedOrderResponse.json();
  assert.equal(linkedOrderPayload.platform, "ebay");
  assert.equal(linkedOrderPayload.buyer_handle, "buyer_meta");
  assert.equal(linkedOrderPayload.sale_price, 29.99);
});
