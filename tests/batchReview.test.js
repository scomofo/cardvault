import test from "node:test";
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
