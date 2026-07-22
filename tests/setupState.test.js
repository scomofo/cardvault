import test from "node:test";
import assert from "node:assert/strict";

import { deriveSetupProgress, SETUP_STEPS } from "../src/lib/setupState.js";

test("deriveSetupProgress reports nothing done for empty statuses", () => {
  const progress = deriveSetupProgress({});
  assert.equal(progress.complete, false);
  assert.equal(progress.remaining, 3);
  assert.equal(progress.nextKey, "ai");
  assert.deepEqual(progress.steps.map((step) => step.done), [false, false, false]);
});

test("deriveSetupProgress marks each step done from its status shape", () => {
  const progress = deriveSetupProgress({
    ai: { configured: true },
    ebay: { configured: true, connected: false },
    shipping: [{ id: "conn-1" }],
  });
  assert.deepEqual(
    progress.steps.map((step) => [step.key, step.done]),
    [["ai", true], ["ebay", false], ["shipping", true]],
  );
  assert.equal(progress.remaining, 1);
  assert.equal(progress.nextKey, "ebay");
});

test("deriveSetupProgress completes when all three are connected", () => {
  const progress = deriveSetupProgress({
    ai: { configured: true },
    ebay: { connected: true },
    shipping: [{ id: "conn-1" }],
  });
  assert.equal(progress.complete, true);
  assert.equal(progress.nextKey, null);
});

test("deriveSetupProgress treats null/error statuses as not done", () => {
  const progress = deriveSetupProgress({ ai: null, ebay: null, shipping: null });
  assert.equal(progress.remaining, 3);
});

test("SETUP_STEPS keys match the derivation keys", () => {
  assert.deepEqual(SETUP_STEPS.map((step) => step.key), ["ai", "ebay", "shipping"]);
});
