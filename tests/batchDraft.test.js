import test from "node:test";
import assert from "node:assert/strict";
import { newDraftEntry, draftReadiness, draftPreview, buildDraftPayload, migrateDraftSession, inventoryBlockedReason, applyDraftIdentification } from "../src/lib/batchDraft.js";
import { createBatchDraftStore } from "../src/lib/batchDraftStore.js";
import { saveDraftSelection } from "../src/lib/batchDraftSave.js";

const ready = (id = "card") => ({ ...newDraftEntry({ id, card: { name: "Player", set: "Set", year: "2020", number: "12", parallel: "Gold /25", condition: "near_mint" } }),
  frontImgId: `img_${id}_front`, backImgId: `img_${id}_back`, price: "20", shippingCost: "2", identityConfirmed: true, conditionConfirmed: true, selected: true });

test("draft preparation carries identity, photos, locations and IDs without publishing", () => {
  const entry = { ...ready(), storageLocation: "Box 2" };
  const result = buildDraftPayload(entry, "batch");
  assert.equal(result.item.id, "card");
  assert.equal(result.item.storageLocation, "Box 2");
  assert.equal(result.draft.status, "draft");
  assert.equal(result.draft.publishStatus, "draft");
  assert.equal(result.draft.platform, "ebay");
  assert.equal(result.item.status, "inventory");
  assert.match(result.draft.listingTitle, /Gold \/25/);
  assert.match(result.draft.listingDescription, /Near Mint.*seller inspected/);
  assert.doesNotMatch(result.draft.listingDescription, /Near Mint 8|Ships tracked/);
});
test("readiness requires real photo references, inspected condition, identity and complete estimates", () => {
  const entry = ready();
  assert.equal(draftReadiness(entry, .1).proceeds, 16);
  assert.equal(draftReadiness(entry, .1).ready, true);
  for (const patch of [{ backImgId: null }, { frontImgId: null }, { identityConfirmed: false }, { conditionConfirmed: false }, { price: "0" }, { price: "-10" }, { shippingCost: "" }, { buyerShipping: "abc" }, { descriptionOverride: "" }]) {
    assert.equal(draftReadiness({ ...entry, ...patch }, .1).ready, false, JSON.stringify(patch));
  }
});
test("low-return cards are retained for lots unless explicitly overridden", () => {
  const entry = { ...ready(), minProceeds: "25" };
  assert.equal(draftReadiness(entry, .1).bucket, "lot");
  assert.equal(draftReadiness({ ...entry, allowLowReturn: true }, .1).ready, true);
  assert.equal(draftReadiness({ ...entry, allowLowReturn: true, disposition: "lot" }, .1).ready, false);
});
test("manual listing text survives identity edits until explicitly reset", () => {
  const entry = { ...ready(), titleOverride: "My title", descriptionOverride: "My actual condition notes" };
  assert.deepEqual(draftPreview({ ...entry, card: { ...entry.card, name: "Updated name" } }), { title: "My title", description: "My actual condition notes" });
});
test("AI suggestions retain sources but cannot overwrite corrections or confirm identity", () => {
  const entry = { ...ready(), identityConfirmed: false };
  const result = applyDraftIdentification(entry, { name: "Wrong player", parallel: "Base", confidence: "high", priceEstimate: { mid: 500 }, results: [{ title: "Reference", price: 500 }] });
  assert.equal(result.card.name, "Player"); assert.equal(result.card.parallel, "Gold /25");
  assert.equal(result.price, "20"); assert.equal(result.identityConfirmed, false);
  assert.equal(result.card.priceEstimate.evidence, "ai_estimate_unverified");
  assert.equal(result.card.priceEstimate.results.length, 1);
});
test("inventory candidates exclude sold, listed, drafted and already selected cards", () => {
  assert.equal(inventoryBlockedReason({ id: "a", status: "inventory" }, []), null);
  assert.match(inventoryBlockedReason({ id: "a", status: "sold" }, []), /sold/);
  assert.match(inventoryBlockedReason({ id: "a", status: "listed" }, []), /listed/);
  assert.match(inventoryBlockedReason({ id: "a" }, [{ cardId: "a", status: "draft" }]), /draft/);
  assert.match(inventoryBlockedReason({ id: "a" }, [], [{ itemId: "a" }]), /batch/);
});
test("legacy migration retains ready, failed and unresolved scans with stable inventory IDs", () => {
  const result = migrateDraftSession(null, [
    { id: "a", front: "photo", status: "done", result: { name: "Player", parallel: "Gold", priceEstimate: { mid: 20 } } },
    { id: "b", front: "other", status: "failed", error: "Offline" },
  ], [{ id: "c", frontImg: "photo", name: "Manual", costBasis: "12", priceEstimate: { mid: 30 } }]);
  assert.equal(result.entries.length, 3);
  assert.equal(result.entries[0].itemId, "a");
  assert.equal(result.entries[0].card.parallel, "Gold");
  assert.equal(result.entries[1].error, "Offline");
  assert.equal(result.entries[2].card.costBasis, "12");
  assert.equal(result.entries[0].identityConfirmed, false);
  assert.equal(result.entries[0].conditionConfirmed, false);
  assert.equal(migrateDraftSession(result).entries.length, 3);
  assert.throws(() => migrateDraftSession(null, [{ front: "missing id" }]), /missing its ID/);
});
test("mixed batch saves only selected ready entries and retains partial failures", async () => {
  let entries = [ready("ok"), ready("fail"), { ...ready("unselected"), selected: false }, { ...ready("review"), identityConfirmed: false }, { ...ready("lot"), disposition: "lot" }];
  const seen = [];
  const result = await saveDraftSelection({ entries, batchId: "batch", feeRate: .1,
    persist: async (payload) => { seen.push(payload.draft.id); if (payload.item.id === "fail") throw new Error("Connection lost"); return payload; },
    onSaved: (entry) => { entries = entries.map((row) => row.id === entry.id ? { ...row, stage: "saved" } : row); },
    onError: (entry, error) => { entries = entries.map((row) => row.id === entry.id ? { ...row, error: error.message } : row); },
  });
  assert.deepEqual(result, { savedIds: ["ok"], failedIds: ["fail"], skippedIds: ["review", "lot"] });
  assert.equal(entries.length, 5); assert.equal(entries[1].error, "Connection lost");
  assert.deepEqual(seen, ["draft_ok", "draft_fail"]);
});
test("interrupted draft saves retry the identical listing ID", async () => {
  const ids = [];
  for (let i = 0; i < 2; i++) await saveDraftSelection({ entries: [ready()], batchId: "batch", feeRate: .1,
    persist: async (payload) => { ids.push(payload.draft.id); },
    onSaved: () => { if (!i) throw new Error("Checkpoint failed"); }, onError: () => {},
  });
  assert.deepEqual(ids, ["draft_card", "draft_card"]);
});
test("queue edits serialize across remounts without losing concurrent field changes", async () => {
  let disk = { version: 1, revision: 0, entries: [], defaults: {} };
  const store = createBatchDraftStore({ load: async () => structuredClone(disk), save: async (next, previous) => { assert.equal(previous, disk.revision); await new Promise((resolve) => setTimeout(resolve, 2)); disk = structuredClone(next); } });
  await store.init();
  await Promise.all([store.mutate((state) => ({ ...state, title: "First" })), store.mutate((state) => ({ ...state, note: "Second" }))]);
  await store.reload();
  assert.equal(store.getSnapshot().session.title, "First"); assert.equal(store.getSnapshot().session.note, "Second");
  assert.equal(store.getSnapshot().saving, false);
});
test("a failed durable edit leaves the last saved queue and requires recovery", async () => {
  const store = createBatchDraftStore({ load: async () => ({ revision: 0, entries: [{ id: "keep" }] }), save: async () => { throw new Error("Quota exceeded"); } });
  await store.init();
  await assert.rejects(store.mutate((session) => ({ ...session, entries: [] })), /Quota/);
  assert.equal(store.getSnapshot().session.entries.length, 1);
  assert.match(store.getSnapshot().error, /last saved queue is intact/);
  assert.equal(store.getSnapshot().saving, false);
});
test("overlapping operations cannot create two batch saves", async () => {
  const store = createBatchDraftStore({ load: async () => ({ revision: 0, entries: [] }), save: async () => {} });
  await store.init(); let release;
  const first = store.run("Saving", () => new Promise((resolve) => { release = resolve; }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(await store.run("Saving again", () => assert.fail("Must not run")), false);
  release(); await first; assert.equal(store.getSnapshot().busy, null);
});

test("a twenty-card batch resumes with sixteen saved drafts and four unresolved cards", async () => {
  let disk = { version: 1, revision: 0, id: "batch", entries: Array.from({ length: 20 }, (_, i) => ({ ...ready(`card${i}`), identityConfirmed: i < 16 })), defaults: {} };
  const store = createBatchDraftStore({ load: async () => structuredClone(disk), save: async (next) => { disk = structuredClone(next); } });
  await store.init(); const persisted = [];
  await saveDraftSelection({ entries: store.getSnapshot().session.entries, batchId: "batch", feeRate: .1,
    persist: async (payload) => { persisted.push(payload); },
    onSaved: (entry) => store.mutate((session) => ({ ...session, entries: session.entries.map((row) => row.id === entry.id ? { ...row, stage: "saved", selected: false } : row) })),
    onError: () => assert.fail("No persistence failures expected"),
  });
  await store.reload();
  assert.equal(persisted.length, 16);
  assert.equal(new Set(persisted.map((payload) => payload.draft.id)).size, 16);
  assert.equal(store.getSnapshot().session.entries.filter((entry) => entry.stage === "saved").length, 16);
  assert.equal(store.getSnapshot().session.entries.filter((entry) => entry.stage !== "saved").length, 4);
});
test("conflicting legacy IDs fail migration rather than overwriting a photo", () => {
  assert.throws(() => migrateDraftSession(null, [{ id: "same", front: "one" }], [{ id: "same", frontImg: "two" }]), /conflicting card IDs/);
});
