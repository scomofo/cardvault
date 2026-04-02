import { all, get, run } from "../../database.js";
import { uid } from "../../routes/shared.js";

function signatureForItem(item) {
  return [
    item.front_img_id || "",
    item.back_img_id || "",
    item.player_name || item.name || "",
    item.card_set || "",
    item.card_number || "",
    item.parallel || "",
  ].join("|").toLowerCase();
}

export function updateSimilarityIndexForItem(itemId) {
  const item = get(`SELECT * FROM user_items WHERE id = ?`, [itemId]);
  if (!item) throw new Error("Item not found");
  const existing = get(`SELECT * FROM image_similarity_index WHERE example_item_id = ?`, [itemId]);
  const signature = signatureForItem(item);

  if (existing) {
    run(`UPDATE image_similarity_index SET signature = ? WHERE id = ?`, [signature, existing.id]);
    return get(`SELECT * FROM image_similarity_index WHERE id = ?`, [existing.id]);
  }

  const id = uid();
  run(
    `INSERT INTO image_similarity_index (id, example_item_id, catalog_card_id, signature)
     VALUES (?,?,?,?)`,
    [id, itemId, null, signature],
  );
  return get(`SELECT * FROM image_similarity_index WHERE id = ?`, [id]);
}

export function findSimilarExamples(itemId) {
  const item = get(`SELECT * FROM user_items WHERE id = ?`, [itemId]);
  if (!item) throw new Error("Item not found");
  const signature = signatureForItem(item);
  return all(`SELECT * FROM image_similarity_index WHERE signature = ? AND example_item_id != ?`, [
    signature,
    itemId,
  ]);
}
