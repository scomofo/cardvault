from pathlib import Path

def replace(path, old, new):
    p = Path(path)
    text = p.read_text()
    assert text.count(old) == 1, (path, old)
    p.write_text(text.replace(old, new))

replace('src/lib/batchDraft.js', 'listingId: `draft_${card.id || id}`', 'listingId: `draft_${id}`')
replace('src/hooks/useBatchDraft.js', 'newDraftEntry({ id, card, source: "inventory"', 'newDraftEntry({ id: crypto.randomUUID(), card, source: "inventory"')
Path('src/lib/batchDraftStore.js').write_text('''/** Serialized writes with immediate editing snapshots and explicit save status. */
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
''')
Path('tests/batchReview.test.js').write_text('''import test from "node:test";
import assert from "node:assert/strict";
import { newDraftEntry, buildDraftPayload, inventoryBlockedReason } from "../src/lib/batchDraft.js";
import { createBatchDraftStore } from "../src/lib/batchDraftStore.js";
test("relisting inventory uses a new attempt ID but the same inventory ID", () => {
  const card = { id: "existing", name: "Player", status: "inventory" };
  const first = newDraftEntry({ id: "attempt-one", card, source: "inventory" });
  const next = newDraftEntry({ id: "attempt-two", card, source: "inventory" });
  assert.equal(first.itemId, card.id); assert.equal(next.itemId, card.id);
  assert.notEqual(first.listingId, next.listingId);
  assert.equal(inventoryBlockedReason(card, [{ cardId: card.id, id: first.listingId, status: "ended" }]), null);
  assert.equal(buildDraftPayload(next, "batch").draft.id, "draft_attempt-two");
});
test("rapid edits stay visible while serialized older writes finish", async () => {
  let disk = { revision: 0, title: "", entries: [] };
  const releases = [];
  const store = createBatchDraftStore({ load: async () => structuredClone(disk), save: (next, previous) => new Promise((resolve) => {
    assert.equal(previous, disk.revision); releases.push(() => { disk = structuredClone(next); resolve(); });
  }) });
  await store.init();
  const one = store.mutate((session) => ({ ...session, title: session.title + "A" }));
  assert.equal(store.getSnapshot().session.title, "A");
  const two = store.mutate((session) => ({ ...session, title: session.title + "B" }));
  const three = store.mutate((session) => ({ ...session, title: session.title + "C" }));
  assert.equal(store.getSnapshot().session.title, "ABC");
  for (const promise of [one, two, three]) {
    await new Promise((resolve) => setImmediate(resolve)); releases.shift()(); await promise;
    assert.equal(store.getSnapshot().session.title, "ABC");
  }
  assert.equal(disk.title, "ABC"); assert.equal(disk.revision, 3);
  assert.equal(store.getSnapshot().saving, false);
});
test("failed optimistic writes stop queued edits and draft saves until reload", async () => {
  let rejectWrite, writes = 0;
  const disk = { revision: 0, title: "saved", entries: [{ id: "keep" }] };
  const store = createBatchDraftStore({ load: async () => structuredClone(disk), save: () => { writes++; return new Promise((_resolve, reject) => { rejectWrite = reject; }); } });
  await store.init();
  const one = store.mutate((session) => ({ ...session, title: "unsaved" }));
  const two = store.mutate((session) => ({ ...session, title: "unsaved next" }));
  const operation = store.run("Saving drafts", () => assert.fail("Do not use failed edits"));
  const results = Promise.allSettled([one, two, operation]);
  await new Promise((resolve) => setImmediate(resolve)); rejectWrite(new Error("Quota exceeded"));
  assert.ok((await results).every((result) => result.status === "rejected"));
  assert.equal(writes, 1); assert.equal(store.getSnapshot().session.title, "saved");
  assert.equal(store.getSnapshot().saving, false);
  await store.reload(); assert.equal(store.getSnapshot().error, null);
});
''')
p = Path('tests/batchDraft.integration.test.js')
p.write_text(p.read_text() + '''
test("an ended batch listing can be relisted without deleting history or cloning inventory", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-batch-relist-" });
  const original = payload("relist-card"); await upload(baseUrl, original);
  assert.equal((await post(baseUrl, "/api/listings/draft", original)).status, 201);
  const ended = await fetch(`${baseUrl}/api/listings/${original.draft.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...original.draft, status: "ended" }) });
  assert.equal(ended.status, 200);
  const card = await (await fetch(`${baseUrl}/api/items/relist-card`)).json();
  const entry = { ...newDraftEntry({ id: "relisting-attempt", card, source: "inventory" }),
    identityConfirmed: true, conditionConfirmed: true, price: "35", shippingCost: "2" };
  const body = buildDraftPayload(entry, "new-batch");
  const result = await post(baseUrl, "/api/listings/draft", body);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal((await post(baseUrl, "/api/listings/draft", body)).status, 200);
  const listings = await (await fetch(`${baseUrl}/api/listings`)).json();
  assert.equal(listings.length, 2);
  assert.equal(listings.find((listing) => listing.id === original.draft.id).status, "ended");
  assert.equal(listings.find((listing) => listing.id === "draft_relisting-attempt").status, "draft");
  assert.equal((await (await fetch(`${baseUrl}/api/items`)).json()).length, 1);
});
''')
p = Path('docs/Batch-Sell-V1.md')
p.write_text(p.read_text() + '''\n## Review follow-up\n\nNew inventory selections get a per-attempt draft ID, retaining ended history and\nreusing only the current attempt on retries. Controlled edits appear immediately\nwhile saving is displayed; older writes cannot roll back newer typing. Storage\nfailures stop subsequent writes and restore the last committed queue until reload.\n''')
