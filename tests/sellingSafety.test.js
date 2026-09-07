import test from "node:test";
import assert from "node:assert/strict";
import { saveApprovedBatch, normalizeBatchResult } from "../src/lib/batchSave.js";
import { shipmentStateFromService, shipmentFulfillmentStatus } from "../src/server/integrations/shipping/shipmentState.js";

test("saving a mixed batch retains review, failed, captured and failed-save entries", async () => {
  let queue = [
    { id: "ok", status: "done" }, { id: "review", status: "review" },
    { id: "failed", status: "failed" }, { id: "captured", status: "captured" },
    { id: "retry", status: "approved" },
  ];
  const errors = [];
  const result = await saveApprovedBatch({
    queue,
    persist: async (item) => { if (item.id === "retry") throw new Error("Disk full"); },
    onSaved: (item) => { queue = queue.filter((entry) => entry.id !== item.id); },
    onError: (item, error) => errors.push([item.id, error.message]),
  });
  assert.deepEqual(result, { savedIds: ["ok"], failedIds: ["retry"] });
  assert.deepEqual(queue.map((item) => item.id), ["review", "failed", "captured", "retry"]);
  assert.deepEqual(errors, [["retry", "Disk full"]]);
});

test("batch save does not discard captures added during an asynchronous save", async () => {
  let queue = [{ id: "first", status: "approved" }];
  await saveApprovedBatch({
    queue,
    persist: async () => { queue = [...queue, { id: "new", status: "captured" }]; },
    onSaved: (item) => { queue = queue.filter((entry) => entry.id !== item.id); },
  });
  assert.deepEqual(queue, [{ id: "new", status: "captured" }]);
});

test("retry uses the original intake ID and preserves the unsaved entry", async () => {
  const queue = [{ id: "stable-id", status: "approved" }];
  const ids = [];
  const persist = async (item) => { ids.push(item.id); };
  await saveApprovedBatch({ queue, persist, onSaved: async () => { throw new Error("Commit failed"); } });
  await saveApprovedBatch({ queue, persist, onSaved: () => {} });
  assert.deepEqual(ids, ["stable-id", "stable-id"]);
  assert.equal(queue[0].id, "stable-id");
});

test("batch results retain parallel and sources, without claiming verified sales", () => {
  const result = normalizeBatchResult({ name: "Player", parallel: "Gold /25", confidence: "medium", results: [{ url: "https://example.com/comp", price: 20 }] });
  assert.equal(result.parallel, "Gold /25");
  assert.equal(result.results.length, 1);
  assert.equal(result.pricingEvidence, "ai_estimate_unverified");
  assert.equal(result.priceEstimate.mid, null);
  assert.equal(result.condition, undefined);
  assert.equal(normalizeBatchResult({ name: " " }), null);
});

test("a rate quote cannot create a tracking number, label or dispatch", () => {
  const state = shipmentStateFromService({ cost: 13, tracking: true, shipmentStatus: "shipped" });
  assert.deepEqual(state, {
    label_status: "pending", status: "pending", tracking_number: null,
    label_url: null, shipping_cost: 0, purchased_at: null, shipped_at: null,
  });
  assert.equal(shipmentFulfillmentStatus(state), "pending");
});

test("buying a genuine label remains pending fulfillment until dispatch", () => {
  const state = shipmentStateFromService({ labelStatus: "purchased", labelUrl: "https://carrier.example/label.pdf", trackingNumber: "REAL-123", cost: 8, shipmentStatus: "shipped" }, "2026-09-06T00:00:00Z");
  assert.equal(state.status, "label_purchased");
  assert.equal(state.tracking_number, "REAL-123");
  assert.equal(state.shipping_cost, 8);
  assert.equal(state.purchased_at, "2026-09-06T00:00:00Z");
  assert.equal(state.shipped_at, null);
  assert.equal(shipmentFulfillmentStatus(state), "pending");
});

test("untracked labels stay untracked and failed purchases have no artifacts", () => {
  assert.equal(shipmentStateFromService({ labelStatus: "purchased", labelUrl: "https://carrier.example/label.pdf" }).tracking_number, null);
  const failed = shipmentStateFromService({ labelStatus: "failed", labelUrl: "https://carrier.example/label.pdf", trackingNumber: "X", cost: 15 });
  assert.equal(failed.tracking_number, null);
  assert.equal(failed.label_url, null);
  assert.equal(failed.shipping_cost, 0);
  assert.equal(shipmentFulfillmentStatus(failed), "shipping_exception");
});

test("ambiguous label results require review rather than another purchase", () => {
  for (const service of [{ labelStatus: "purchased" }, { labelStatus: "purchase_unknown", purchaseError: "Timeout" }]) {
    const state = shipmentStateFromService(service);
    assert.equal(state.label_status, "purchase_unknown");
    assert.equal(state.shipped_at, null);
    assert.equal(shipmentFulfillmentStatus(state), "shipping_exception");
  }
});
