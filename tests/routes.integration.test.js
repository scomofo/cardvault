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

test("server routes handle validation, migration, and listing side effects", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-routes-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 3100 + Math.floor(Math.random() * 400);
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

  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  t.after(async () => {
    if (!server.killed) {
      server.kill("SIGTERM");
    }
    await new Promise((resolve) => server.once("exit", resolve));
    await rm(tempDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl);

  const invalidItemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listedOn: "bad" }),
  });
  assert.equal(invalidItemResponse.status, 400);

  const migrateResponse = await fetch(`${baseUrl}/api/migrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      catalog: [
        {
          id: "migrated-item",
          name: "Migrated Card",
          set: "Seed Set",
          number: "7",
          listedOn: [],
          priceHistory: [],
        },
      ],
      settings: { userName: "Route Test" },
    }),
  });
  assert.equal(migrateResponse.status, 200);
  const migratePayload = await migrateResponse.json();
  assert.equal(migratePayload.success, true);
  assert.equal(migratePayload.imported.items, 1);

  const createdItemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "route-item",
      name: "Route Card",
      set: "Route Set",
      number: "1",
      costBasis: 3.5,
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(createdItemResponse.status, 201);

  const createdListingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "route-listing",
      cardId: "route-item",
      cardName: "Route Card",
      cardSet: "Route Set",
      cardNumber: "1",
      platform: "ebay",
      format: "fixed",
      startPrice: 12.5,
      shipping: 1.25,
    }),
  });
  assert.equal(createdListingResponse.status, 201);

  const itemResponse = await fetch(`${baseUrl}/api/items/route-item`);
  assert.equal(itemResponse.status, 200);
  const itemPayload = await itemResponse.json();
  assert.equal(itemPayload.status, "listed");

  const soldAt = "2026-04-24T18:30:00.000Z";
  const updatedListingResponse = await fetch(`${baseUrl}/api/listings/route-listing`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "route-listing",
      cardId: "route-item",
      cardName: "Route Card",
      cardSet: "Route Set",
      cardNumber: "1",
      platform: "ebay",
      format: "fixed",
      startPrice: 12.5,
      shipping: 1.25,
      status: "sold",
      soldPrice: 12.5,
      soldDate: soldAt,
    }),
  });
  assert.equal(updatedListingResponse.status, 200);
  const updatedListingPayload = await updatedListingResponse.json();
  assert.equal(updatedListingPayload.status, "sold");
  assert.equal(updatedListingPayload.publishStatus, "sold");
  assert.equal(updatedListingPayload.soldDate, soldAt);

  const soldItemResponse = await fetch(`${baseUrl}/api/items/route-item`);
  assert.equal(soldItemResponse.status, 200);
  const soldItemPayload = await soldItemResponse.json();
  assert.equal(soldItemPayload.status, "sold");
  assert.equal(soldItemPayload.listingStatus, "ended");
  assert.equal(soldItemPayload.saleStatus, "sold");
  assert.equal(soldItemPayload.soldAt, soldAt);

  const secondItemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "delete-route-item",
      name: "Delete Route Card",
      set: "Route Set",
      number: "2",
      costBasis: 4.5,
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(secondItemResponse.status, 201);

  const secondListingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "delete-route-listing",
      cardId: "delete-route-item",
      cardName: "Delete Route Card",
      cardSet: "Route Set",
      cardNumber: "2",
      platform: "ebay",
      format: "fixed",
      startPrice: 14.5,
      shipping: 1.25,
    }),
  });
  assert.equal(secondListingResponse.status, 201);

  const deleteListingResponse = await fetch(`${baseUrl}/api/listings/delete-route-listing`, {
    method: "DELETE",
  });
  assert.equal(deleteListingResponse.status, 200);

  const revertedItemResponse = await fetch(`${baseUrl}/api/items/delete-route-item`);
  assert.equal(revertedItemResponse.status, 200);
  const revertedItemPayload = await revertedItemResponse.json();
  assert.equal(revertedItemPayload.status, "inventory");
  assert.equal(revertedItemPayload.listingStatus, "not_listed");
  assert.equal(revertedItemPayload.saleStatus, "available");

  const settingsResponse = await fetch(`${baseUrl}/api/settings`);
  const settingsPayload = await settingsResponse.json();
  assert.equal(settingsPayload.userName, "Route Test");

  assert.match(stderr, /No ANTHROPIC_API_KEY|^$/);
});
