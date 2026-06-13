import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { createServer } from "node:http";

import { startTestServer } from "./helpers/testServer.js";

async function postJson(baseUrl, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function insertShippingProvider(dbPath, metadata, provider = "Canada Post") {
  const db = new Database(dbPath);
  try {
    db.prepare(
      `INSERT INTO shipping_provider_connections
       (id, provider, auth_status, api_key, metadata, created_at, updated_at)
       VALUES (?,?,?,?,?,datetime('now'),datetime('now'))`,
    ).run(
      "canada-post-provider",
      provider,
      "configured",
      "secret-provider-key",
      JSON.stringify(metadata),
    );
  } finally {
    db.close();
  }
}

async function startLabelEndpoint(handler) {
  const requests = [];
  const server = createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const payload = body ? JSON.parse(body) : {};
      requests.push({ headers: req.headers, payload });
      handler({ req, res, payload });
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    requests,
    url: `http://127.0.0.1:${port}/labels`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function startXmlEndpoint(handler) {
  const requests = [];
  const server = createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      handler({ req, res, body });
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    requests,
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
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

test("shipping automation purchases provider labels through a live HTTP client", async (t) => {
  const labelEndpoint = await startLabelEndpoint(({ res }) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      labelStatus: "purchased",
      trackingNumber: "HTTP-TRACK-123",
      labelUrl: "labels/http/{trackingNumber}/{shipmentId}.pdf",
    }));
  });
  t.after(labelEndpoint.close);

  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-live-label-purchased-" });
  insertShippingProvider(dbPath, {
    labelPurchaseUrl: labelEndpoint.url,
    apiKeyHeader: "X-API-KEY",
    apiKeyPrefix: "",
    rates: [{
      service: "Canada Post Expedited Parcel",
      serviceCode: "DOM.EP",
      countries: ["CA"],
      maxWeightOz: 8,
      cost: 9.75,
      tracking: true,
    }],
  }, "Generic Ship API");
  const { orderId } = await createOrderFixture(baseUrl, "live-purchased");

  const response = await postJson(baseUrl, `/api/automation/shipping/${orderId}`, {
    provider: "Generic Ship API",
    destinationCountry: "CA",
    weightOz: 6,
  });
  assert.equal(response.status, 200);
  const shipment = await response.json();

  assert.equal(labelEndpoint.requests.length, 1);
  assert.equal(labelEndpoint.requests[0].headers["x-api-key"], "secret-provider-key");
  assert.equal(labelEndpoint.requests[0].headers.authorization, undefined);
  assert.ok(labelEndpoint.requests[0].payload.shipmentId);
  assert.equal(labelEndpoint.requests[0].payload.serviceCode, "DOM.EP");
  assert.equal(labelEndpoint.requests[0].payload.destination.country, "CA");
  assert.equal(Object.hasOwn(labelEndpoint.requests[0].payload, "apiKey"), false);
  assert.equal(Object.hasOwn(labelEndpoint.requests[0].payload, "api_key"), false);
  assert.equal(JSON.stringify(labelEndpoint.requests[0].payload).includes("secret-provider-key"), false);
  assert.equal(shipment.label_status, "purchased");
  assert.equal(shipment.status, "shipped");
  assert.equal(shipment.tracking_number, "HTTP-TRACK-123");
  assert.equal(shipment.label_url, `labels/http/HTTP-TRACK-123/${shipment.id}.pdf`);

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

test("shipping automation applies Canada Post native payload defaults for live purchases", async (t) => {
  const labelEndpoint = await startLabelEndpoint(({ res }) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      labelStatus: "purchased",
      trackingNumber: "CP-LIVE-123",
    }));
  });
  t.after(labelEndpoint.close);

  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-canada-post-live-label-" });
  insertShippingProvider(dbPath, {
    providerClient: "canada_post",
    labelPurchaseUrl: labelEndpoint.url,
    apiKeyHeader: "X-CP-KEY",
    apiKeyPrefix: "",
    customerNumber: "1234567",
    contractId: "0045678",
    originPostalCode: "T2P 1J9",
    shipFrom: {
      name: "CardVault",
      addressLine1: "1 Arena Way",
      city: "Calgary",
      province: "AB",
      postalCode: "T2P 1J9",
    },
    packageDimensionsCm: { length: 16, width: 11, height: 1 },
    rates: [{
      service: "Canada Post Expedited Parcel",
      serviceCode: "DOM.EP",
      countries: ["CA"],
      maxWeightOz: 8,
      cost: 9.75,
      tracking: true,
    }],
  });
  const { orderId } = await createOrderFixture(baseUrl, "canada-post-live");

  const response = await postJson(baseUrl, `/api/automation/shipping/${orderId}`, {
    destinationCountry: "CA",
    destinationPostalCode: "K1A 0B1",
    weightOz: 6,
  });
  assert.equal(response.status, 200);
  const shipment = await response.json();

  assert.equal(labelEndpoint.requests.length, 1);
  assert.equal(labelEndpoint.requests[0].headers["x-cp-key"], "secret-provider-key");
  assert.equal(labelEndpoint.requests[0].headers.authorization, undefined);
  assert.equal(labelEndpoint.requests[0].payload.provider, "Canada Post");
  assert.equal(labelEndpoint.requests[0].payload.serviceCode, "DOM.EP");
  assert.equal(labelEndpoint.requests[0].payload.destination.postalCode, "K1A0B1");
  assert.match(labelEndpoint.requests[0].payload.canadaPost.createShipmentXml, /<service-code>DOM\.EP<\/service-code>/);
  assert.match(labelEndpoint.requests[0].payload.canadaPost.createShipmentXml, /<postal-code>K1A0B1<\/postal-code>/);
  assert.equal(shipment.label_status, "purchased");
  assert.equal(shipment.status, "shipped");
  assert.equal(shipment.tracking_number, "CP-LIVE-123");
  assert.equal(shipment.label_url, `labels/canada-post/CP-LIVE-123/${shipment.id}.pdf`);
});

