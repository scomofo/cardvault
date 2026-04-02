import { get, run } from "../../database.js";
import { uid } from "../../routes/shared.js";

export function extractOcr({ item, batchItemId = null, ocrText = null }) {
  const derivedText =
    ocrText ||
    [item.year, item.manufacturer, item.card_set, item.player_name || item.name, item.card_number, item.parallel]
      .filter(Boolean)
      .join(" ");

  const record = {
    id: uid(),
    itemId: item.id,
    batchItemId,
    ocrText: derivedText,
    sourceConfidence: Number(item.cv_centering_score || 0.75),
  };

  run(
    `INSERT INTO ocr_results (id, item_id, batch_item_id, ocr_text, parsed_json, source_confidence)
     VALUES (?,?,?,?,?,?)`,
    [record.id, record.itemId, record.batchItemId, record.ocrText, null, record.sourceConfidence],
  );

  return record;
}
