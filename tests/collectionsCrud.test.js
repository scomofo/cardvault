import test from "node:test";
import assert from "node:assert/strict";

import { startTestServer } from "./helpers/testServer.js";

async function requestJson(baseUrl, path, { method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

test("generic CRUD and reference routes validate, update, and delete", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-collections-crud-" });

  const empty = await requestJson(baseUrl, "/api/trades");
  assert.deepEqual(empty.payload, []);

  const nonObject = await requestJson(baseUrl, "/api/trades", { method: "POST", body: ["not", "an", "object"] });
  assert.equal(nonObject.response.status, 400);
  assert.match(nonObject.payload.error, /body must be an object/);

  const missingField = await requestJson(baseUrl, "/api/trades", { method: "POST", body: { gave: "Card A" } });
  assert.equal(missingField.response.status, 400);
  assert.match(missingField.payload.error, /partner required/);

  const created = await requestJson(baseUrl, "/api/trades", {
    method: "POST",
    body: { partner: "Alice", gave: "Card A", received: "Card B", gaveValue: 20, receivedValue: 25 },
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.payload.partner, "Alice");
  assert.equal(created.payload.gaveValue, 20);
  const tradeId = created.payload.id;

  const badUpdateBody = await requestJson(baseUrl, `/api/trades/${tradeId}`, { method: "PUT", body: ["nope"] });
  assert.equal(badUpdateBody.response.status, 400);
  const updateMissing = await requestJson(baseUrl, "/api/trades/unknown", { method: "PUT", body: { notes: "x" } });
  assert.equal(updateMissing.response.status, 404);
  const updateEmpty = await requestJson(baseUrl, `/api/trades/${tradeId}`, { method: "PUT", body: {} });
  assert.equal(updateEmpty.response.status, 400);
  assert.match(updateEmpty.payload.error, /request body required/);

  const updated = await requestJson(baseUrl, `/api/trades/${tradeId}`, {
    method: "PUT",
    body: { receivedValue: 30, notes: "renegotiated" },
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.payload.receivedValue, 30);
  assert.equal(updated.payload.notes, "renegotiated");
  assert.equal(updated.payload.partner, "Alice", "unspecified fields survive updates");

  const deleted = await requestJson(baseUrl, `/api/trades/${tradeId}`, { method: "DELETE" });
  assert.deepEqual(deleted.payload, { deleted: true });
  const deletedAgain = await requestJson(baseUrl, `/api/trades/${tradeId}`, { method: "DELETE" });
  assert.equal(deletedAgain.response.status, 404);

  const refNonObject = await requestJson(baseUrl, "/api/ref/leagues", { method: "POST", body: ["nope"] });
  assert.equal(refNonObject.response.status, 400);
  const refMissing = await requestJson(baseUrl, "/api/ref/leagues", { method: "POST", body: { name: "NHL" } });
  assert.equal(refMissing.response.status, 400);
  assert.match(refMissing.payload.error, /sport_type required/);

  const refCreated = await requestJson(baseUrl, "/api/ref/leagues", {
    method: "POST",
    body: { name: "Test League", sportType: "Hockey" },
  });
  assert.equal(refCreated.response.status, 201);
  assert.equal(refCreated.payload.name, "Test League");

  const leagues = await requestJson(baseUrl, "/api/ref/leagues");
  assert.ok(leagues.payload.some((league) => league.name === "Test League"));
});