test("shipping automation submits native Canada Post Create Shipment XML directly", async (t) => {
  const canadaPostEndpoint = await startXmlEndpoint(({ req, res, body }) => {
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/rs/1234567/1234567/shipment");
    assert.match(req.headers.accept, /application\/vnd\.cpc\.shipment-v8\+xml/);
    assert.match(req.headers["content-type"], /application\/vnd\.cpc\.shipment-v8\+xml/);
    assert.equal(req.headers.authorization, "Basic secret-provider-key");
    assert.match(body, /<shipment xmlns="http:\/\/www\.canadapost\.ca\/ws\/shipment-v8">/);
    assert.match(body, /<postal-code>K1A0B1<\/postal-code>/);

    res.writeHead(200, { "Content-Type": "application/vnd.cpc.shipment-v8+xml" });
    res.end(`<?xml version="1.0" encoding="UTF-8"?>
      <shipment-info xmlns="http://www.canadapost.ca/ws/shipment-v8">
        <shipment-id>123456789</shipment-id>
        <tracking-pin>CP123456789CA</tracking-pin>
        <links>
          <link rel="label" href="${canadaPostEndpoint.baseUrl}/rs/artifact/label-123" media-type="application/pdf"/>
        </links>
      </shipment-info>`);
  });
  t.after(canadaPostEndpoint.close);

  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-canada-post-native-direct-" });
  insertShippingProvider(dbPath, {
    providerClient: "canada_post",
    labelPurchaseMode: "native",
    apiBaseUrl: canadaPostEndpoint.baseUrl,
    customerNumber: "1234567",
    contractId: "0045678",
    originPostalCode: "T2P 1J9",
    shipFrom: {
      name: "CardVault",
      addressLine1: "1 Arena Way",
      city: "Calgary",
      province: "AB",
      postalCode: "T2P 1J9",
    },
    packageDimensionsCm: { length: 16, width: 11, height: 1 },
    rates: [{
      service: "Canada Post Expedited Parcel",
      serviceCode: "DOM.EP",
      countries: ["CA"],
      maxWeightOz: 8,
      cost: 9.75,
      tracking: true,
    }],
  });
  const { orderId } = await createOrderFixture(baseUrl, "canada-post-native-direct");

  const response = await postJson(baseUrl, `/api/automation/shipping/${orderId}`, {
    destinationCountry: "CA",
    destinationPostalCode: "K1A 0B1",
    weightOz: 6,
  });
  assert.equal(response.status, 200);
  const shipment = await response.json();

  assert.equal(canadaPostEndpoint.requests.length, 1);
  assert.equal(shipment.label_status, "purchased");
  assert.equal(shipment.status, "shipped");
  assert.equal(shipment.tracking_number, "CP123456789CA");
  assert.equal(shipment.label_url, `${canadaPostEndpoint.baseUrl}/rs/artifact/label-123`);
});

