import { get, run } from "../../database.js";
import { uid } from "../../routes/shared.js";
import { extractOcr } from "./ocrExtractor.js";
import { parseClues } from "./clueParser.js";
import { generateCandidates } from "./candidateGenerator.js";
import { generateExternalCandidates } from "./externalCandidateGenerator.js";
import { rankCandidates } from "./candidateRanker.js";
import { scoreConfidence } from "./confidenceScorer.js";
import { routeReview } from "./reviewRouter.js";
import { isEbayVerifierEnabled, verifyCandidateAgainstEbay } from "../metadata/ebayVerifier.js";

/**
 * Identify a card using OCR text, external visual search, and confidence
 * scoring.
 *
 * When the caller supplies `visualSearchResult` (the payload returned by the
 * client-side aiVisualSearch flow), candidates are built from that external
 * data rather than matched against the local catalog. The catalog is no
 * longer seeded from user_items — it is intended to record cards the user
 * actually owns, which happens when an identification is confirmed.
 *
 * The local catalog path is kept as a backward-compatibility fallback for
 * callers that have not been updated to pass a visual search result yet.
 *
 * @param {{
 *   itemId: string,
 *   batchItemId?: string|null,
 *   ocrText?: string|null,
 *   visualSearchResult?: object|null,
 * }} params
 */
export async function identifyCard({
  itemId,
  batchItemId = null,
  ocrText = null,
  visualSearchResult = null,
} = {}) {
  const item = get(`SELECT * FROM user_items WHERE id = ?`, [itemId]);
  if (!item) throw new Error("Item not found");

  const ocr = extractOcr({ item, batchItemId, ocrText });
  const clues = parseClues(ocr.ocrText, item);
  run(`UPDATE ocr_results SET parsed_json = ? WHERE id = ?`, [JSON.stringify(clues), ocr.id]);

  const generated = visualSearchResult
    ? generateExternalCandidates(clues, visualSearchResult)
    : generateCandidates(clues);

  if (visualSearchResult && isEbayVerifierEnabled() && generated[0]) {
    const verification = await verifyCandidateAgainstEbay(generated[0].card);
    if (verification) {
      generated[0].card.ebayVerification = verification;
      const next = Math.max(0, Math.min(generated[0].score + verification.adjustment, 0.99));
      generated[0].score = next;
    }
  }

  const ranked = rankCandidates(generated);
  const confidence = scoreConfidence(ranked, clues, item);
  const review = routeReview(confidence, item);

  for (const candidate of ranked) {
    run(
      `INSERT INTO identification_candidates
       (id, item_id, batch_item_id, catalog_card_id, rank_order, candidate_score, explanation, candidate_json)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        uid(),
        item.id,
        batchItemId,
        candidate.card.id || null,
        candidate.rank,
        candidate.score,
        candidate.explanation,
        JSON.stringify(candidate.card),
      ],
    );
  }

  const topCandidate = ranked[0]?.card || null;
  const resultId = uid();
  run(
    `INSERT INTO identification_results
     (id, item_id, batch_item_id, final_catalog_card_id, recommendation, confidence, explanation, accepted_by_rule_or_user, correction_flag)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      resultId,
      item.id,
      batchItemId,
      topCandidate?.id || null,
      confidence.recommendation,
      confidence.confidence,
      confidence.explanation,
      "rule",
      0,
    ],
  );

  return {
    ocr,
    clues,
    candidates: ranked,
    result: {
      id: resultId,
      recommendation: confidence.recommendation,
      confidence: confidence.confidence,
      explanation: confidence.explanation,
      reviewQueue: review.queue,
      severity: review.severity,
      finalCatalogCardId: topCandidate?.id || null,
      finalCatalogCard: topCandidate,
    },
  };
}
