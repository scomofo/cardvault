import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";

import { startTestServer } from "./helpers/testServer.js";

async function postJson(baseUrl, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function insertShippingProvider(dbPath, metadata) {
  const db = new Database(dbPath);
  try {
    db.prepare(
      `INSERT INTO shipping_provider_connections
       (id, provider, auth_status, api_key, metadata, created_at, updated_at)
       VALUES (?,?,?,?,?,datetime('now'),datetime('now'))`,
    ).run(
      "canada-post-provider",
      "Canada Post",
      "configured",
      "secret-provider-key",
      JSON.stringify(metadata),
    );
  } finally {
    db.close();
  }
}

async function createOrderFixture(baseUrl, idPrefix, salePrice = 129.99) {
  const itemId = `${idPrefix}-item`;
  const listingId = `${idPrefix}-listing`;
  const orderId = `${idPrefix}-order`;

  assert.equal((await postJson(baseUrl, "/api/items", {
    id: itemId,
    name: "Connor McDavid",
    set: "Upper Deck",
    listedOn: [],
    priceHistory: [],
    marketPrice: salePrice,
    suggestedListingPrice: salePrice,
  })).status, 201);

  assert.equal((await postJson(baseUrl, "/api/listings", {
    id: listingId,
    cardId: itemId,
    cardName: "Connor McDavid",
    cardSet: "Upper Deck",
    platform: "ebay",
    listingTitle: "Connor McDavid card",
    listingDescription: "Provider lifecycle test listing",
    startPrice: salePrice,
    status: "draft",
  })).status, 201);

  assert.equal((await postJson(baseUrl, "/api/marketplaces/publish", {
    listingId,
    marketplace: "ebay",
  })).status, 200);

  assert.equal((await postJson(baseUrl, "/api/orders", {
    id: orderId,
    itemId,
    listingId,
    platform: "ebay",
    salePrice,
    destinationCountry: "CA",
    paymentStatus: "paid",
    fulfillmentStatus: "pending",
  })).status, 201);

  return { itemId, listingId, orderId };
}

test("shipping automation persists purchased provider label metadata", async (t) => {
  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-label-purchased-" });
  insertShippingProvider(dbPath, {
    rates: [{
      service: "Canada Post Expedited Parcel",
      serviceCode: "DOM.EP",
      countries: ["CA"],
      maxWeightOz: 8,
      cost: 9.75,
      tracking: true,
      labelPurchase: {
        labelStatus: "purchased",
        trackingNumber: "CP-PURCHASED-123",
        labelUrl: "labels/canada-post/{shipmentId}.pdf",
      },
    }],
  });
  const { orderId } = await createOrderFixture(baseUrl, "purchased");

  const response = await postJson(baseUrl, `/api/automation/shipping/${orderId}`, {
    destinationCountry: "CA",
    weightOz: 6,
  });
  assert.equal(response.status, 200);
  const shipment = await response.json();

  assert.equal(shipment.label_status, "purchased");
  assert.equal(shipment.status, "shipped");
  assert.equal(shipment.tracking_number, "CP-PURCHASED-123");
  assert.equal(shipment.label_url, `labels/canada-post/${shipment.id}.pdf`);

  const db = new Database(dbPath, { readonly: true });
  try {
    const event = db.prepare(
      `SELECT payload
       FROM listing_channel_events
       WHERE event_type = 'tracking_sync'
       ORDER BY created_at DESC
       LIMIT 1`,
    ).get();
    assert.ok(event);
    assert.match(event.payload, /"labelStatus":"purchased"/);
    assert.doesNotMatch(event.payload, /secret-provider-key|apiKey|api_key/);
  } finally {
    db.close();
  }
});

test("shipping automation records provider label failures for retry", async (t) => {
  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-label-failed-" });
  insertShippingProvider(dbPath, {
    rates: [{
      service: "Canada Post Expedited Parcel",
      serviceCode: "DOM.EP",
      countries: ["CA"],
      maxWeightOz: 8,
      cost: 9.75,
      tracking: true,
      labelPurchase: {
        labelStatus: "failed",
        error: "Carrier label endpoint unavailable",
      },
    }],
  });
  const { orderId } = await createOrderFixture(baseUrl, "failed");

  const response = await postJson(baseUrl, `/api/automation/shipping/${orderId}`, {
    destinationCountry: "CA",
    weightOz: 6,
  });
  assert.equal(response.status, 200);
  const shipment = await response.json();

  assert.equal(shipment.label_status, "failed");
  assert.equal(shipment.status, "exception");
  assert.equal(shipment.tracking_number, null);

  const ordersResponse = await fetch(`${baseUrl}/api/orders`);
  assert.equal(ordersResponse.status, 200);
  const order = (await ordersResponse.json()).find((entry) => entry.id === orderId);
  assert.equal(order.fulfillmentStatus, "shipping_exception");

  const queueResponse = await fetch(`${baseUrl}/api/action-queue`);
  assert.equal(queueResponse.status, 200);
  const retryAction = (await queueResponse.json()).find((entry) => entry.subjectId === orderId);
  assert.equal(retryAction.queue, "shipping_exception");
  assert.equal(retryAction.suggestedAction, "retry_shipment");

  const db = new Database(dbPath, { readonly: true });
  try {
    const event = db.prepare(
      `SELECT event_type, status, payload
       FROM listing_channel_events
       WHERE event_type = 'shipping_exception'
       ORDER BY created_at DESC
       LIMIT 1`,
    ).get();
    assert.equal(event.status, "failed");
    assert.match(event.payload, /Carrier label endpoint unavailable/);
    assert.doesNotMatch(event.payload, /secret-provider-key|apiKey|api_key/);
  } finally {
    db.close();
  }
});
