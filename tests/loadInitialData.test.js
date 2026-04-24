import test from "node:test";
import assert from "node:assert/strict";
import { loadInitialData } from "../src/lib/bootstrap/loadInitialData.js";

function createLocalStorageMock() {
  const store = new Map();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    key(index) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key) {
      store.delete(key);
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
  };
}

function writeCollection(localStorage, key, value) {
  localStorage.setItem(`cv8_${key}`, JSON.stringify({ v: 1, data: value }));
}

test("loadInitialData persists server settings even when collections are empty", async () => {
  globalThis.localStorage = createLocalStorageMock();
  const state = {
    userName: [],
    shipFrom: [],
  };
  const setState = {
    catalog: () => {},
    sales: () => {},
    orders: () => {},
    trades: () => {},
    watchlist: () => {},
    gradings: () => {},
    listings: () => {},
    purchases: () => {},
    userName: (value) => state.userName.push(value),
    shipFrom: (value) => state.shipFrom.push(value),
  };

  const result = await loadInitialData({
    checkBackend: async () => true,
    apis: {
      items: { list: async () => [] },
      sales: { list: async () => [] },
      orders: { list: async () => [] },
      trades: { list: async () => [] },
      watchlist: { list: async () => [] },
      gradings: { list: async () => [] },
      listings: { list: async () => [] },
      purchases: { list: async () => [] },
      settings: { get: async () => ({ userName: "Server User", shipFrom: "Server Address" }) },
    },
    migrate: async () => {
      throw new Error("migrate should not be called");
    },
    setState,
  });

  assert.equal(result.useServer, true);
  assert.deepEqual(result.snapshot.catalog, []);
  assert.deepEqual(state.userName, ["Server User"]);
  assert.deepEqual(state.shipFrom, ["Server Address"]);
  assert.equal(globalThis.localStorage.getItem("cv8_user"), "Server User");
  assert.equal(globalThis.localStorage.getItem("cv8_addr"), "Server Address");
});

test("loadInitialData preserves server settings when migrating local collections", async () => {
  globalThis.localStorage = createLocalStorageMock();
  writeCollection(globalThis.localStorage, "catalog", [{ id: "card-1", name: "Local Card" }]);
  globalThis.localStorage.setItem("cv8_user", "Local User");
  globalThis.localStorage.setItem("cv8_addr", "Local Address");
  let migratedPayload = null;

  const result = await loadInitialData({
    checkBackend: async () => true,
    apis: {
      items: { list: async () => [] },
      sales: { list: async () => [] },
      orders: { list: async () => [] },
      trades: { list: async () => [] },
      watchlist: { list: async () => [] },
      gradings: { list: async () => [] },
      listings: { list: async () => [] },
      purchases: { list: async () => [] },
      settings: { get: async () => ({ userName: "Server User", shipFrom: "Server Address" }) },
    },
    migrate: async (payload) => {
      migratedPayload = payload;
    },
    setState: {
      catalog: () => {},
      sales: () => {},
      orders: () => {},
      trades: () => {},
      watchlist: () => {},
      gradings: () => {},
      listings: () => {},
      purchases: () => {},
      userName: () => {},
      shipFrom: () => {},
    },
  });

  assert.equal(result.useServer, true);
  assert.deepEqual(result.snapshot.catalog, [{ id: "card-1", name: "Local Card" }]);
  assert.ok(migratedPayload);
  assert.deepEqual(migratedPayload.catalog, [{ id: "card-1", name: "Local Card" }]);
  assert.equal(migratedPayload.userName, "Server User");
  assert.equal(migratedPayload.shipFrom, "Server Address");
});
