import test from "node:test";
import assert from "node:assert/strict";

import { startTestServer } from "./helpers/testServer.js";

test("batch presets route validates defaults and performs CRUD", async (t) => {
  const { baseUrl } = await startTestServer(t, {
    dirPrefix: "cardvault-batch-presets-",
  });

  const initialResponse = await fetch(`${baseUrl}/api/batch-presets`);
  assert.equal(initialResponse.status, 200);
  assert.deepEqual(await initialResponse.json(), []);

  const invalidNameResponse = await fetch(`${baseUrl}/api/batch-presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: " ", defaults: {} }),
  });
  assert.equal(invalidNameResponse.status, 400);
  assert.equal((await invalidNameResponse.json()).error, "name required");

  const invalidDefaultsResponse = await fetch(`${baseUrl}/api/batch-presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Invalid", defaults: [] }),
  });
  assert.equal(invalidDefaultsResponse.status, 400);
  assert.equal((await invalidDefaultsResponse.json()).error, "defaults must be an object");

  const createResponse = await fetch(`${baseUrl}/api/batch-presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: " Consignment batch ",
      defaults: { condition: "near_mint", binder: "Showcase", minPrice: "5" },
    }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(typeof created.id, "string");
  assert.equal(created.name, "Consignment batch");
  assert.deepEqual(created.defaults, { condition: "near_mint", binder: "Showcase", minPrice: "5" });
  assert.equal(typeof created.createdAt, "string");
  assert.equal(typeof created.updatedAt, "string");
  assert.equal("defaultsJson" in created, false);

  const listResponse = await fetch(`${baseUrl}/api/batch-presets`);
  assert.equal(listResponse.status, 200);
  assert.deepEqual((await listResponse.json()).map((preset) => preset.id), [created.id]);

  const updateResponse = await fetch(`${baseUrl}/api/batch-presets/${created.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Dealer batch",
      defaults: { condition: "excellent", binder: "Dealer", minPrice: "10" },
    }),
  });
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json();
  assert.equal(updated.name, "Dealer batch");
  assert.deepEqual(updated.defaults, { condition: "excellent", binder: "Dealer", minPrice: "10" });

  const deleteResponse = await fetch(`${baseUrl}/api/batch-presets/${created.id}`, {
    method: "DELETE",
  });
  assert.equal(deleteResponse.status, 200);
  assert.deepEqual(await deleteResponse.json(), { deleted: true });

  const finalResponse = await fetch(`${baseUrl}/api/batch-presets`);
  assert.equal(finalResponse.status, 200);
  assert.deepEqual(await finalResponse.json(), []);
});
