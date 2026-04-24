import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import Database from "better-sqlite3";

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

test("automation routes handle identify-price, listing generation, aging repricing, shipping, and action queue", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-automation-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 3950 + Math.floor(Math.random() * 100);
  const baseUrl = `http://127.0.0.1:${port}`;

  const server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CARDVAULT_DB_PATH: dbPath,
      // Force the deterministic simulator so the automation pipeline produces
      // stable pricing output without needing eBay credentials in CI.
      PRICING_SOURCE: "sportscardspro",
    },
    stdio: "ignore",
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
      id: "auto-item",
      name: "Sidney Crosby",
      playerName: "Sidney Crosby",
      set: "Upper Deck",
      number: "87",
      listedOn: [],
      priceHistory: [],
      costBasis: 12,
      cv_centering_score: 0.96,
      frontImgId: "front-1",
      acquisitionDate: "2025-08-01T00:00:00.000Z",
    }),
  });
  assert.equal(itemResponse.status, 201);

  const identifyResponse = await fetch(`${baseUrl}/api/automation/identify-price/auto-item`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pricingStrategy: "market",
      visualSearchResult: {
        name: "Sidney Crosby",
        set: "Upper Deck",
        year: "2024",
        number: "87",
        rarity: "base",
        parallel: "",
        type: "sports",
        confidence: "high",
      },
    }),
  });
  assert.equal(identifyResponse.status, 200);
  const identifyPayload = await identifyResponse.json();
  assert.equal(identifyPayload.identification.recommendation, "auto_accept_match");
  assert.ok(identifyPayload.pricing.suggestedPrice > 0);

  const listingResponse = await fetch(`${baseUrl}/api/automation/listings/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemIds: ["auto-item"], platform: "ebay" }),
  });
  assert.equal(listingResponse.status, 200);
  const listingPayload = await listingResponse.json();
  assert.equal(listingPayload.drafts.length, 1);
  assert.match(listingPayload.drafts[0].automation_state, /publish_ready|draft_ready/);

  const agingResponse = await fetch(`${baseUrl}/api/automation/aging-repricing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ autoApply: false }),
  });
  assert.equal(agingResponse.status, 200);
  const agingPayload = await agingResponse.json();
  assert.ok(Array.isArray(agingPayload));
  assert.ok(agingPayload.some((entry) => entry.itemId === "auto-item"));

  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "auto-order",
      itemId: "auto-item",
      listingId: listingPayload.drafts[0].id,
      platform: "ebay",
      salePrice: 39.99,
      destinationCountry: "CA",
      paymentStatus: "paid",
      fulfillmentStatus: "pending",
    }),
  });
  assert.equal(orderResponse.status, 201);

  const shipmentResponse = await fetch(`${baseUrl}/api/automation/shipping/auto-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destinationCountry: "CA", weightOz: 3 }),
  });
  assert.equal(shipmentResponse.status, 200);
  const shipmentPayload = await shipmentResponse.json();
  assert.equal(shipmentPayload.status, "shipped");
  assert.match(shipmentPayload.service_level, /Canada Post/);

  const queueResponse = await fetch(`${baseUrl}/api/automation/action-queue`);
  assert.equal(queueResponse.status, 200);
  const queuePayload = await queueResponse.json();
  assert.ok(Array.isArray(queuePayload.queue));
});

test("shipping automation records tracking against the order marketplace channel", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-automation-shipping-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 4050 + Math.floor(Math.random() * 100);
  const baseUrl = `http://127.0.0.1:${port}`;

  const server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CARDVAULT_DB_PATH: dbPath,
    },
    stdio: "ignore",
  });

  t.after(async () => {
    if (!server.killed) {
      server.kill("SIGTERM");
    }
    await new Promise((resolve) => server.once("exit", resolve));
    await rm(tempDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl);

  await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "ship-channel-item",
      name: "Nathan MacKinnon",
      set: "Upper Deck",
      listedOn: [],
      priceHistory: [],
      marketPrice: 80,
      suggestedListingPrice: 89.99,
    }),
  });

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "ship-channel-listing",
      cardId: "ship-channel-item",
      cardName: "Nathan MacKinnon",
      cardSet: "Upper Deck",
      platform: "ebay",
      listingTitle: "Nathan MacKinnon card",
      listingDescription: "Shipping should target the ebay channel",
      startPrice: 89.99,
      status: "draft",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const publishResponse = await fetch(`${baseUrl}/api/marketplaces/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: "ship-channel-listing", marketplace: "ebay" }),
  });
  assert.equal(publishResponse.status, 200);

  const crosspostResponse = await fetch(`${baseUrl}/api/marketplaces/crosspost`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: "ship-channel-listing", marketplaces: ["shopify"] }),
  });
  assert.equal(crosspostResponse.status, 200);

  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "ship-channel-order",
      itemId: "ship-channel-item",
      listingId: "ship-channel-listing",
      platform: "ebay",
      salePrice: 89.99,
      destinationCountry: "CA",
      paymentStatus: "paid",
      fulfillmentStatus: "pending",
    }),
  });
  assert.equal(orderResponse.status, 201);

  const shipmentResponse = await fetch(`${baseUrl}/api/automation/shipping/ship-channel-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destinationCountry: "CA", weightOz: 3 }),
  });
  assert.equal(shipmentResponse.status, 200);

  const channelsResponse = await fetch(`${baseUrl}/api/marketplaces/listings/ship-channel-listing/channels`);
  assert.equal(channelsResponse.status, 200);
  const channelsPayload = await channelsResponse.json();
  const ebayChannel = channelsPayload.channels.find((channel) => channel.marketplace === "ebay");
  const shopifyChannel = channelsPayload.channels.find((channel) => channel.marketplace === "shopify");

  assert.ok(ebayChannel);
  assert.ok(shopifyChannel);

  const db = new Database(dbPath, { readonly: true });
  try {
    const trackingEvents = db.prepare(
      `SELECT listing_channel_id, event_type, status, payload
       FROM listing_channel_events
       WHERE event_type = 'tracking_sync'
       ORDER BY created_at DESC`,
    ).all();

    assert.equal(trackingEvents.length, 1);
    assert.equal(trackingEvents[0].listing_channel_id, ebayChannel.id);
    assert.notEqual(trackingEvents[0].listing_channel_id, shopifyChannel.id);
  } finally {
    db.close();
  }
});

