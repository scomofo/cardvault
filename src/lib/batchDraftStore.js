/** Serialized writes with immediate editing snapshots and explicit save status. */
export function createBatchDraftStore({ load, save }) {
  let snapshot = { session: null, loading: true, saving: false, error: null, busy: null };
  let committed = null;
  const listeners = new Set();
  let initialLoad;
  let tail = Promise.resolve();
  let pending = 0;
  const emit = (patch) => { snapshot = { ...snapshot, ...patch }; listeners.forEach((listener) => listener()); };
  const init = () => {
    if (!initialLoad) initialLoad = load().then((session) => {
      committed = session;
      emit({ session, loading: false, error: null });
    }).catch((error) => { emit({ loading: false, error: error.message }); throw error; });
    return initialLoad;
  };
  const mutate = (transform) => {
    if (!snapshot.session || snapshot.loading) return init().then(() => mutate(transform));
    if (snapshot.error) return Promise.reject(new Error(snapshot.error));
    const previous = snapshot.session;
    let next;
    try { next = { ...transform(previous), revision: previous.revision + 1 }; }
    catch (error) { return Promise.reject(error); }
    pending++;
    // Inputs see each keystroke immediately; saving is not a durability claim.
    emit({ session: next, saving: true });
    const result = tail.then(async () => {
      if (snapshot.error) throw new Error(snapshot.error);
      await save(next, previous.revision);
      committed = next;
      // An older completed write must not replace a newer editing snapshot.
      return next;
    }).catch((error) => {
      const message = snapshot.error || `${error.message}. Reload the batch to recover; your last saved queue is intact.`;
      emit({ session: committed, error: message });
      throw error;
    });
    tail = result.catch(() => {});
    return result.finally(() => { pending--; emit({ saving: pending > 0 }); });
  };
  return {
    init, mutate, getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    async reload() { await tail; initialLoad = null; emit({ loading: true, error: null }); return init(); },
    async run(label, work) {
      if (snapshot.busy || snapshot.error) return false;
      emit({ busy: label });
      try {
        await tail; await init();
        if (snapshot.error) throw new Error(snapshot.error);
        return await work();
      } finally { emit({ busy: null }); }
    },
  };
}
