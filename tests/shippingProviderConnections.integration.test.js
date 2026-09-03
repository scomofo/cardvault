import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { createServer } from "node:http";

import { startTestServer } from "./helpers/testServer.js";

async function requestJson(baseUrl, path, { method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
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

test("shipping provider connection routes save, update, test, and sanitize credentials", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-shipping-connections-" });

  const emptyList = await requestJson(baseUrl, "/api/shipping-provider-connections");
  assert.equal(emptyList.response.status, 200);
  assert.deepEqual(emptyList.payload, []);

  const missingProvider = await requestJson(baseUrl, "/api/shipping-provider-connections", {
    method: "POST",
    body: { apiKey: "secret-provider-key", metadata: {} },
  });
  assert.equal(missingProvider.response.status, 400);
  assert.match(missingProvider.payload.error, /provider required/i);

  const createResult = await requestJson(baseUrl, "/api/shipping-provider-connections", {
    method: "POST",
    body: {
      provider: "Canada Post",
      apiKey: "secret-provider-key",
      metadata: {
        accountLabel: "Main shipping account",
        authorization: "Bearer provider-authorization",
        authHeader: "Bearer provider-auth-header",
        bearer: "Bearer provider-bearer",
        headers: {
          Authorization: "Bearer nested-provider-authorization",
          safeTrace: "trace-1",
        },
        rates: [{
          service: "Canada Post Expedited Parcel",
          serviceCode: "DOM.EP",
          countries: ["CA"],
          cost: 9.75,
          tracking: true,
        }],
      },
    },
  });
  assert.equal(createResult.response.status, 201);
  assert.equal(createResult.payload.provider, "Canada Post");
  assert.equal(createResult.payload.authStatus, "configured");
  assert.equal(createResult.payload.hasApiKey, true);
  assert.equal(createResult.payload.metadata.accountLabel, "Main shipping account");
  assert.equal(createResult.payload.metadata.rates[0].serviceCode, "DOM.EP");
  assert.equal(createResult.payload.metadata.headers.safeTrace, "trace-1");
  assert.doesNotMatch(JSON.stringify(createResult.payload), /secret-provider-key|apiKey|api_key|provider-authorization|provider-auth-header|provider-bearer|nested-provider-authorization/);

  const listResult = await requestJson(baseUrl, "/api/shipping-provider-connections");
  assert.equal(listResult.response.status, 200);
  assert.equal(listResult.payload.length, 1);
  assert.equal(listResult.payload[0].id, createResult.payload.id);
  assert.equal(listResult.payload[0].hasApiKey, true);
  assert.equal(listResult.payload[0].metadata.headers.safeTrace, "trace-1");
  assert.doesNotMatch(JSON.stringify(listResult.payload), /secret-provider-key|apiKey|api_key|provider-authorization|provider-auth-header|provider-bearer|nested-provider-authorization/);

  const updateResult = await requestJson(baseUrl, `/api/shipping-provider-connections/${createResult.payload.id}`, {
    method: "PUT",
    body: {
      provider: "Canada Post",
      apiKey: "replacement-secret",
      metadata: {
        accountLabel: "Updated shipping account",
        rates: [{
          service: "Canada Post Tracked Packet",
          serviceCode: "DOM.TP",
          countries: ["CA", "US"],
          cost: 10.5,
          tracking: true,
        }],
      },
    },
  });
  assert.equal(updateResult.response.status, 200);
  assert.equal(updateResult.payload.metadata.accountLabel, "Updated shipping account");
  assert.equal(updateResult.payload.metadata.rates[0].cost, 10.5);
  assert.doesNotMatch(JSON.stringify(updateResult.payload), /replacement-secret|secret-provider-key|apiKey|api_key/);

  const testResult = await requestJson(baseUrl, `/api/shipping-provider-connections/${createResult.payload.id}/test`, {
    method: "POST",
    body: { country: "CA", salePrice: 100, weightOz: 3 },
  });
  assert.equal(testResult.response.status, 200);
  assert.equal(testResult.payload.ok, true);
  assert.equal(testResult.payload.provider, "Canada Post");
  assert.equal(testResult.payload.authStatus, "connected");
  assert.equal(testResult.payload.serviceCount, 1);
  assert.deepEqual(testResult.payload.services[0], {
    service: "Canada Post Tracked Packet",
    serviceCode: "DOM.TP",
    countries: ["CA", "US"],
    cost: 10.5,
    tracking: true,
  });
  assert.doesNotMatch(JSON.stringify(testResult.payload), /replacement-secret|secret-provider-key|apiKey|api_key/);
});

test("shipping provider connection test validates a dry-run label endpoint", async (t) => {
  const labelEndpoint = await startLabelEndpoint(({ res }) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      labelStatus: "purchased",
      trackingNumber: "TEST-TRACK-123",
      labelUrl: "labels/test/{trackingNumber}/{shipmentId}.pdf",
    }));
  });
  t.after(labelEndpoint.close);

  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-shipping-live-test-" });
  const createResult = await requestJson(baseUrl, "/api/shipping-provider-connections", {
    method: "POST",
    body: {
      provider: "Generic Ship API",
      apiKey: "secret-provider-key",
      metadata: {
        labelPurchaseUrl: labelEndpoint.url,
        apiKeyHeader: "X-API-KEY",
        apiKeyPrefix: "",
        rates: [{
          service: "Tracked Card Mailer",
          serviceCode: "TRACKED_CARD",
          countries: ["CA"],
          cost: 8.25,
          tracking: true,
        }],
      },
    },
  });
  assert.equal(createResult.response.status, 201);

  const testResult = await requestJson(baseUrl, `/api/shipping-provider-connections/${createResult.payload.id}/test`, {
    method: "POST",
    body: { country: "CA", salePrice: 100, weightOz: 3 },
  });

  assert.equal(testResult.response.status, 200);
  assert.equal(testResult.payload.ok, true);
  assert.equal(testResult.payload.authStatus, "connected");
  assert.equal(testResult.payload.endpointValidation.attempted, true);
  assert.equal(testResult.payload.endpointValidation.ok, true);
  assert.equal(testResult.payload.endpointValidation.labelStatus, "purchased");
  assert.equal(testResult.payload.endpointValidation.trackingNumber, "TEST-TRACK-123");
  assert.equal(testResult.payload.endpointValidation.labelUrl, "labels/test/TEST-TRACK-123/connection-test.pdf");
  assert.equal(labelEndpoint.requests.length, 1);
  assert.equal(labelEndpoint.requests[0].headers["x-api-key"], "secret-provider-key");
  assert.equal(labelEndpoint.requests[0].headers.authorization, undefined);
  assert.equal(labelEndpoint.requests[0].payload.dryRun, true);
  assert.equal(labelEndpoint.requests[0].payload.shipmentId, "connection-test");
  assert.equal(labelEndpoint.requests[0].payload.serviceCode, "TRACKED_CARD");
  assert.doesNotMatch(JSON.stringify(testResult.payload), /secret-provider-key|apiKey|api_key/);
});

