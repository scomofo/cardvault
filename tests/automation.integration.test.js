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

test("orders API includes shipment tracking after automated shipping", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-automation-orders-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 4250 + Math.floor(Math.random() * 100);
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
      id: "orders-api-item",
      name: "Leon Draisaitl",
      set: "Upper Deck",
      listedOn: [],
      priceHistory: [],
      marketPrice: 60,
      suggestedListingPrice: 69.99,
    }),
  });
  assert.equal(itemResponse.status, 201);

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "orders-api-listing",
      cardId: "orders-api-item",
      cardName: "Leon Draisaitl",
      cardSet: "Upper Deck",
      platform: "ebay",
      listingTitle: "Leon Draisaitl card",
      listingDescription: "Orders API should include shipment data",
      startPrice: 69.99,
      status: "draft",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "orders-api-order",
      itemId: "orders-api-item",
      listingId: "orders-api-listing",
      platform: "ebay",
      salePrice: 69.99,
      destinationCountry: "CA",
      paymentStatus: "paid",
      fulfillmentStatus: "pending",
    }),
  });
  assert.equal(orderResponse.status, 201);

  const shipmentResponse = await fetch(`${baseUrl}/api/automation/shipping/orders-api-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destinationCountry: "CA", weightOz: 6 }),
  });
  assert.equal(shipmentResponse.status, 200);
  const shipmentPayload = await shipmentResponse.json();

  const ordersResponse = await fetch(`${baseUrl}/api/orders`);
  assert.equal(ordersResponse.status, 200);
  const ordersPayload = await ordersResponse.json();
  const order = ordersPayload.find((entry) => entry.id === "orders-api-order");

  assert.ok(order);
  assert.equal(order.fulfillment_status, "shipped");
  assert.equal(order.tracking_number, shipmentPayload.tracking_number);
  assert.equal(order.shipment_status, shipmentPayload.status);
  assert.equal(order.service_level, shipmentPayload.service_level);
});

test("shipping automation repairs order state when a shipment already exists", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-automation-repair-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 4350 + Math.floor(Math.random() * 100);
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
      id: "repair-item",
      name: "Auston Matthews",
      set: "Upper Deck",
      listedOn: [],
      priceHistory: [],
      marketPrice: 70,
      suggestedListingPrice: 79.99,
    }),
  });
  assert.equal(itemResponse.status, 201);

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "repair-listing",
      cardId: "repair-item",
      cardName: "Auston Matthews",
      cardSet: "Upper Deck",
      platform: "ebay",
      listingTitle: "Auston Matthews card",
      listingDescription: "Existing shipment should repair order state",
      startPrice: 79.99,
      status: "draft",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "repair-order",
      itemId: "repair-item",
      listingId: "repair-listing",
      platform: "ebay",
      salePrice: 79.99,
      destinationCountry: "CA",
      paymentStatus: "paid",
      fulfillmentStatus: "pending",
    }),
  });
  assert.equal(orderResponse.status, 201);

  const db = new Database(dbPath);
  try {
    db.prepare(
      `INSERT INTO shipments
       (id, order_id, item_id, carrier, service_level, package_type, label_status, tracking_number,
        shipping_cost, packaging_cost, weight_oz, purchased_at, shipped_at, created_at, label_url, status, provider)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,?,?)`,
    ).run(
      "repair-shipment",
      "repair-order",
      "repair-item",
      "Canada Post",
      "Canada Post Tracked Packet",
      "card_mailer",
      "created",
      "TRK1234567890",
      13.0,
      0.35,
      3,
      new Date().toISOString(),
      new Date().toISOString(),
      "labels/repair-shipment.pdf",
      "shipped",
      "Canada Post",
    );
  } finally {
    db.close();
  }

  const shipmentResponse = await fetch(`${baseUrl}/api/automation/shipping/repair-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destinationCountry: "CA", weightOz: 3 }),
  });
  assert.equal(shipmentResponse.status, 200);
  const shipmentPayload = await shipmentResponse.json();
  assert.equal(shipmentPayload.id, "repair-shipment");

  const ordersResponse = await fetch(`${baseUrl}/api/orders`);
  assert.equal(ordersResponse.status, 200);
  const ordersPayload = await ordersResponse.json();
  const order = ordersPayload.find((entry) => entry.id === "repair-order");

  assert.ok(order);
  assert.equal(order.fulfillment_status, "shipped");
  assert.equal(order.tracking_number, "TRK1234567890");
});

