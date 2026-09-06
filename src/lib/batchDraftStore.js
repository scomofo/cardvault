/** Serialized, durable queue edits shared across view remounts. I/O is injectable for tests. */
export function createBatchDraftStore({ load, save }) {
  let snapshot = { session: null, loading: true, saving: false, error: null, busy: null };
  const listeners = new Set();
  let initialLoad;
  let tail = Promise.resolve();
  let pending = 0;
  const emit = (patch) => { snapshot = { ...snapshot, ...patch }; listeners.forEach((listener) => listener()); };
  const init = () => {
    if (!initialLoad) initialLoad = load().then((session) => emit({ session, loading: false, error: null })).catch((error) => { emit({ loading: false, error: error.message }); throw error; });
    return initialLoad;
  };
  const mutate = (transform) => {
    pending++;
    emit({ saving: true });
    const result = tail.catch(() => {}).then(async () => {
      await init();
      if (snapshot.error) throw new Error(snapshot.error);
      const previous = snapshot.session;
      const next = { ...transform(previous), revision: previous.revision + 1 };
      await save(next, previous.revision);
      emit({ session: next, error: null });
      return next;
    });
    tail = result;
    return result.catch((error) => { emit({ error: `${error.message}. Reload the batch to recover; your last saved queue is intact.` }); throw error; })
      .finally(() => { pending--; emit({ saving: pending > 0 }); });
  };
  return {
    init, mutate, getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    async reload() { await tail.catch(() => {}); initialLoad = null; emit({ loading: true, error: null }); return init(); },
    async run(label, work) {
      if (snapshot.busy || snapshot.error) return false;
      emit({ busy: label });
      try { await tail; await init(); return await work(); }
      finally { emit({ busy: null }); }
    },
  };
}
