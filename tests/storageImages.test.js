import test from "node:test";
import assert from "node:assert/strict";

function createIndexedDbMock() {
  const store = new Map();

  function createRequest() {
    return {
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      result: null,
      error: null,
    };
  }

  class MockObjectStore {
    put(value, key) {
      store.set(key, value);
    }

    get(key) {
      const req = createRequest();
      queueMicrotask(() => {
        req.result = store.get(key);
        req.onsuccess?.();
      });
      return req;
    }

    delete(key) {
      store.delete(key);
    }

    clear() {
      store.clear();
    }

    openCursor() {
      const req = createRequest();
      const entries = [...store.entries()];
      let index = 0;
      const advance = () => {
        const entry = entries[index];
        req.result = entry
          ? {
              key: entry[0],
              value: entry[1],
              continue() {
                index += 1;
                queueMicrotask(advance);
              },
            }
          : null;
        req.onsuccess?.();
      };
      queueMicrotask(advance);
      return req;
    }
  }

  class MockTransaction {
    constructor(mode) {
      this.mode = mode;
      this.error = null;
      this.oncomplete = null;
      this.onerror = null;
      setTimeout(() => this.oncomplete?.(), 0);
    }

    objectStore() {
      return new MockObjectStore();
    }
  }

  class MockDb {
    constructor() {
      this.objectStoreNames = {
        contains(name) {
          return name === "images";
        },
      };
    }

    createObjectStore() {}

    transaction(_name, mode) {
      return new MockTransaction(mode);
    }
  }

  return {
    open() {
      const req = createRequest();
      queueMicrotask(() => {
        req.result = new MockDb();
        req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
}

test("image storage export/import preserves scanned images in backups", async () => {
  globalThis.indexedDB = createIndexedDbMock();
  const storage = await import(`../src/lib/storage.js?test=${Date.now()}`);

  await storage.saveImage("front-1", "data:image/png;base64,front");
  await storage.saveImage("back-1", "data:image/png;base64,back");

  const exported = await storage.exportAllImages();
  assert.deepEqual(exported, {
    "front-1": "data:image/png;base64,front",
    "back-1": "data:image/png;base64,back",
  });

  await storage.importAllImages({
    "replacement-1": "data:image/png;base64,replacement",
  });

  assert.equal(await storage.loadImage("front-1"), null);
  assert.equal(await storage.loadImage("replacement-1"), "data:image/png;base64,replacement");
});
