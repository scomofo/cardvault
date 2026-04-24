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
  const draftListingPayload = await draftListingResponse.json();
  assert.equal(draftListingPayload.publishStatus, "draft");

  const draftedItemResponse = await fetch(`${baseUrl}/api/items/draft-route-item`);
  assert.equal(draftedItemResponse.status, 200);
  const draftedItemPayload = await draftedItemResponse.json();
  assert.equal(draftedItemPayload.status, "listed");
  assert.equal(draftedItemPayload.listingStatus, "draft");
  assert.equal(draftedItemPayload.saleStatus, "available");

  const activateDraftListingResponse = await fetch(`${baseUrl}/api/listings/draft-route-listing`, {
    method: "PUT",
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
      status: "active",
    }),
  });
  assert.equal(activateDraftListingResponse.status, 200);

  const activeDraftItemResponse = await fetch(`${baseUrl}/api/items/draft-route-item`);
  assert.equal(activeDraftItemResponse.status, 200);
  const activeDraftItemPayload = await activeDraftItemResponse.json();
  assert.equal(activeDraftItemPayload.listingStatus, "listed");

  const redraftListingResponse = await fetch(`${baseUrl}/api/listings/draft-route-listing`, {
    method: "PUT",
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
  assert.equal(redraftListingResponse.status, 200);
  const redraftListingPayload = await redraftListingResponse.json();
  assert.equal(redraftListingPayload.publishStatus, "draft");

  const redraftedItemResponse = await fetch(`${baseUrl}/api/items/draft-route-item`);
  assert.equal(redraftedItemResponse.status, 200);
  const redraftedItemPayload = await redraftedItemResponse.json();
  assert.equal(redraftedItemPayload.status, "listed");
  assert.equal(redraftedItemPayload.listingStatus, "draft");
  assert.equal(redraftedItemPayload.saleStatus, "available");

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
  const soldCreateListingPayload = await soldCreateListingResponse.json();
  assert.equal(soldCreateListingPayload.publishStatus, "sold");
  assert.equal(soldCreateListingPayload.soldPrice, 17.5);
  assert.equal(soldCreateListingPayload.soldDate, "2026-04-24T19:10:00.000Z");

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

  const createdPurchaseResponse = await fetch(`${baseUrl}/api/purchases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "route-purchase",
      name: "Purchase Card",
      card_set: "Purchase Set",
      platform: "ebay",
      seller: "seller-1",
      price: 25,
      shipping: 3.5,
      total_cost: 28.5,
      date: "2026-04-24",
      notes: "Route purchase",
    }),
  });
  assert.equal(createdPurchaseResponse.status, 201);
  const createdPurchasePayload = await createdPurchaseResponse.json();
  assert.equal(createdPurchasePayload.cardSet, "Purchase Set");
  assert.equal(createdPurchasePayload.totalCost, 28.5);
  assert.ok("createdAt" in createdPurchasePayload);
  assert.equal("card_set" in createdPurchasePayload, false);
  assert.equal("total_cost" in createdPurchasePayload, false);

  const purchasesResponse = await fetch(`${baseUrl}/api/purchases`);
  assert.equal(purchasesResponse.status, 200);
  const purchasesPayload = await purchasesResponse.json();
  assert.equal(Array.isArray(purchasesPayload), true);
  assert.equal(purchasesPayload[0].cardSet, "Purchase Set");
  assert.equal(purchasesPayload[0].totalCost, 28.5);
  assert.ok("createdAt" in purchasesPayload[0]);
  assert.equal("card_set" in purchasesPayload[0], false);
  assert.equal("total_cost" in purchasesPayload[0], false);

  const createdConnectionResponse = await fetch(`${baseUrl}/api/marketplace-connections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      marketplace: "shopify",
      shopName: "route-store",
      authStatus: "connected",
      metadata: { region: "ca" },
    }),
  });
  assert.equal(createdConnectionResponse.status, 201);
  const createdConnectionPayload = await createdConnectionResponse.json();
  assert.equal(createdConnectionPayload.marketplace, "shopify");
  assert.equal(createdConnectionPayload.accountLabel, "route-store");
  assert.equal(createdConnectionPayload.authStatus, "connected");
  assert.deepEqual(createdConnectionPayload.metadata, { region: "ca" });
  assert.ok("createdAt" in createdConnectionPayload);
  assert.equal("account_label" in createdConnectionPayload, false);
  assert.equal("auth_status" in createdConnectionPayload, false);
  assert.equal("access_token" in createdConnectionPayload, false);
  assert.equal("refresh_token" in createdConnectionPayload, false);

  const connectionsResponse = await fetch(`${baseUrl}/api/marketplace-connections`);
  assert.equal(connectionsResponse.status, 200);
  const connectionsPayload = await connectionsResponse.json();
  assert.equal(Array.isArray(connectionsPayload), true);
  assert.equal(connectionsPayload[0].accountLabel, "route-store");
  assert.equal(connectionsPayload[0].authStatus, "connected");
  assert.deepEqual(connectionsPayload[0].metadata, { region: "ca" });
  assert.ok("updatedAt" in connectionsPayload[0]);
  assert.equal("access_token" in connectionsPayload[0], false);
  assert.equal("refresh_token" in connectionsPayload[0], false);

  const tradeResponse = await fetch(`${baseUrl}/api/trades`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "route-trade",
      partner: "Trade Partner",
      gave: "Card A",
      received: "Card B",
      gaveValue: 5,
      receivedValue: 7.5,
      date: "2026-04-24",
      notes: "Route trade",
    }),
  });
  assert.equal(tradeResponse.status, 201);
  const tradePayload = await tradeResponse.json();
  assert.equal(tradePayload.gaveValue, 5);
  assert.equal(tradePayload.receivedValue, 7.5);
  assert.ok("createdAt" in tradePayload);
  assert.equal("gave_value" in tradePayload, false);

  const watchlistResponse = await fetch(`${baseUrl}/api/watchlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "route-watch",
      name: "Watch Card",
      cardSet: "Watch Set",
      cardNumber: "9",
      targetPrice: 15,
      currentPrice: 12.5,
      priceHistory: [{ price: 12.5, date: "2026-04-24" }],
    }),
  });
  assert.equal(watchlistResponse.status, 201);
  const watchlistPayload = await watchlistResponse.json();
  assert.equal(watchlistPayload.cardSet, "Watch Set");
  assert.equal(watchlistPayload.cardNumber, "9");
  assert.equal(watchlistPayload.targetPrice, 15);
  assert.equal(watchlistPayload.currentPrice, 12.5);
  assert.deepEqual(watchlistPayload.priceHistory, [{ price: 12.5, date: "2026-04-24" }]);
  assert.equal("target_price" in watchlistPayload, false);

  const gradingResponse = await fetch(`${baseUrl}/api/gradings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "route-grading",
      cardName: "Grade Card",
      cardSet: "Grade Set",
      cardNumber: "10",
      company: "PSA",
      service: "Economy",
      cost: 22,
      dateSent: "2026-04-24",
      preValue: 40,
      status: "sent",
      certNumber: "CERT-1",
      postValue: 75,
    }),
  });
  assert.equal(gradingResponse.status, 201);
  const gradingPayload = await gradingResponse.json();
  assert.equal(gradingPayload.cardName, "Grade Card");
  assert.equal(gradingPayload.cardSet, "Grade Set");
  assert.equal(gradingPayload.cardNumber, "10");
  assert.equal(gradingPayload.dateSent, "2026-04-24");
  assert.equal(gradingPayload.preValue, 40);
  assert.equal(gradingPayload.certNumber, "CERT-1");
  assert.equal(gradingPayload.postValue, 75);
  assert.equal("card_name" in gradingPayload, false);
  assert.equal("date_sent" in gradingPayload, false);

  const tradesListResponse = await fetch(`${baseUrl}/api/trades`);
  assert.equal(tradesListResponse.status, 200);
  const tradesListPayload = await tradesListResponse.json();
  assert.equal(tradesListPayload[0].gaveValue, 5);
  assert.equal("gave_value" in tradesListPayload[0], false);

  const watchlistListResponse = await fetch(`${baseUrl}/api/watchlist`);
  assert.equal(watchlistListResponse.status, 200);
  const watchlistListPayload = await watchlistListResponse.json();
  assert.equal(watchlistListPayload[0].targetPrice, 15);
  assert.deepEqual(watchlistListPayload[0].priceHistory, [{ price: 12.5, date: "2026-04-24" }]);
  assert.equal("target_price" in watchlistListPayload[0], false);

  const gradingsListResponse = await fetch(`${baseUrl}/api/gradings`);
  assert.equal(gradingsListResponse.status, 200);
  const gradingsListPayload = await gradingsListResponse.json();
  assert.equal(gradingsListPayload[0].cardName, "Grade Card");
  assert.equal(gradingsListPayload[0].dateSent, "2026-04-24");
  assert.equal("card_name" in gradingsListPayload[0], false);

  assert.match(stderr, /No ANTHROPIC_API_KEY|^$/);
});
