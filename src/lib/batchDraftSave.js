import { buildDraftPayload, draftReadiness } from "./batchDraft.js";

export async function saveDraftSelection({ entries, batchId, feeRate, persist, onSaved, onError }) {
  const savedIds = [], failedIds = [], skippedIds = [];
  for (const entry of entries.filter((item) => item.selected && item.stage !== "saved")) {
    if (!draftReadiness(entry, feeRate).ready) { skippedIds.push(entry.id); continue; }
    try {
      const result = await persist(buildDraftPayload(entry, batchId), entry);
      await onSaved(entry, result);
      savedIds.push(entry.id);
    } catch (error) {
      failedIds.push(entry.id);
      await onError(entry, error);
    }
  }
  return { savedIds, failedIds, skippedIds };
}