test("shipping automation transmits Canada Post manifest and retrieves artifacts", async (t) => {
  const canadaPostEndpoint = await startXmlEndpoint(({ req, res, body }) => {
    if (req.method === "POST" && req.url === "/rs/1234567/1234567/manifest") {
      assert.match(req.headers.accept, /application\/vnd\.cpc\.manifest-v8\+xml/);
      assert.match(req.headers["content-type"], /application\/vnd\.cpc\.manifest-v8\+xml/);
      assert.equal(req.headers.authorization, "Basic secret-provider-key");
      assert.match(body, /<group-id>cv-2026-06-12<\/group-id>/);
      res.writeHead(200, { "Content-Type": "application/vnd.cpc.manifest-v8+xml" });
      res.end(`<?xml version="1.0" encoding="UTF-8"?>
        <manifests xmlns="http://www.canadapost.ca/ws/manifest-v8">
          <link rel="manifest" href="${canadaPostEndpoint.baseUrl}/rs/1234567/1234567/manifest/987" media-type="application/vnd.cpc.manifest-v8+xml"/>
        </manifests>`);
      return;
    }

    if (req.method === "GET" && req.url === "/rs/1234567/1234567/manifest/987") {
      assert.equal(req.headers.authorization, "Basic secret-provider-key");
      res.writeHead(200, { "Content-Type": "application/vnd.cpc.manifest-v8+xml" });
      res.end(`<?xml version="1.0" encoding="UTF-8"?>
        <manifest xmlns="http://www.canadapost.ca/ws/manifest-v8">
          <po-number>PO12345</po-number>
          <links>
            <link rel="artifact" href="${canadaPostEndpoint.baseUrl}/rs/artifact/manifest-987" media-type="application/pdf"/>
          </links>
        </manifest>`);
      return;
    }

    if (req.method === "GET" && req.url === "/rs/artifact/manifest-987") {
      assert.equal(req.headers.authorization, "Basic secret-provider-key");
      res.writeHead(200, { "Content-Type": "application/pdf" });
      res.end("%PDF-1.4 manifest");
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });
  t.after(canadaPostEndpoint.close);

  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-canada-post-manifest-" });
  insertShippingProvider(dbPath, {
    providerClient: "canada_post",
    labelPurchaseMode: "native",
    apiBaseUrl: canadaPostEndpoint.baseUrl,
    customerNumber: "1234567",
    originPostalCode: "T2P 1J9",
    shipFrom: {
      name: "CardVault",
      addressLine1: "1 Arena Way",
      city: "Calgary",
      province: "AB",
      postalCode: "T2P 1J9",
    },
    rates: [{
      service: "Canada Post Expedited Parcel",
      serviceCode: "DOM.EP",
      countries: ["CA"],
      maxWeightOz: 8,
      cost: 9.75,
      tracking: true,
    }],
  });

  const response = await postJson(baseUrl, "/api/automation/shipping/canada-post/manifest", {
    connectionId: "canada-post-provider",
    groupIds: ["cv-2026-06-12"],
  });
  assert.equal(response.status, 200);
  const manifest = await response.json();

  assert.equal(canadaPostEndpoint.requests.length, 3);
  assert.deepEqual(manifest.groupIds, ["cv-2026-06-12"]);
  assert.deepEqual(manifest.manifestUrls, [`${canadaPostEndpoint.baseUrl}/rs/1234567/1234567/manifest/987`]);
  assert.deepEqual(manifest.artifactUrls, [`${canadaPostEndpoint.baseUrl}/rs/artifact/manifest-987`]);
  assert.equal(manifest.poNumbers[0], "PO12345");
  assert.equal(manifest.artifacts[0].contentType, "application/pdf");
  assert.equal(Buffer.from(manifest.artifacts[0].base64, "base64").toString("utf8"), "%PDF-1.4 manifest");
  assert.ok(manifest.id);
  assert.ok(manifest.artifacts[0].id);
  assert.match(manifest.artifacts[0].downloadUrl, new RegExp(`/api/automation/shipping/canada-post/manifests/${manifest.id}/artifacts/${manifest.artifacts[0].id}$`));
  assert.equal(JSON.stringify(manifest).includes("secret-provider-key"), false);

  const historyResponse = await fetch(`${baseUrl}/api/automation/shipping/canada-post/manifests`);
  assert.equal(historyResponse.status, 200);
  const history = await historyResponse.json();
  assert.equal(history.length, 1);
  assert.equal(history[0].id, manifest.id);
  assert.equal(history[0].status, "completed");
  assert.deepEqual(history[0].groupIds, ["cv-2026-06-12"]);
  assert.equal(history[0].poNumbers[0], "PO12345");
  assert.equal(history[0].artifacts[0].id, manifest.artifacts[0].id);
  assert.equal(history[0].artifacts[0].bytes, "%PDF-1.4 manifest".length);
  assert.equal(Object.hasOwn(history[0].artifacts[0], "base64"), false);
  assert.equal(JSON.stringify(history).includes("secret-provider-key"), false);

  const downloadResponse = await fetch(`${baseUrl}${manifest.artifacts[0].downloadUrl}`);
  assert.equal(downloadResponse.status, 200);
  assert.match(downloadResponse.headers.get("content-type"), /application\/pdf/);
  assert.match(downloadResponse.headers.get("content-disposition"), /attachment/);
  assert.equal(await downloadResponse.text(), "%PDF-1.4 manifest");

  const db = new Database(dbPath, { readonly: true });
  try {
    const run = db.prepare("SELECT status, group_ids, po_numbers FROM canada_post_manifest_runs WHERE id = ?").get(manifest.id);
    assert.equal(run.status, "completed");
    assert.deepEqual(JSON.parse(run.group_ids), ["cv-2026-06-12"]);
    assert.deepEqual(JSON.parse(run.po_numbers), ["PO12345"]);
    const artifact = db.prepare("SELECT content_type, byte_size, content FROM canada_post_manifest_artifacts WHERE id = ?").get(manifest.artifacts[0].id);
    assert.equal(artifact.content_type, "application/pdf");
    assert.equal(artifact.byte_size, "%PDF-1.4 manifest".length);
    assert.equal(Buffer.from(artifact.content).toString("utf8"), "%PDF-1.4 manifest");
  } finally {
    db.close();
  }
});

test("Canada Post validation run reports shipment and manifest readiness without exposing secrets", async (t) => {
  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-canada-post-validation-" });
  insertShippingProvider(dbPath, {
    providerClient: "canada_post",
    labelPurchaseMode: "native",
    apiBaseUrl: "https://ct.soa-gw.canadapost.ca",
    customerNumber: "1234567",
    contractId: "0045678",
    originPostalCode: "T2P 1J9",
    shipFrom: {
      name: "CardVault",
      addressLine1: "1 Arena Way",
      city: "Calgary",
      province: "AB",
      postalCode: "T2P 1J9",
    },
    packageDimensionsCm: { length: 16, width: 11, height: 1 },
    rates: [{
      service: "Canada Post Expedited Parcel",
      serviceCode: "DOM.EP",
      countries: ["CA"],
      maxWeightOz: 8,
      cost: 9.75,
      tracking: true,
    }],
  });

  const response = await postJson(baseUrl, "/api/automation/shipping/canada-post/validation", {
    connectionId: "canada-post-provider",
    destinationPostalCode: "K1A 0B1",
    weightOz: 6,
    groupIds: ["cv-validation"],
  });
  assert.equal(response.status, 200);
  const validation = await response.json();

  assert.equal(validation.ok, true);
  assert.equal(validation.provider, "Canada Post");
  assert.equal(validation.connectionId, "canada-post-provider");
  assert.equal(validation.selectedService, "Canada Post Expedited Parcel");
  assert.equal(validation.environment, "sandbox");
  assert.deepEqual(validation.groupIds, ["cv-validation"]);
  assert.equal(validation.checks.find((check) => check.id === "provider_rate").ok, true);
  assert.equal(validation.checks.find((check) => check.id === "shipment_preflight").endpointPath, "/rs/1234567/1234567/shipment");
  assert.equal(validation.checks.find((check) => check.id === "shipment_preflight").xmlReady, true);
  assert.equal(validation.checks.find((check) => check.id === "manifest_preflight").endpointPath, "/rs/1234567/1234567/manifest");
  assert.equal(validation.checks.find((check) => check.id === "manifest_preflight").xmlReady, true);
  assert.doesNotMatch(JSON.stringify(validation), /secret-provider-key|apiKey|api_key|Basic/);
});

test("shipping automation blocks Canada Post native labels until shipment requirements are complete", async (t) => {
  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-canada-post-preflight-" });
  insertShippingProvider(dbPath, {
    providerClient: "canada_post",
    rates: [{
      service: "Canada Post Expedited Parcel",
      serviceCode: "DOM.EP",
      countries: ["CA"],
      maxWeightOz: 8,
      cost: 9.75,
      tracking: true,
    }],
  });
  const { orderId } = await createOrderFixture(baseUrl, "canada-post-preflight");

  const response = await postJson(baseUrl, `/api/automation/shipping/${orderId}`, {
    destinationCountry: "CA",
    weightOz: 6,
  });
  assert.equal(response.status, 200);
  const shipment = await response.json();

  assert.equal(shipment.label_status, "failed");
  assert.equal(shipment.status, "exception");
  assert.equal(shipment.tracking_number, null);

  const queueResponse = await fetch(`${baseUrl}/api/action-queue`);
  assert.equal(queueResponse.status, 200);
  const retryAction = (await queueResponse.json()).find((entry) => entry.subjectId === orderId);
  assert.equal(retryAction.queue, "shipping_exception");
  assert.match(retryAction.reason, /Canada Post shipment preflight blocked/);
  assert.match(retryAction.reason, /customer number/);
  assert.match(retryAction.reason, /destination postal code/);
  assert.doesNotMatch(retryAction.reason, /secret-provider-key|apiKey|api_key/);
});

test("shipping automation times out slow live provider label purchases", async (t) => {
  const labelEndpoint = await startLabelEndpoint(({ res }) => {
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        labelStatus: "purchased",
        trackingNumber: "SLOW-TRACK-123",
      }));
    }, 100);
  });
  t.after(labelEndpoint.close);

  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-live-label-timeout-" });
  insertShippingProvider(dbPath, {
    labelPurchaseUrl: labelEndpoint.url,
    labelPurchaseTimeoutMs: 25,
    rates: [{
      service: "Canada Post Expedited Parcel",
      serviceCode: "DOM.EP",
      countries: ["CA"],
      maxWeightOz: 8,
      cost: 9.75,
      tracking: true,
    }],
  }, "Generic Ship API");
  const { orderId } = await createOrderFixture(baseUrl, "live-timeout");

  const response = await postJson(baseUrl, `/api/automation/shipping/${orderId}`, {
    provider: "Generic Ship API",
    destinationCountry: "CA",
    weightOz: 6,
  });
  assert.equal(response.status, 200);
  const shipment = await response.json();

  assert.equal(shipment.label_status, "failed");
  assert.equal(shipment.status, "exception");
  assert.equal(shipment.tracking_number, null);

  const db = new Database(dbPath, { readonly: true });
  try {
    const event = db.prepare(
      `SELECT status, payload
       FROM listing_channel_events
       WHERE event_type = 'shipping_exception'
       ORDER BY created_at DESC
       LIMIT 1`,
    ).get();
    assert.equal(event.status, "failed");
    assert.match(event.payload, /Provider label purchase timed out/);
  } finally {
    db.close();
  }
});

