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

  const draftItemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "draft-route-item",
      name: "Draft Route Card",
      set: "Route Set",
      number: "0",
      costBasis: 2.5,
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(draftItemResponse.status, 201);

  const draftListingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "draft-route-listing",
      cardId: "draft-route-item",
      cardName: "Draft Route Card",
      cardSet: "Route Set",
      cardNumber: "0",
      platform: "ebay",
      format: "fixed",
      startPrice: 10.5,
      shipping: 1.25,
      status: "draft",
    }),
  });
  assert.equal(draftListingResponse.status, 201);

  const draftedItemResponse = await fetch(`${baseUrl}/api/items/draft-route-item`);
  assert.equal(draftedItemResponse.status, 200);
  const draftedItemPayload = await draftedItemResponse.json();
  assert.equal(draftedItemPayload.status, "listed");
  assert.equal(draftedItemPayload.listingStatus, "draft");
  assert.equal(draftedItemPayload.saleStatus, "available");

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

  const reopenedListingResponse = await fetch(`${baseUrl}/api/listings/route-listing`, {
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
      status: "active",
    }),
  });
  assert.equal(reopenedListingResponse.status, 200);
  const reopenedListingPayload = await reopenedListingResponse.json();
  assert.equal(reopenedListingPayload.status, "active");
  assert.equal(reopenedListingPayload.publishStatus, "active");
  assert.equal(reopenedListingPayload.soldPrice, null);
  assert.equal(reopenedListingPayload.soldDate, null);

  const reopenedItemResponse = await fetch(`${baseUrl}/api/items/route-item`);
  assert.equal(reopenedItemResponse.status, 200);
  const reopenedItemPayload = await reopenedItemResponse.json();
  assert.equal(reopenedItemPayload.status, "listed");
  assert.equal(reopenedItemPayload.listingStatus, "listed");
  assert.equal(reopenedItemPayload.saleStatus, "available");
  assert.equal(reopenedItemPayload.soldAt, null);

  const multiItemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "multi-route-item",
      name: "Multi Route Card",
      set: "Route Set",
      number: "3",
      costBasis: 5.5,
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(multiItemResponse.status, 201);

  const firstMultiListingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "multi-route-listing-a",
      cardId: "multi-route-item",
      cardName: "Multi Route Card",
      cardSet: "Route Set",
      cardNumber: "3",
      platform: "ebay",
      format: "fixed",
      startPrice: 15.5,
      shipping: 1.25,
      status: "sold",
      soldPrice: 15.5,
      soldDate: "2026-04-24T19:00:00.000Z",
    }),
  });
  assert.equal(firstMultiListingResponse.status, 201);

  const secondMultiListingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "multi-route-listing-b",
      cardId: "multi-route-item",
      cardName: "Multi Route Card",
      cardSet: "Route Set",
      cardNumber: "3",
      platform: "shopify",
      format: "fixed",
      startPrice: 16.5,
      shipping: 1.25,
      status: "sold",
      soldPrice: 16.5,
      soldDate: "2026-04-24T19:05:00.000Z",
    }),
  });
  assert.equal(secondMultiListingResponse.status, 201);

  const unsellOneListingResponse = await fetch(`${baseUrl}/api/listings/multi-route-listing-a`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "multi-route-listing-a",
      cardId: "multi-route-item",
      cardName: "Multi Route Card",
      cardSet: "Route Set",
      cardNumber: "3",
      platform: "ebay",
      format: "fixed",
      startPrice: 15.5,
      shipping: 1.25,
      status: "active",
    }),
  });
  assert.equal(unsellOneListingResponse.status, 200);

  const stillSoldItemResponse = await fetch(`${baseUrl}/api/items/multi-route-item`);
  assert.equal(stillSoldItemResponse.status, 200);
  const stillSoldItemPayload = await stillSoldItemResponse.json();
  assert.equal(stillSoldItemPayload.status, "sold");
  assert.equal(stillSoldItemPayload.listingStatus, "ended");
  assert.equal(stillSoldItemPayload.saleStatus, "sold");

  const deleteSoldSiblingResponse = await fetch(`${baseUrl}/api/listings/multi-route-listing-b`, {
    method: "DELETE",
  });
  assert.equal(deleteSoldSiblingResponse.status, 200);

  const revertedMultiItemResponse = await fetch(`${baseUrl}/api/items/multi-route-item`);
  assert.equal(revertedMultiItemResponse.status, 200);
  const revertedMultiItemPayload = await revertedMultiItemResponse.json();
  assert.equal(revertedMultiItemPayload.status, "listed");
  assert.equal(revertedMultiItemPayload.listingStatus, "listed");
  assert.equal(revertedMultiItemPayload.saleStatus, "available");
  assert.equal(revertedMultiItemPayload.soldAt, null);

  const soldCreateItemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "sold-create-item",
      name: "Sold Create Card",
      set: "Route Set",
      number: "4",
      costBasis: 6.5,
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(soldCreateItemResponse.status, 201);

  const soldCreateListingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "sold-create-listing-a",
      cardId: "sold-create-item",
      cardName: "Sold Create Card",
      cardSet: "Route Set",
      cardNumber: "4",
      platform: "ebay",
      format: "fixed",
      startPrice: 17.5,
      shipping: 1.25,
      status: "sold",
      soldPrice: 17.5,
      soldDate: "2026-04-24T19:10:00.000Z",
    }),
  });
  assert.equal(soldCreateListingResponse.status, 201);

  const activeSiblingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "sold-create-listing-b",
      cardId: "sold-create-item",
      cardName: "Sold Create Card",
      cardSet: "Route Set",
      cardNumber: "4",
      platform: "shopify",
      format: "fixed",
      startPrice: 18.5,
      shipping: 1.25,
      status: "active",
    }),
  });
  assert.equal(activeSiblingResponse.status, 201);

  const stillSoldAfterCreateResponse = await fetch(`${baseUrl}/api/items/sold-create-item`);
  assert.equal(stillSoldAfterCreateResponse.status, 200);
  const stillSoldAfterCreatePayload = await stillSoldAfterCreateResponse.json();
  assert.equal(stillSoldAfterCreatePayload.status, "sold");
  assert.equal(stillSoldAfterCreatePayload.listingStatus, "ended");
  assert.equal(stillSoldAfterCreatePayload.saleStatus, "sold");

  const soldDraftItemResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "sold-draft-item",
      name: "Sold Draft Card",
      set: "Route Set",
      number: "5",
      costBasis: 7.5,
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(soldDraftItemResponse.status, 201);

  const soldDraftListingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "sold-draft-listing-a",
      cardId: "sold-draft-item",
      cardName: "Sold Draft Card",
      cardSet: "Route Set",
      cardNumber: "5",
      platform: "ebay",
      format: "fixed",
      startPrice: 19.5,
      shipping: 1.25,
      status: "sold",
      soldPrice: 19.5,
      soldDate: "2026-04-24T19:20:00.000Z",
    }),
  });
  assert.equal(soldDraftListingResponse.status, 201);

  const siblingDraftListingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "sold-draft-listing-b",
      cardId: "sold-draft-item",
      cardName: "Sold Draft Card",
      cardSet: "Route Set",
      cardNumber: "5",
      platform: "shopify",
      format: "fixed",
      startPrice: 20.5,
      shipping: 1.25,
      status: "draft",
    }),
  });
  assert.equal(siblingDraftListingResponse.status, 201);

  const deleteSoldDraftResponse = await fetch(`${baseUrl}/api/listings/sold-draft-listing-a`, {
    method: "DELETE",
  });
  assert.equal(deleteSoldDraftResponse.status, 200);

  const reopenedDraftItemResponse = await fetch(`${baseUrl}/api/items/sold-draft-item`);
  assert.equal(reopenedDraftItemResponse.status, 200);
  const reopenedDraftItemPayload = await reopenedDraftItemResponse.json();
  assert.equal(reopenedDraftItemPayload.status, "listed");
  assert.equal(reopenedDraftItemPayload.listingStatus, "draft");
  assert.equal(reopenedDraftItemPayload.saleStatus, "available");
  assert.equal(reopenedDraftItemPayload.soldAt, null);

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
