/** Save only approved entries, using intake IDs so retries are idempotent. */
export async function saveApprovedBatch({ queue, persist, onSaved, onError }) {
  const savedIds = [];
  const failedIds = [];
  // Snapshot the work, but remove successes from the caller's CURRENT queue.
  // New captures and unresolved entries must never be cleared here.
  for (const item of queue.filter((entry) => ["done", "approved"].includes(entry.status))) {
    try {
      await persist(item);
      await onSaved(item);
      savedIds.push(item.id);
    } catch (error) {
      failedIds.push(item.id);
      onError?.(item, error);
    }
  }
  return { savedIds, failedIds };
}

export function normalizeBatchResult(response) {
  if (!response?.name?.trim()) return null;
  // These are model-reported labels, not calibrated probabilities.
  const confidence = response.confidence === "high" ? 0.9 : response.confidence === "medium" ? 0.7 : 0.4;
  return {
    name: response.name, set: response.set || "", number: response.number || "",
    year: response.year || "", rarity: response.rarity || "", parallel: response.parallel || "",
    type: response.type || "sports", confidence,
    confidenceLabel: response.confidence || "low",
    priceEstimate: response.priceEstimate || { low: null, mid: null, high: null },
    priceHistory: response.priceHistory || [],
    results: response.results || [],
    pricingEvidence: "ai_estimate_unverified",
  };
}

// A failed removal must remain visible and retryable.
export async function persistBatchRemoval({ queue, id, persist, apply }) {
  const remaining = queue.filter((entry) => entry.id !== id);
  await persist(remaining);
  apply(remaining);
  return remaining;
}