test("shipping automation records live provider label failures for retry", async (t) => {
  const labelEndpoint = await startLabelEndpoint(({ res }) => {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Carrier purchase endpoint unavailable" }));
  });
  t.after(labelEndpoint.close);

  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-live-label-failed-" });
  insertShippingProvider(dbPath, {
    labelPurchaseUrl: labelEndpoint.url,
    rates: [{
      service: "Canada Post Expedited Parcel",
      serviceCode: "DOM.EP",
      countries: ["CA"],
      maxWeightOz: 8,
      cost: 9.75,
      tracking: true,
    }],
  }, "Generic Ship API");
  const { orderId } = await createOrderFixture(baseUrl, "live-failed");

  const response = await postJson(baseUrl, `/api/automation/shipping/${orderId}`, {
    provider: "Generic Ship API",
    destinationCountry: "CA",
    weightOz: 6,
  });
  assert.equal(response.status, 200);
  const shipment = await response.json();

  assert.equal(labelEndpoint.requests.length, 1);
  assert.equal(shipment.label_status, "failed");
  assert.equal(shipment.status, "exception");
  assert.equal(shipment.tracking_number, null);

  const queueResponse = await fetch(`${baseUrl}/api/action-queue`);
  assert.equal(queueResponse.status, 200);
  const retryAction = (await queueResponse.json()).find((entry) => entry.subjectId === orderId);
  assert.equal(retryAction.queue, "shipping_exception");
  assert.equal(retryAction.suggestedAction, "retry_shipment");
  assert.match(retryAction.reason, /Canada Post Expedited Parcel/);
  assert.match(retryAction.reason, /Carrier purchase endpoint unavailable/);
  assert.doesNotMatch(retryAction.reason, /secret-provider-key|apiKey|api_key/);

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
    assert.match(event.payload, /Carrier purchase endpoint unavailable/);
    assert.doesNotMatch(event.payload, /secret-provider-key|apiKey|api_key/);
  } finally {
    db.close();
  }
});

