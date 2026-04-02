import { get, run } from "../../database.js";
import { uid } from "../../routes/shared.js";

export function storeConfirmedScan({ itemId, identificationResultId, acceptedBy = "user" } = {}) {
  const item = get(`SELECT * FROM user_items WHERE id = ?`, [itemId]);
  const result = get(`SELECT * FROM identification_results WHERE id = ?`, [identificationResultId]);
  if (!item || !result) throw new Error("Confirmed scan requires item and identification result");

  const id = uid();
  run(
    `INSERT INTO confirmed_scan_examples
     (id, item_id, identification_result_id, front_image_path, back_image_path, final_catalog_card_id, accepted_by_rule_or_user, correction_flag)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      id,
      itemId,
      identificationResultId,
      item.front_img_id || null,
      item.back_img_id || null,
      result.final_catalog_card_id,
      acceptedBy,
      0,
    ],
  );

  return get(`SELECT * FROM confirmed_scan_examples WHERE id = ?`, [id]);
}
