import { all } from "../../database.js";

export function buildIdentificationDataset() {
  return all(
    `SELECT
       cse.id,
       cse.item_id,
       cse.front_image_path,
       cse.back_image_path,
       cse.final_catalog_card_id,
       cse.accepted_by_rule_or_user,
       cse.correction_flag,
       ir.confidence,
       ir.explanation,
       ocr.ocr_text,
       ocr.parsed_json
     FROM confirmed_scan_examples cse
     LEFT JOIN identification_results ir ON ir.id = cse.identification_result_id
     LEFT JOIN ocr_results ocr ON ocr.item_id = cse.item_id
     ORDER BY cse.created_at DESC`,
  );
}
