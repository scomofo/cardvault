/**
 * Score overall identification confidence.
 * @param {object[]} rankedCandidates
 * @param {object} clues
 * @param {object} item
 * @returns {{ confidence: number, recommendation: string, finalCatalogCardId: string|null }}
 */
export function scoreConfidence(rankedCandidates, clues, item) {
  const top = rankedCandidates[0];
  const second = rankedCandidates[1];
  if (!top) {
    return { confidence: 0.1, recommendation: "unresolved", explanation: "No viable candidates found." };
  }

  const gap = top.score - (second?.score || 0);
  const hasBack = Boolean(item.back_img_id);
  const riskyValue = Number(item.market_price || item.suggested_listing_price || 0) >= 100;
  const confidence = Math.max(Math.min(top.score + gap * 0.4, 0.99), 0.05);

  let recommendation = "needs_manual_review";
  if (confidence >= 0.95 && gap >= 0.2 && !riskyValue) recommendation = "auto_accept_match";
  else if (!hasBack && top.parallelScore < 0.15 && confidence >= 0.7) recommendation = "requires_back_scan";
  else if (confidence < 0.5) recommendation = "unresolved";

  return {
    confidence,
    recommendation,
    explanation: `Top candidate scored ${(top.score * 100).toFixed(1)}% with a ${(gap * 100).toFixed(1)} point gap.`,
  };
}
