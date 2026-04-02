import test from "node:test";
import assert from "node:assert/strict";
import { diffById } from "../src/lib/sync/diffById.js";
import { createSyncEngine } from "../src/lib/sync/syncEngine.js";

function wait(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("diffById detects added removed and changed items", () => {
  const previous = [
    { id: "a", name: "one", updatedAt: "2026-01-01T00:00:00.000Z" },
    { id: "b", name: "two", meta: { grade: 8 } },
  ];
  const next = [
    { id: "a", name: "one", updatedAt: "2026-02-01T00:00:00.000Z" },
    { id: "c", name: "three" },
  ];

  const result = diffById(previous, next);

  assert.deepEqual(result.added.map((item) => item.id), ["c"]);
  assert.deepEqual(result.removed.map((item) => item.id), ["b"]);
  assert.deepEqual(result.changed.map((item) => item.id), ["a"]);
});

test("sync engine schedules create update and delete operations", async () => {
  const calls = [];
  const syncStates = [];
  const engine = createSyncEngine({
    onSyncStateChange: (value) => syncStates.push(value),
  });

  engine.setSnapshot({
    catalog: [
      { id: "keep", name: "same" },
      { id: "change", name: "before", updatedAt: "1" },
      { id: "remove", name: "gone" },
    ],
  });

  const api = {
    create: async (item) => calls.push(["create", item.id]),
    update: async (id) => calls.push(["update", id]),
    delete: async (id) => calls.push(["delete", id]),
  };

  engine.scheduleCollectionSync(
    "catalog",
    api,
    [
      { id: "keep", name: "same" },
      { id: "change", name: "after", updatedAt: "2" },
      { id: "add", name: "new" },
    ],
    0,
  );

  await wait(20);

  assert.deepEqual(calls, [
    ["create", "add"],
    ["update", "change"],
    ["delete", "remove"],
  ]);
  assert.deepEqual(syncStates, [true, false]);
});