test("shipping provider connection test honors snake_case auth metadata for dry-run label endpoint", async (t) => {
  const labelEndpoint = await startLabelEndpoint(({ req, res }) => {
    if (req.headers["x-api-key"] !== "secret-provider-key" || req.headers.authorization) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing expected API key header" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      label_status: "purchased",
      tracking_number: "SNAKE-TRACK-123",
      label_url: "labels/snake/{trackingNumber}/{shipmentId}.pdf",
    }));
  });
  t.after(labelEndpoint.close);

  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-shipping-snake-auth-" });
  const createResult = await requestJson(baseUrl, "/api/shipping-provider-connections", {
    method: "POST",
    body: {
      provider: "Generic Ship API",
      apiKey: "secret-provider-key",
      metadata: {
        label_purchase_url: labelEndpoint.url,
        api_key_header: "X-API-KEY",
        api_key_prefix: "",
        rates: [{
          service: "Tracked Card Mailer",
          service_code: "TRACKED_CARD",
          countries: ["CA"],
          cost: 8.25,
          tracking: true,
        }],
      },
    },
  });
  assert.equal(createResult.response.status, 201);

  const testResult = await requestJson(baseUrl, `/api/shipping-provider-connections/${createResult.payload.id}/test`, {
    method: "POST",
    body: { country: "CA", salePrice: 100, weightOz: 3 },
  });

  assert.equal(testResult.response.status, 200);
  assert.equal(testResult.payload.ok, true);
  assert.equal(testResult.payload.endpointValidation.ok, true);
  assert.equal(testResult.payload.endpointValidation.labelStatus, "purchased");
  assert.equal(testResult.payload.endpointValidation.trackingNumber, "SNAKE-TRACK-123");
  assert.equal(testResult.payload.endpointValidation.labelUrl, "labels/snake/SNAKE-TRACK-123/connection-test.pdf");
  assert.equal(labelEndpoint.requests.length, 1);
  assert.equal(labelEndpoint.requests[0].headers["x-api-key"], "secret-provider-key");
  assert.equal(labelEndpoint.requests[0].headers.authorization, undefined);
  assert.equal(labelEndpoint.requests[0].payload.serviceCode, "TRACKED_CARD");
  assert.doesNotMatch(JSON.stringify(testResult.payload), /secret-provider-key|apiKey|api_key/);
});

