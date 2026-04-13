import { get, run, all } from "../../database.js";
import { uid } from "../../routes/shared.js";
import { extractOcr } from "./ocrExtractor.js";
import { parseClues } from "./clueParser.js";
import { generateCandidates } from "./candidateGenerator.js";
import { rankCandidates } from "./candidateRanker.js";
import { scoreConfidence } from "./confidenceScorer.js";
import { routeReview } from "./reviewRouter.js";

function seedCatalogCards() {
  const existing = get(`SELECT COUNT(*) AS count FROM catalog_cards`);
  if (existing?.count > 0) return;

  const items = all(
    `SELECT DISTINCT
       COALESCE(player_name, name) AS player_name,
       manufacturer,
       card_set,
       year,
       card_number,
       parallel,
       team
     FROM user_items
     WHERE COALESCE(player_name, name) IS NOT NULL AND card_set IS NOT NULL`,
  );

  for (const item of items) {
    run(
      `INSERT INTO catalog_cards
       (player_name, manufacturer_name, set_name, year, card_number, parallel_name, team_name,
        normalized_player_name, normalized_set_name, normalized_parallel_name, external_reference_key, source_confidence)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        item.player_name,
        item.manufacturer,
        item.card_set,
        item.year,
        item.card_number,
        item.parallel,
        item.team,
        String(item.player_name || "").toLowerCase(),
        String(item.card_set || "").toLowerCase(),
        String(item.parallel || "").toLowerCase(),
        `${item.year || ""}-${item.card_set || ""}-${item.card_number || ""}`,
        0.7,
      ],
    );
  }
}

/**
 * Identify a card using OCR text, candidate matching, and confidence scoring.
 * @param {{ itemId: string, batchItemId?: string, ocrText?: string }} params
 * @returns {{ result: object, candidateCount: number, confidence: number }}
 */
export function identifyCard({ itemId, batchItemId = null, ocrText = null } = {}) {
  seedCatalogCards();

  const item = get(`SELECT * FROM user_items WHERE id = ?`, [itemId]);
  if (!item) throw new Error("Item not found");

  const ocr = extractOcr({ item, batchItemId, ocrText });
  const clues = parseClues(ocr.ocrText, item);
  run(`UPDATE ocr_results SET parsed_json = ? WHERE id = ?`, [JSON.stringify(clues), ocr.id]);

  const generated = generateCandidates(clues);
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
        candidate.card.id,
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
