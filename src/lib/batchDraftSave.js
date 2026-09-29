import { buildDraftPayload, draftReadiness } from "./batchDraft.js";
import { mapPool } from "./pool.js";

// Draft persistence is network-bound (photo uploads + draft creates); a small
// pool keeps it moving. onSaved/onError stay serial after the pool so the
// session mutations apply in stable input order.
const SAVE_CONCURRENCY = 3;

export async function saveDraftSelection({ entries, batchId, feeRate, persist, onSaved, onError }) {
  const savedIds = [], failedIds = [], skippedIds = [];
  const ready = [];
  for (const entry of entries.filter((item) => item.selected && item.stage !== "saved")) {
    if (!draftReadiness(entry, feeRate).ready) { skippedIds.push(entry.id); continue; }
    ready.push(entry);
  }
  const outcomes = await mapPool(ready, SAVE_CONCURRENCY, (entry) => persist(buildDraftPayload(entry, batchId), entry));
  for (let index = 0; index < ready.length; index++) {
    const entry = ready[index];
    const outcome = outcomes[index];
    if (!outcome.ok) {
      failedIds.push(entry.id);
      await onError(entry, outcome.error);
      continue;
    }
    try {
      await onSaved(entry, outcome.value);
      savedIds.push(entry.id);
    } catch (error) {
      // A checkpoint failure is a per-entry failure, not an abort of the batch.
      failedIds.push(entry.id);
      await onError(entry, error);
    }
  }
  return { savedIds, failedIds, skippedIds };
}
