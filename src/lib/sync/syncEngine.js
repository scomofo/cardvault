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

  function isAlreadyDeletedError(error) {
    const message = String(error?.message || "").toLowerCase();
    const status = error?.status;
    return status === 404 || message.includes("not found") || message.includes("404");
  }

  async function performCollectionSync(key, api, current) {
    const previous = lastSynced[key] || [];
    const { added, removed, changed } = diffById(previous, current);
    const tasks = [
      ...added.map((item) => ({ kind: "added", item, run: () => api.create(item) })),
      ...changed.map((item) => ({ kind: "changed", item, run: () => api.update(item.id, item) })),
      ...removed.map((item) => ({ kind: "removed", item, run: () => api.delete(item.id) })),
    ];

    if (tasks.length === 0) {
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

    // Await every operation (not Promise.all) so a newer queued sync never
    // starts while an older request is still in flight and able to overwrite
    // it. Reconcile each success into the snapshot so one failure does not
    // discard the other records' progress; treat a delete 404 as convergence.
    const results = await Promise.allSettled(tasks.map((task) => task.run()));
    const nextSnapshot = new Map((lastSynced[key] || []).map((item) => [item.id, item]));
    const currentMap = new Map(current.map((item) => [item.id, item]));
    let sawFailure = false;
    results.forEach((result, index) => {
      const task = tasks[index];
      if (result.status === "fulfilled") {
        if (task.kind === "removed") {
          nextSnapshot.delete(task.item.id);
        } else if (currentMap.has(task.item.id)) {
          nextSnapshot.set(task.item.id, currentMap.get(task.item.id));
        }
      } else if (task.kind === "removed" && isAlreadyDeletedError(result.reason)) {
        nextSnapshot.delete(task.item.id);
      } else {
        sawFailure = true;
        console.warn(`Sync error (${key}):`, result.reason);
      }
    });
    lastSynced[key] = [...nextSnapshot.values()];

    if (!sawFailure) {
      // All operations converged; adopt anything else already in current
      // (e.g. records that became no-ops while we were in flight).
      lastSynced[key] = current;
    }

    const pending = pendingSync[key];
    if (pending) {
      delete pendingSync[key];
      performCollectionSync(key, pending.api, pending.current);
      return;
    }
    syncInFlight[key] = false;
    setSyncState();
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
