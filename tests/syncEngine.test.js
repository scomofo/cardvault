import test from "node:test";
import assert from "node:assert/strict";
import { diffById } from "../src/lib/sync/diffById.js";
import { createCollectionSetter, createSyncEngine } from "../src/lib/sync/syncEngine.js";

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

test("sync engine replays the latest queued collection state after an in-flight sync", async () => {
  const calls = [];
  const syncStates = [];
  let releaseFirstSync;
  const firstSyncDone = new Promise((resolve) => {
    releaseFirstSync = resolve;
  });
  const engine = createSyncEngine({
    onSyncStateChange: (value) => syncStates.push(value),
  });

  engine.setSnapshot({
    catalog: [{ id: "card-1", name: "before", updatedAt: "1" }],
  });

  const api = {
    create: async () => {
      throw new Error("create should not be called");
    },
    update: async (id, item) => {
      calls.push(["update", id, item.name]);
      if (item.name === "first-pass") {
        await firstSyncDone;
      }
    },
    delete: async () => {
      throw new Error("delete should not be called");
    },
  };

  engine.scheduleCollectionSync(
    "catalog",
    api,
    [{ id: "card-1", name: "first-pass", updatedAt: "2" }],
    0,
  );

  await wait(5);

  engine.scheduleCollectionSync(
    "catalog",
    api,
    [{ id: "card-1", name: "second-pass", updatedAt: "3" }],
    0,
  );

  await wait(5);
  releaseFirstSync();
  await wait(20);

  assert.deepEqual(calls, [
    ["update", "card-1", "first-pass"],
    ["update", "card-1", "second-pass"],
  ]);
  assert.deepEqual(syncStates, [true, false]);
});

test("sync engine keeps the global syncing state true until all collections finish", async () => {
  const syncStates = [];
  let releaseCatalog;
  let releaseSales;
  const catalogDone = new Promise((resolve) => {
    releaseCatalog = resolve;
  });
  const salesDone = new Promise((resolve) => {
    releaseSales = resolve;
  });
  const engine = createSyncEngine({
    onSyncStateChange: (value) => syncStates.push(value),
  });

  const slowApi = (donePromise) => ({
    create: async () => {
      await donePromise;
    },
    update: async () => {
      await donePromise;
    },
    delete: async () => {
      await donePromise;
    },
  });

  engine.scheduleCollectionSync(
    "catalog",
    slowApi(catalogDone),
    [{ id: "catalog-1", name: "Catalog item" }],
    0,
  );
  engine.scheduleCollectionSync(
    "sales",
    slowApi(salesDone),
    [{ id: "sale-1", cardName: "Sale item" }],
    0,
  );

  await wait(5);
  releaseCatalog();
  await wait(5);
  assert.deepEqual(syncStates, [true]);

  releaseSales();
  await wait(20);
  assert.deepEqual(syncStates, [true, false]);
});

test("diffById compares timestamps, key counts, nested objects, and primitives", () => {
  const stamped = diffById(
    [{ id: "a", name: "old", updatedAt: "1" }],
    [{ id: "a", name: "new", updatedAt: "1" }],
  );
  assert.equal(stamped.changed.length, 0, "matching updatedAt short-circuits field comparison");

  const extraKey = diffById([{ id: "a", name: "x" }], [{ id: "a", name: "x", note: "hi" }]);
  assert.deepEqual(extraKey.changed.map((item) => item.id), ["a"]);

  const sameNested = diffById(
    [{ id: "a", meta: { grade: 8 } }],
    [{ id: "a", meta: { grade: 8 } }],
  );
  assert.equal(sameNested.changed.length, 0);

  const changedNested = diffById(
    [{ id: "a", meta: { grade: 8 } }],
    [{ id: "a", meta: { grade: 9 } }],
  );
  assert.equal(changedNested.changed.length, 1);

  const changedPrimitive = diffById([{ id: "a", name: "x" }], [{ id: "a", name: "y" }]);
  assert.equal(changedPrimitive.changed.length, 1);
});

test("sync engine settles immediately when there is nothing to sync", async () => {
  const syncStates = [];
  const engine = createSyncEngine({
    onSyncStateChange: (value) => syncStates.push(value),
  });
  const snapshot = [{ id: "a", name: "same" }];
  engine.setSnapshot({ catalog: snapshot });

  const api = {
    create: async () => {
      throw new Error("no operations expected");
    },
    update: async () => {
      throw new Error("no operations expected");
    },
    delete: async () => {
      throw new Error("no operations expected");
    },
  };
  engine.scheduleCollectionSync("catalog", api, [{ id: "a", name: "same" }], 0);
  await wait(20);
  assert.deepEqual(syncStates, [true, false]);
});

test("sync engine keeps the previous snapshot when operations fail", async () => {
  const attempts = [];
  const engine = createSyncEngine();
  engine.setSnapshot({ catalog: [] });

  const api = {
    create: async (item) => {
      attempts.push(item.id);
      throw new Error("create rejected");
    },
    update: async () => {},
    delete: async () => {},
  };

  engine.scheduleCollectionSync("catalog", api, [{ id: "a" }], 0);
  await wait(20);
  engine.scheduleCollectionSync("catalog", api, [{ id: "a" }], 0);
  await wait(20);

  assert.deepEqual(attempts, ["a", "a"], "failed items are retried on the next sync");
});

test("scheduleValueSync debounces, delivers values, and swallows rejections", async () => {
  const values = [];
  const engine = createSyncEngine();

  engine.scheduleValueSync("settings", async (value) => values.push(value), "stale", 30);
  engine.scheduleValueSync("settings", async (value) => values.push(value), "fresh", 0);
  await wait(50);
  assert.deepEqual(values, ["fresh"], "reschedule replaces the pending value");

  engine.scheduleValueSync("settings", async () => {
    throw new Error("value sync rejected");
  }, "boom", 0);
  await wait(20);
  assert.deepEqual(values, ["fresh"], "rejections are logged, not thrown");
});

test("clearTimers cancels pending scheduled syncs", async () => {
  const values = [];
  const engine = createSyncEngine();
  engine.scheduleValueSync("settings", async (value) => values.push(value), "cancelled", 30);
  engine.clearTimers();
  await wait(60);
  assert.deepEqual(values, []);
});

test("createCollectionSetter persists and syncs only when server-backed", () => {
  const persisted = [];
  const synced = [];
  let state = ["one"];
  const setState = (updater) => {
    state = updater(state);
  };

  const serverSetter = createCollectionSetter({
    key: "cards",
    persist: (next) => persisted.push(next),
    scheduleSync: (key, next) => synced.push([key, next]),
    setState,
    useServerRef: { current: true },
  });
  serverSetter((previous) => [...previous, "two"]);
  assert.deepEqual(state, ["one", "two"]);
  assert.deepEqual(persisted, [["one", "two"]]);
  assert.deepEqual(synced, [["cards", ["one", "two"]]]);

  const localSetter = createCollectionSetter({
    key: "cards",
    persist: (next) => persisted.push(next),
    scheduleSync: (key, next) => synced.push([key, next]),
    setState,
    useServerRef: { current: false },
  });
  localSetter(["replaced"]);
  assert.deepEqual(state, ["replaced"], "non-function updaters are applied directly");
  assert.equal(persisted.length, 2);
  assert.equal(synced.length, 1, "local-only mode skips the server sync");
});
