import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer.js";

test("batch publication routes persist no approval or live state without a connected account and explicit review", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-publish-routes-" });
  const post = (path, body) => fetch(`${baseUrl}/api${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.deepEqual(await (await fetch(`${baseUrl}/api/publish-batches`)).json(), []);
  assert.equal((await post("/publish-batches", { listingIds: [] })).status, 400);
  assert.equal((await post("/publish-batches", { listingIds: ["x", "x"] })).status, 400);
  assert.equal((await post("/publish-batches", { listingIds: ["x"], config: {} })).status, 400);
  const config = { postalCode: "T5A1A1", sport: "Hockey", manufacturer: "Upper Deck", fulfillmentPolicyId: "123", paymentPolicyId: "234", returnPolicyId: "345" };
  const response = await post("/publish-batches", { listingIds: ["x"], config });
  assert.equal(response.status, 409); assert.match((await response.json()).error, /Connect eBay/);
  assert.equal((await post("/publish-batches/missing/process-next", {})).status, 404);
  const denied = await fetch(`${baseUrl}/api/publish-batches/missing/approve`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://not-cardvault.example" }, body: JSON.stringify({ confirmed: true }) });
  assert.equal(denied.status, 403);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/publish-batches`)).json(), []);
});