test("shipping provider connection test applies Canada Post defaults and diagnostics", async (t) => {
  const labelEndpoint = await startLabelEndpoint(({ req, res }) => {
    if (req.headers.authorization !== "Basic encoded-canada-post-key") {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing Canada Post Basic auth" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      labelStatus: "purchased",
      trackingNumber: "CP-DRY-RUN-123",
    }));
  });
  t.after(labelEndpoint.close);

  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-shipping-canada-post-defaults-" });
  const createResult = await requestJson(baseUrl, "/api/shipping-provider-connections", {
    method: "POST",
    body: {
      provider: "Canada Post",
      apiKey: "encoded-canada-post-key",
      metadata: {
        environment: "production",
        labelPurchaseUrl: labelEndpoint.url,
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
          cost: 9.75,
          tracking: true,
        }],
      },
    },
  });
  assert.equal(createResult.response.status, 201);
  assert.equal(createResult.payload.metadata.providerClient, "canada_post");
  assert.equal(createResult.payload.metadata.environment, "production");
  assert.equal(createResult.payload.metadata.apiBaseUrl, "https://soa-gw.canadapost.ca");
  assert.equal(createResult.payload.metadata.labelUrlTemplate, "labels/canada-post/{trackingNumber}/{shipmentId}.pdf");
  assert.doesNotMatch(JSON.stringify(createResult.payload), /encoded-canada-post-key|apiKey|api_key|Basic/);

  const testResult = await requestJson(baseUrl, `/api/shipping-provider-connections/${createResult.payload.id}/test`, {
    method: "POST",
    body: { country: "CA", salePrice: 100, weightOz: 3, destinationPostalCode: "K1A 0B1" },
  });

  assert.equal(testResult.response.status, 200);
  assert.equal(testResult.payload.ok, true);
  assert.equal(testResult.payload.endpointValidation.ok, true);
  assert.equal(testResult.payload.endpointValidation.trackingNumber, "CP-DRY-RUN-123");
  assert.equal(testResult.payload.endpointValidation.labelUrl, "labels/canada-post/CP-DRY-RUN-123/connection-test.pdf");
  assert.deepEqual(testResult.payload.diagnostics, {
    providerClient: "canada_post",
    environment: "production",
    endpointConfigured: true,
    endpointHost: "127.0.0.1",
  });
  assert.equal(labelEndpoint.requests.length, 1);
  assert.equal(labelEndpoint.requests[0].payload.provider, "Canada Post");
  assert.equal(labelEndpoint.requests[0].payload.dryRun, true);
  assert.equal(labelEndpoint.requests[0].payload.destination.postalCode, "K1A0B1");
  assert.match(labelEndpoint.requests[0].payload.canadaPost.createShipmentXml, /<service-code>DOM\.EP<\/service-code>/);
  assert.doesNotMatch(JSON.stringify(testResult.payload), /encoded-canada-post-key|apiKey|api_key|Basic/);
});

