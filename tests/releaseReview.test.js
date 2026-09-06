import test from "node:test";
import assert from "node:assert/strict";
import { labelPurchaseTimeoutMs, MAX_LABEL_PURCHASE_TIMEOUT_MS, SHIPPING_CLAIM_TTL_MS } from "../src/server/integrations/shipping/purchaseTiming.js";
import { persistBatchRemoval } from "../src/lib/batchSave.js";
import { startTestServer } from "./helpers/testServer.js";
test("carrier timeouts are bounded below the claim lifetime", () => {
  assert.ok(MAX_LABEL_PURCHASE_TIMEOUT_MS < SHIPPING_CLAIM_TTL_MS);
  for (const key of ["labelPurchaseTimeoutMs", "label_purchase_timeout_ms"]) {
    assert.equal(labelPurchaseTimeoutMs({ [key]: 180000 }), MAX_LABEL_PURCHASE_TIMEOUT_MS);
    assert.equal(labelPurchaseTimeoutMs({}, { [key]: "180000" }), MAX_LABEL_PURCHASE_TIMEOUT_MS);
    assert.equal(labelPurchaseTimeoutMs({ [key]: 5000 }, { [key]: 15 }), 15);
  }
  for (const value of [null, "", 0, -1, Infinity, "bad"]) assert.equal(labelPurchaseTimeoutMs({ labelPurchaseTimeoutMs: value }), 10000);
});
test("batch removal stays visible until durable persistence commits and failure retains the scan", async () => {
  const queue = [{ id: "keep" }, { id: "remove" }];
  let visible = queue, release;
  const work = persistBatchRemoval({ queue, id: "remove", persist: () => new Promise((resolve) => { release = resolve; }), apply: (next) => { visible = next; } });
  assert.equal(visible.length, 2);
  release(); await work; assert.deepEqual(visible, [{ id: "keep" }]);
  await assert.rejects(persistBatchRemoval({ queue, id: "remove", persist: async () => { throw new Error("Quota"); }, apply: () => assert.fail("Must retain the scan") }), /Quota/);
});
test("ready listings keep the inventory draft marker", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-ready-draft-" });
  const post = (path, body) => fetch(`${baseUrl}/api${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await post("/items", { id: "ready-card", name: "Ready card", listedOn: [], priceHistory: [] })).status, 201);
  assert.equal((await post("/listings", { id: "ready-listing", cardId: "ready-card", cardName: "Ready card", platform: "ebay", format: "fixed", startPrice: 25, status: "ready" })).status, 201);
  const card = await (await fetch(`${baseUrl}/api/items/ready-card`)).json();
  assert.equal(card.status, "inventory"); assert.equal(card.listingStatus, "draft");
});
