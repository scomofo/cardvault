// IndexedDB wrapper for images, localStorage for structured data
const DB_NAME = "cardvault";
const DB_VERSION = 1;
const IMG_STORE = "images";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IMG_STORE)) {
        db.createObjectStore(IMG_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

export async function saveImage(id, dataUrl) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, "readwrite");
    tx.objectStore(IMG_STORE).put(dataUrl, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadImage(id) {
  if (!id) return null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, "readonly");
    const req = tx.objectStore(IMG_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteImage(id) {
  if (!id) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, "readwrite");
    tx.objectStore(IMG_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function cleanupOrphanedImages(validIds) {
  const valid = new Set(validIds);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, "readwrite");
    const store = tx.objectStore(IMG_STORE);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      if (!valid.has(cursor.key)) cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllImages() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, "readwrite");
    tx.objectStore(IMG_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Structured data in localStorage with versioning
const SCHEMA_VERSION = 1;

const migrations = {
  // Future: { from: 1, to: 2, migrate: (data) => data }
};

function storageKey(key) {
  return `cv8_${key}`;
}

export function loadData(key, fallback = []) {
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    let data = parsed.data ?? parsed;
    let version = parsed.v ?? 0;

    // Run any needed migrations
    while (version < SCHEMA_VERSION) {
      const m = Object.values(migrations).find((m) => m.from === version);
      if (!m) break;
      data = m.migrate(data);
      version = m.to;
    }

    return data;
  } catch {
    return fallback;
  }
}

export function saveData(key, data) {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify({ v: SCHEMA_VERSION, data }));
    return true;
  } catch (e) {
    if (e.name === "QuotaExceededError" || e.code === 22) {
      console.error(`Storage quota exceeded for ${key}`);
      return false;
    }
    console.error(`Storage save failed for ${key}:`, e);
    return false;
  }
}

export function loadString(key, fallback = "") {
  return localStorage.getItem(storageKey(key)) || fallback;
}

export function saveString(key, value) {
  if (value !== undefined && value !== null) {
    localStorage.setItem(storageKey(key), value);
  }
}

export function clearAppData() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith("cv8_")) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}