test("shipping provider connection test returns sanitized live endpoint failures", async (t) => {
  const longProxyError = `<html>${"x".repeat(220)}END-OF-LONG-PROXY-PAGE</html>`;
  const labelEndpoint = await startLabelEndpoint(({ res }) => {
    res.writeHead(502, { "Content-Type": "text/html" });
    res.end(longProxyError);
  });
  t.after(labelEndpoint.close);

  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-shipping-live-test-failed-" });
  const createResult = await requestJson(baseUrl, "/api/shipping-provider-connections", {
    method: "POST",
    body: {
      provider: "Generic Ship API",
      apiKey: "secret-provider-key",
      metadata: {
        labelPurchaseUrl: labelEndpoint.url,
        labelPurchaseTimeoutMs: 1000,
        rates: [{
          service: "Tracked Card Mailer",
          serviceCode: "TRACKED_CARD",
          countries: ["CA"],
          cost: 8.25,
          tracking: true,
        }],
      },
    },
  });
  assert.equal(createResult.response.status, 201);

  const testResult = await requestJson(baseUrl, `/api/shipping-provider-connections/${createResult.payload.id}/test`, {
    method: "POST",
    body: { country: "CA", salePrice: 100, weightOz: 3 },
  });

  assert.equal(testResult.response.status, 400);
  assert.equal(testResult.payload.endpointValidation.attempted, true);
  assert.equal(testResult.payload.endpointValidation.ok, false);
  assert.match(testResult.payload.error, /Provider label endpoint test failed/i);
  assert.match(testResult.payload.endpointValidation.error, /<html>/);
  assert.match(testResult.payload.endpointValidation.error, /\.\.\./);
  assert.doesNotMatch(JSON.stringify(testResult.payload), /END-OF-LONG-PROXY-PAGE|secret-provider-key|apiKey|api_key/);

  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db.prepare("SELECT auth_status FROM shipping_provider_connections WHERE id = ?").get(createResult.payload.id);
    assert.equal(row.auth_status, "configured");
  } finally {
    db.close();
  }
});

test("shipping provider connection routes reject unsupported label endpoint protocols", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-shipping-invalid-endpoint-" });

  const createResult = await requestJson(baseUrl, "/api/shipping-provider-connections", {
    method: "POST",
    body: {
      provider: "Canada Post",
      apiKey: "secret-provider-key",
      metadata: {
        labelPurchaseUrl: "ftp://carrier.example/labels",
        rates: [{
          service: "Canada Post Expedited Parcel",
          serviceCode: "DOM.EP",
          countries: ["CA"],
          cost: 9.75,
          tracking: true,
        }],
      },
    },
  });

  assert.equal(createResult.response.status, 400);
  assert.match(createResult.payload.error, /labelPurchaseUrl URL must use http or https/i);
  assert.doesNotMatch(JSON.stringify(createResult.payload), /secret-provider-key|apiKey|api_key/);
});

test("shipping provider connection test handles null metadata without crashing", async (t) => {
  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-shipping-null-metadata-" });
  const db = new Database(dbPath);
  try {
    db.prepare(
      `INSERT INTO shipping_provider_connections
       (id, provider, auth_status, api_key, metadata, created_at, updated_at)
       VALUES (?,?,?,?,?,datetime('now'),datetime('now'))`,
    ).run(
      "null-metadata-provider",
      "Canada Post",
      "configured",
      "secret-provider-key",
      "null",
    );
  } finally {
    db.close();
  }

  const testResult = await requestJson(baseUrl, "/api/shipping-provider-connections/null-metadata-provider/test", {
    method: "POST",
    body: { country: "CA", salePrice: 100, weightOz: 3 },
  });

  assert.equal(testResult.response.status, 400);
  assert.match(testResult.payload.error, /At least one provider rate is required/i);
  assert.doesNotMatch(JSON.stringify(testResult.payload), /secret-provider-key|apiKey|api_key/);
});