test("shipping automation truncates non-json live provider label errors", async (t) => {
  const longProxyError = `<html>${"x".repeat(220)}END-OF-LONG-PROXY-PAGE</html>`;
  const labelEndpoint = await startLabelEndpoint(({ res }) => {
    res.writeHead(502, { "Content-Type": "text/html" });
    res.end(longProxyError);
  });
  t.after(labelEndpoint.close);

  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-live-label-html-error-" });
  insertShippingProvider(dbPath, {
    labelPurchaseUrl: labelEndpoint.url,
    rates: [{
      service: "Canada Post Expedited Parcel",
      serviceCode: "DOM.EP",
      countries: ["CA"],
      maxWeightOz: 8,
      cost: 9.75,
      tracking: true,
    }],
  }, "Generic Ship API");
  const { orderId } = await createOrderFixture(baseUrl, "live-html-error");

  const response = await postJson(baseUrl, `/api/automation/shipping/${orderId}`, {
    provider: "Generic Ship API",
    destinationCountry: "CA",
    weightOz: 6,
  });
  assert.equal(response.status, 200);
  const shipment = await response.json();

  assert.equal(labelEndpoint.requests.length, 1);
  assert.equal(shipment.label_status, "failed");
  assert.equal(shipment.status, "exception");

  const db = new Database(dbPath, { readonly: true });
  try {
    const event = db.prepare(
      `SELECT status, payload
       FROM listing_channel_events
       WHERE event_type = 'shipping_exception'
       ORDER BY created_at DESC
       LIMIT 1`,
    ).get();
    assert.equal(event.status, "failed");
    assert.match(event.payload, /<html>/);
    assert.match(event.payload, /\.\.\./);
    assert.doesNotMatch(event.payload, /END-OF-LONG-PROXY-PAGE/);
  } finally {
    db.close();
  }
});

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
        labelUrl: "labels/canada-post/{trackingNumber}/{shipmentId}.pdf",
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
  assert.equal(shipment.label_url, `labels/canada-post/CP-PURCHASED-123/${shipment.id}.pdf`);

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
