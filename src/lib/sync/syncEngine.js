import { diffById } from "./diffById.js";

export function createSyncEngine({ onSyncStateChange } = {}) {
  const syncTimers = {};
  const lastSynced = {};
  const syncInFlight = {};
  const pendingSync = {};
  let lastSyncState = false;

  function setSyncState() {
    const nextSyncState = Object.values(syncInFlight).some(Boolean);
    if (nextSyncState === lastSyncState) return;
    lastSyncState = nextSyncState;
    onSyncStateChange?.(nextSyncState);
  }

  function performCollectionSync(key, api, current) {
    const previous = lastSynced[key] || [];
    const { added, removed, changed } = diffById(previous, current);
    const operations = [
      ...added.map((item) => api.create(item)),
      ...changed.map((item) => api.update(item.id, item)),
      ...removed.map((item) => api.delete(item.id)),
    ];

    if (operations.length === 0) {
      lastSynced[key] = current;
      const pending = pendingSync[key];
      if (pending) {
        delete pendingSync[key];
        performCollectionSync(key, pending.api, pending.current);
        return;
      }
      syncInFlight[key] = false;
      setSyncState();
      return;
    }

    Promise.all(operations)
      .then(() => {
        lastSynced[key] = current;
      })
      .catch((error) => {
        console.warn(`Sync error (${key}):`, error);
      })
      .finally(() => {
        const pending = pendingSync[key];
        if (pending) {
          delete pendingSync[key];
          performCollectionSync(key, pending.api, pending.current);
          return;
        }
        syncInFlight[key] = false;
        setSyncState();
      });
  }

  function syncCollection(key, api, current) {
    if (syncInFlight[key]) {
      pendingSync[key] = { api, current };
      return;
    }

    syncInFlight[key] = true;
    setSyncState();
    performCollectionSync(key, api, current);
  }

  function scheduleCollectionSync(key, api, current, delay = 500) {
    clearTimeout(syncTimers[key]);
    syncTimers[key] = setTimeout(() => syncCollection(key, api, current), delay);
  }

  function scheduleValueSync(key, syncer, value, delay = 500) {
    clearTimeout(syncTimers[key]);
    syncTimers[key] = setTimeout(() => {
      syncer(value).catch((error) => {
        console.warn(`Sync error (${key}):`, error);
      });
    }, delay);
  }

  function setSnapshot(snapshot) {
    Object.assign(lastSynced, snapshot);
  }

  function clearTimers() {
    Object.values(syncTimers).forEach(clearTimeout);
  }

  return {
    clearTimers,
    scheduleCollectionSync,
    scheduleValueSync,
    setSnapshot,
  };
}

export function createCollectionSetter({
  key,
  persist,
  scheduleSync,
  setState,
  useServerRef,
}) {
  return (updater) => {
    setState((previous) => {
      const next =
        typeof updater === "function" ? updater(previous) : updater;
      persist(next);
      if (useServerRef.current) {
        scheduleSync(key, next);
      }
      return next;
    });
  };
}
