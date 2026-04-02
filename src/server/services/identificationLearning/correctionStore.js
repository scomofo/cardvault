import { get, run } from "../../database.js";
import { uid } from "../../routes/shared.js";

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

  run(
    `INSERT INTO identification_feedback
     (id, identification_result_id, accepted, corrected, corrected_catalog_card_id, reason, created_at)
     VALUES (?,?,?,?,?,?,datetime('now'))`,
    [uid(), identificationResultId, 0, 1, correctedCatalogCardId, reason],
  );

  run(
    `UPDATE identification_results
     SET final_catalog_card_id = ?, accepted_by_rule_or_user = 'user', correction_flag = 1
     WHERE id = ?`,
    [correctedCatalogCardId, identificationResultId],
  );

  return get(`SELECT * FROM identification_results WHERE id = ?`, [identificationResultId]);
}
