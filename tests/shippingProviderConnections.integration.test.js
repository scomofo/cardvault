import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";

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
  assert.doesNotMatch(JSON.stringify(createResult.payload), /secret-provider-key|apiKey|api_key/);

  const listResult = await requestJson(baseUrl, "/api/shipping-provider-connections");
  assert.equal(listResult.response.status, 200);
  assert.equal(listResult.payload.length, 1);
  assert.equal(listResult.payload[0].id, createResult.payload.id);
  assert.equal(listResult.payload[0].hasApiKey, true);
  assert.doesNotMatch(JSON.stringify(listResult.payload), /secret-provider-key|apiKey|api_key/);

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
