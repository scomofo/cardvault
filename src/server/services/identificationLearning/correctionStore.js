import { get, run } from "../../database.js";
import { uid } from "../../routes/shared.js";

function parsedCluesForResult(identificationResultId) {
  const row = get(
    `SELECT ocr.parsed_json
     FROM identification_results ir
     JOIN ocr_results ocr ON ocr.item_id = ir.item_id
     WHERE ir.id = ?
     ORDER BY ocr.created_at DESC LIMIT 1`,
    [identificationResultId],
  );
  if (!row?.parsed_json) return null;
  try {
    return JSON.parse(row.parsed_json);
  } catch {
    return null;
  }
}

function topCandidateForResult(identificationResultId) {
  const row = get(
    `SELECT candidate_json FROM identification_candidates
     WHERE item_id = (SELECT item_id FROM identification_results WHERE id = ?)
     ORDER BY rank_order ASC LIMIT 1`,
    [identificationResultId],
  );
  if (!row?.candidate_json) return null;
  try {
    return JSON.parse(row.candidate_json);
  } catch {
    return null;
  }
}

function correctedCardRecord(correctedCatalogCardId) {
  if (!correctedCatalogCardId) return null;
  return get(`SELECT * FROM catalog_cards WHERE id = ?`, [correctedCatalogCardId]) || null;
}

export function storeIdentificationCorrection({
  identificationResultId,
  correctedCatalogCardId,
  reason = null,
} = {}) {
  const result = get(`SELECT * FROM identification_results WHERE id = ?`, [identificationResultId]);
  if (!result) throw new Error("Identification result not found");

  const correctionId = uid();
  run(
    `INSERT INTO scan_corrections
     (id, identification_result_id, corrected_catalog_card_id, reason, created_at)
     VALUES (?,?,?,?,datetime('now'))`,
    [correctionId, identificationResultId, correctedCatalogCardId, reason],
  );

  const feedbackPayload = {
    clues: parsedCluesForResult(identificationResultId),
    originalTopCandidate: topCandidateForResult(identificationResultId),
    correctedCard: correctedCardRecord(correctedCatalogCardId),
    originalRecommendation: result.recommendation,
    originalConfidence: result.confidence,
    reason: reason || null,
  };
  run(
    `INSERT INTO identification_feedback
     (id, identification_result_id, accepted, corrected, corrected_catalog_card_id, reason, payload_json, created_at)
     VALUES (?,?,?,?,?,?,?,datetime('now'))`,
    [
      uid(),
      identificationResultId,
      0,
      1,
      correctedCatalogCardId,
      reason,
      JSON.stringify(feedbackPayload),
    ],
  );

  run(
    `UPDATE identification_results
     SET final_catalog_card_id = ?, accepted_by_rule_or_user = 'user', correction_flag = 1
     WHERE id = ?`,
    [correctedCatalogCardId, identificationResultId],
  );

  return get(`SELECT * FROM identification_results WHERE id = ?`, [identificationResultId]);
}