test("shipping automation is idempotent for the same order", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-automation-idempotent-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 4150 + Math.floor(Math.random() * 100);
  const baseUrl = `http://127.0.0.1:${port}`;

  const server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CARDVAULT_DB_PATH: dbPath,
    },
    stdio: "ignore",
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
      id: "idempotent-item",
      name: "Cale Makar",
      set: "Upper Deck",
      listedOn: [],
      priceHistory: [],
      marketPrice: 45,
      suggestedListingPrice: 49.99,
    }),
  });
  assert.equal(itemResponse.status, 201);

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "idempotent-listing",
      cardId: "idempotent-item",
      cardName: "Cale Makar",
      cardSet: "Upper Deck",
      platform: "ebay",
      listingTitle: "Cale Makar card",
      listingDescription: "Duplicate shipment guard test",
      startPrice: 49.99,
      status: "draft",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "idempotent-order",
      itemId: "idempotent-item",
      listingId: "idempotent-listing",
      platform: "ebay",
      salePrice: 49.99,
      destinationCountry: "CA",
      paymentStatus: "paid",
      fulfillmentStatus: "pending",
    }),
  });
  assert.equal(orderResponse.status, 201);

  const firstResponse = await fetch(`${baseUrl}/api/automation/shipping/idempotent-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destinationCountry: "CA", weightOz: 3 }),
  });
  assert.equal(firstResponse.status, 200);
  const firstShipment = await firstResponse.json();

  const secondResponse = await fetch(`${baseUrl}/api/automation/shipping/idempotent-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destinationCountry: "US", weightOz: 8 }),
  });
  assert.equal(secondResponse.status, 200);
  const secondShipment = await secondResponse.json();

  assert.equal(secondShipment.id, firstShipment.id);

  const db = new Database(dbPath, { readonly: true });
  try {
    const shipments = db.prepare(
      `SELECT id, order_id FROM shipments WHERE order_id = ? ORDER BY created_at DESC`,
    ).all("idempotent-order");
    assert.equal(shipments.length, 1);
    assert.equal(shipments[0].id, firstShipment.id);
  } finally {
    db.close();
  }
});
