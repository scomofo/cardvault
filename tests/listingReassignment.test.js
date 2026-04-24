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

test("moving a listing to another item repairs both item states", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-listing-move-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 3600 + Math.floor(Math.random() * 400);
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
