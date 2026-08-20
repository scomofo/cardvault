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

test("item routes update, delete, and bulk-create inventory", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-items-routes-" });

  const missingUpdate = await requestJson(baseUrl, "/api/items/nope", {
    method: "PUT",
    body: { name: "Ghost" },
  });
  assert.equal(missingUpdate.response.status, 404);

  const unnamedUpdate = await requestJson(baseUrl, "/api/items/nope", {
    method: "PUT",
    body: { playerName: "No Name" },
  });
  assert.equal(unnamedUpdate.response.status, 400);
  assert.match(unnamedUpdate.payload.error, /name required/);

  const created = await requestJson(baseUrl, "/api/items", {
    method: "POST",
    body: { id: "item-update", name: "Original Card", playerName: "Player A", marketPrice: 40, costBasis: 10 },
  });
  assert.equal(created.response.status, 201);

  const updated = await requestJson(baseUrl, "/api/items/item-update", {
    method: "PUT",
    body: { name: "Original Card", playerName: "Player B", marketPrice: 75 },
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.payload.playerName, "Player B");
  assert.equal(updated.payload.marketPrice, 75);
  assert.equal(updated.payload.name, "Original Card", "unspecified fields keep their values");
  assert.equal(updated.payload.costBasis, 10);

  const deleted = await requestJson(baseUrl, "/api/items/item-update", { method: "DELETE" });
  assert.deepEqual(deleted.payload, { deleted: true });
  const deletedAgain = await requestJson(baseUrl, "/api/items/item-update", { method: "DELETE" });
  assert.equal(deletedAgain.response.status, 404);

  const noItems = await requestJson(baseUrl, "/api/items/bulk", { method: "POST", body: { items: [] } });
  assert.equal(noItems.response.status, 400);
  assert.match(noItems.payload.error, /items array required/);

  const tooMany = await requestJson(baseUrl, "/api/items/bulk", {
    method: "POST",
    body: { items: Array.from({ length: 201 }, (_, i) => ({ name: `Card ${i}` })) },
  });
  assert.equal(tooMany.response.status, 400);
  assert.match(tooMany.payload.error, /max 200 items/);

  const unnamed = await requestJson(baseUrl, "/api/items/bulk", {
    method: "POST",
    body: { items: [{ name: "Named" }, { sport: "Hockey" }] },
  });
  assert.equal(unnamed.response.status, 400);
  assert.match(unnamed.payload.error, /name required/);

  const bulk = await requestJson(baseUrl, "/api/items/bulk", {
    method: "POST",
    body: {
      items: [
        { id: "bulk-1", name: "Bulk Card One", playerName: "Player One", marketPrice: 12 },
        { name: "Bulk Card Two", sport: "Hockey", costBasis: 3 },
      ],
    },
  });
  assert.equal(bulk.response.status, 201);
  assert.equal(bulk.payload.count, 2);
  const [first, second] = bulk.payload.created;
  assert.equal(first.id, "bulk-1");
  assert.equal(first.playerName, "Player One");
  assert.equal(second.condition, "near_mint");
  assert.equal(second.status, "inventory");
  assert.equal(second.listingStatus, "not_listed");
  assert.ok(second.id, "generated ids are returned");

  const listed = await requestJson(baseUrl, "/api/items");
  assert.equal(listed.payload.filter((item) => item.name.startsWith("Bulk Card")).length, 2);
});
