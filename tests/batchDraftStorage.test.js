import test from "node:test";
import assert from "node:assert/strict";
import { migrateDraftSession } from "../src/lib/batchDraft.js";

// Small transaction double: commit buffered writes together; abort changes nothing.
function indexedDBFixture(seed) {
  const stores = { images: new Map(), batch_sessions: new Map(Object.entries(seed)) };
  const db = {
    objectStoreNames: { contains: (key) => key in stores },
    transaction() {
      const copy = Object.fromEntries(Object.entries(stores).map(([key, value]) => [key, new Map(value)]));
      let aborted = false;
      const tx = {
        objectStore: (name) => ({
          get(key) { const request = {}; queueMicrotask(() => { request.result = copy[name].get(key); request.onsuccess?.(); }); return request; },
          put(value, key) { copy[name].set(key, structuredClone(value)); },
          delete(key) { copy[name].delete(key); },
        }),
        abort() { aborted = true; queueMicrotask(() => tx.onabort?.()); },
      };
      setTimeout(() => { if (!aborted) { Object.assign(stores, copy); tx.oncomplete?.(); } }, 0);
      return tx;
    },
  };
  return { stores, indexedDB: { open() { const request = {}; queueMicrotask(() => { request.result = db; request.onsuccess?.(); }); return request; } } };
}

test("legacy batch migration commits its queue and photos before deleting old session keys", async () => {
  const fixture = indexedDBFixture({ scan: [{ id: "scan1", front: "front-bytes", back: "back-bytes", status: "review", result: { name: "Player" } }], tools: [{ id: "tool1", frontImg: "other-bytes", name: "" }] });
  globalThis.indexedDB = fixture.indexedDB;
  const storage = await import(`../src/lib/storage.js?draft-storage=1`);
  const session = await storage.transactSellingBatch((values) => ({ session: migrateDraftSession(values.selling, values.scan, values.tools), migrate: true }));
  assert.equal(session.entries.length, 2);
  assert.equal(fixture.stores.images.get("img_scan1_front"), "front-bytes");
  assert.equal(fixture.stores.images.get("img_scan1_back"), "back-bytes");
  assert.equal(fixture.stores.batch_sessions.has("scan"), false);
  assert.equal(fixture.stores.batch_sessions.has("tools"), false);
  assert.equal(fixture.stores.batch_sessions.get("selling").entries.length, 2);
});
test("failed migration rolls back photos, new queue and old queue removals", async () => {
  const old = [{ front: "photo", error: "Missing ID" }];
  const fixture = indexedDBFixture({ scan: old }); globalThis.indexedDB = fixture.indexedDB;
  const storage = await import(`../src/lib/storage.js?draft-storage=2`);
  await assert.rejects(storage.transactSellingBatch((values) => ({ session: migrateDraftSession(values.selling, values.scan), migrate: true })), /missing its ID/);
  assert.deepEqual(fixture.stores.batch_sessions.get("scan"), old);
  assert.equal(fixture.stores.batch_sessions.has("selling"), false);
  assert.equal(fixture.stores.images.size, 0);
});
test("a stale tab cannot overwrite a more recent selling session", async () => {
  const fixture = indexedDBFixture({ selling: { revision: 5, entries: [{ id: "keep" }] } }); globalThis.indexedDB = fixture.indexedDB;
  const storage = await import(`../src/lib/storage.js?draft-storage=3`);
  await assert.rejects(storage.transactSellingBatch((values) => {
    if (values.selling.revision !== 4) throw new Error("Changed in another tab");
    return { session: { revision: 5, entries: [] } };
  }), /another tab/);
  assert.deepEqual(fixture.stores.batch_sessions.get("selling").entries, [{ id: "keep" }]);
});
