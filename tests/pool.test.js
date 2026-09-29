import test from "node:test";
import assert from "node:assert/strict";
import { mapPool } from "../src/lib/pool.js";

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("mapPool preserves input order with uneven durations", async () => {
  const results = await mapPool([30, 10, 20], 3, async (ms) => {
    await tick(ms);
    return ms;
  });
  assert.deepEqual(results.map((r) => r.value), [30, 10, 20]);
  assert.ok(results.every((r) => r.ok));
});

test("mapPool respects the concurrency limit", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  await mapPool([1, 2, 3, 4, 5, 6], 2, async (n) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await tick(10);
    inFlight -= 1;
    return n;
  });
  assert.equal(maxInFlight, 2);
});

test("mapPool captures per-item errors without aborting the rest", async () => {
  const results = await mapPool(["a", "b", "c"], 2, async (value) => {
    if (value === "b") throw new Error("boom");
    return value.toUpperCase();
  });
  assert.deepEqual(results, [
    { ok: true, value: "A" },
    { ok: false, error: results[1].error },
    { ok: true, value: "C" },
  ]);
  assert.equal(results[1].error.message, "boom");
});

test("mapPool passes the item index to the worker", async () => {
  const seen = [];
  await mapPool(["x", "y"], 2, async (value, index) => { seen.push([value, index]); });
  assert.deepEqual(seen.sort((a, b) => a[1] - b[1]), [["x", 0], ["y", 1]]);
});

test("mapPool handles empty input and degenerate limits", async () => {
  assert.deepEqual(await mapPool([], 3, async () => 1), []);
  const serial = await mapPool([1, 2], 0, async (n) => n * 2);
  assert.deepEqual(serial.map((r) => r.value), [2, 4]);
  const over = await mapPool([1], 10, async (n) => n + 1);
  assert.deepEqual(over.map((r) => r.value), [2]);
});