test("manual order creation backfills the linked sale order_id", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-orders-sale-link-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 4450 + Math.floor(Math.random() * 100);
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
      id: "sale-link-item",
      name: "Patrick Roy",
      set: "Upper Deck",
      listedOn: [],
      priceHistory: [],
      costBasis: 15,
      marketPrice: 55,
      suggestedListingPrice: 59.99,
    }),
  });
  assert.equal(itemResponse.status, 201);

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "sale-link-listing",
      cardId: "sale-link-item",
      cardName: "Patrick Roy",
      cardSet: "Upper Deck",
      platform: "ebay",
      listingTitle: "Patrick Roy card",
      listingDescription: "Manual order should relink sale",
      startPrice: 59.99,
      status: "draft",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const saleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "sale-link-sale",
      cardId: "sale-link-item",
      listingId: "sale-link-listing",
      cardName: "Patrick Roy",
      cardSet: "Upper Deck",
      platform: "ebay",
      salePrice: 59.99,
      costBasis: 15,
      netProfit: 44.99,
    }),
  });
  assert.equal(saleResponse.status, 201);

  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "sale-link-order",
      saleId: "sale-link-sale",
      itemId: "sale-link-item",
      listingId: "sale-link-listing",
      platform: "ebay",
      salePrice: 59.99,
      destinationCountry: "CA",
      paymentStatus: "paid",
      fulfillmentStatus: "pending",
    }),
  });
  assert.equal(orderResponse.status, 201);

  const salesResponse = await fetch(`${baseUrl}/api/sales`);
  assert.equal(salesResponse.status, 200);
  const salesPayload = await salesResponse.json();
  const sale = salesPayload.find((entry) => entry.id === "sale-link-sale");

  assert.ok(sale);
  assert.equal(sale.orderId, "sale-link-order");
});

test("manual sale creation backfills the linked order sale_id", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-sales-order-link-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 4550 + Math.floor(Math.random() * 100);
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
      id: "order-link-item",
      name: "Martin Brodeur",
      set: "Upper Deck",
      listedOn: [],
      priceHistory: [],
      marketPrice: 50,
      suggestedListingPrice: 54.99,
    }),
  });
  assert.equal(itemResponse.status, 201);

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "order-link-listing",
      cardId: "order-link-item",
      cardName: "Martin Brodeur",
      cardSet: "Upper Deck",
      platform: "ebay",
      listingTitle: "Martin Brodeur card",
      listingDescription: "Manual sale should relink order",
      startPrice: 54.99,
      status: "draft",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "order-link-order",
      itemId: "order-link-item",
      listingId: "order-link-listing",
      platform: "ebay",
      salePrice: 54.99,
      destinationCountry: "CA",
      paymentStatus: "paid",
      fulfillmentStatus: "pending",
    }),
  });
  assert.equal(orderResponse.status, 201);

  const saleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "order-link-sale",
      orderId: "order-link-order",
      cardId: "order-link-item",
      listingId: "order-link-listing",
      cardName: "Martin Brodeur",
      cardSet: "Upper Deck",
      platform: "ebay",
      salePrice: 54.99,
      costBasis: 12,
      netProfit: 42.99,
    }),
  });
  assert.equal(saleResponse.status, 201);

  const ordersResponse = await fetch(`${baseUrl}/api/orders`);
  assert.equal(ordersResponse.status, 200);
  const ordersPayload = await ordersResponse.json();
  const order = ordersPayload.find((entry) => entry.id === "order-link-order");

  assert.ok(order);
  assert.equal(order.sale_id, "order-link-sale");
});

test("manual sale creation closes out linked listing and item state", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-sales-listing-close-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 4650 + Math.floor(Math.random() * 100);
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
      id: "listing-close-item",
      name: "Dominik Hasek",
      set: "Upper Deck",
      listedOn: [],
      priceHistory: [],
      costBasis: 18,
      marketPrice: 64,
      suggestedListingPrice: 69.99,
    }),
  });
  assert.equal(itemResponse.status, 201);

  const listingResponse = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "listing-close-listing",
      cardId: "listing-close-item",
      cardName: "Dominik Hasek",
      cardSet: "Upper Deck",
      platform: "ebay",
      listingTitle: "Dominik Hasek card",
      listingDescription: "Manual sale should close out listing state",
      startPrice: 69.99,
      status: "active",
    }),
  });
  assert.equal(listingResponse.status, 201);

  const soldAt = "2026-04-24T12:00:00.000Z";
  const saleResponse = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "listing-close-sale",
      cardId: "listing-close-item",
      listingId: "listing-close-listing",
      cardName: "Dominik Hasek",
      cardSet: "Upper Deck",
      platform: "ebay",
      salePrice: 69.99,
      costBasis: 18,
      netProfit: 51.99,
      date: soldAt,
    }),
  });
  assert.equal(saleResponse.status, 201);

  const listingsResponse = await fetch(`${baseUrl}/api/listings`);
  assert.equal(listingsResponse.status, 200);
  const listingsPayload = await listingsResponse.json();
  const listing = listingsPayload.find((entry) => entry.id === "listing-close-listing");

  assert.ok(listing);
  assert.equal(listing.status, "sold");
  assert.equal(listing.publishStatus, "sold");
  assert.equal(listing.soldPrice, 69.99);
  assert.equal(listing.soldDate, soldAt);

  const itemsResponse = await fetch(`${baseUrl}/api/items`);
  assert.equal(itemsResponse.status, 200);
  const itemsPayload = await itemsResponse.json();
  const item = itemsPayload.find((entry) => entry.id === "listing-close-item");

  assert.ok(item);
  assert.equal(item.status, "sold");
  assert.equal(item.saleStatus, "sold");
  assert.equal(item.listingStatus, "ended");
  assert.equal(item.soldAt, soldAt);
});
