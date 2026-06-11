import test from "node:test";
import assert from "node:assert/strict";

import { startTestServer } from "./helpers/testServer.js";

test("fee models route validates and stores platform fee overrides", async (t) => {
  const { baseUrl } = await startTestServer(t, {
    dirPrefix: "cardvault-fee-models-",
  });

  const initialResponse = await fetch(`${baseUrl}/api/fee-models`);
  assert.equal(initialResponse.status, 200);
  assert.deepEqual(await initialResponse.json(), []);

  const invalidResponse = await fetch(`${baseUrl}/api/fee-models/ebay`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feeRate: 1.2 }),
  });
  assert.equal(invalidResponse.status, 400);
  assert.equal((await invalidResponse.json()).error, "feeRate must be between 0 and 1");

  const createResponse = await fetch(`${baseUrl}/api/fee-models/ebay`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feeRate: 0.14, label: "eBay custom" }),
  });
  assert.equal(createResponse.status, 200);
  const created = await createResponse.json();
  assert.equal(created.platform, "ebay");
  assert.equal(created.feeRate, 0.14);
  assert.equal(created.label, "eBay custom");
  assert.equal(typeof created.id, "string");
  assert.equal(typeof created.createdAt, "string");
  assert.equal(typeof created.updatedAt, "string");

  const updateResponse = await fetch(`${baseUrl}/api/fee-models/ebay`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feeRate: 0.125, label: "eBay adjusted" }),
  });
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json();
  assert.equal(updated.id, created.id);
  assert.equal(updated.feeRate, 0.125);
  assert.equal(updated.label, "eBay adjusted");

  const listResponse = await fetch(`${baseUrl}/api/fee-models`);
  assert.equal(listResponse.status, 200);
  assert.deepEqual((await listResponse.json()).map((model) => model.platform), ["ebay"]);

  const deleteResponse = await fetch(`${baseUrl}/api/fee-models/ebay`, {
    method: "DELETE",
  });
  assert.equal(deleteResponse.status, 200);
  assert.deepEqual(await deleteResponse.json(), { deleted: true });

  const finalResponse = await fetch(`${baseUrl}/api/fee-models`);
  assert.equal(finalResponse.status, 200);
  assert.deepEqual(await finalResponse.json(), []);
});
