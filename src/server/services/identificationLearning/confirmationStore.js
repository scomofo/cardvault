import { get, run } from "../../database.js";
import { uid } from "../../routes/shared.js";
import { normalizeText } from "../identification/utils.js";

/**
 * Insert or reuse a catalog_cards row derived from a confirmed external
 * candidate. Catalog rows now represent cards the user has positively
 * identified; they are no longer seeded from the collection ahead of time.
 */
function upsertCatalogCardFromCandidate(card) {
  if (!card) return null;
  if (card.id) return Number(card.id);

  const playerName = card.player_name || card.name || "";
  const setName = card.set_name || card.set || "";
  const cardNumber = card.card_number || card.number || "";
  const parallelName = card.parallel_name || card.parallel || "";

  const externalKey =
    card.external_reference_key ||
    [card.year, setName, cardNumber]
      .map((part) => String(part || "").trim().toLowerCase())
      .filter(Boolean)
      .join("|");

  if (externalKey) {
    const existing = get(
      `SELECT id FROM catalog_cards WHERE external_reference_key = ?`,
      [externalKey],
    );
    if (existing?.id) return Number(existing.id);
  }

  const insert = run(
    `INSERT INTO catalog_cards
     (player_name, manufacturer_name, set_name, year, card_number, parallel_name, team_name,
      normalized_player_name, normalized_set_name, normalized_parallel_name,
      external_reference_key, source_confidence)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      playerName,
      card.manufacturer_name || "",
      setName,
      card.year || "",
      cardNumber,
      parallelName,
      card.team_name || "",
      normalizeText(playerName),
      normalizeText(setName),
      normalizeText(parallelName),
      externalKey || null,
      1.0,
    ],
  );
  return insert?.lastInsertRowid ? Number(insert.lastInsertRowid) : null;
}

function topCandidateCardForResult(identificationResultId) {
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

function parsedCluesForItem(itemId) {
  const row = get(
    `SELECT parsed_json FROM ocr_results
     WHERE item_id = ? ORDER BY created_at DESC LIMIT 1`,
    [itemId],
  );
  if (!row?.parsed_json) return null;
  try {
    return JSON.parse(row.parsed_json);
  } catch {
    return null;
  }
}

export function storeConfirmedScan({ itemId, identificationResultId, acceptedBy = "user" } = {}) {
  const item = get(`SELECT * FROM user_items WHERE id = ?`, [itemId]);
  const result = get(`SELECT * FROM identification_results WHERE id = ?`, [identificationResultId]);
  if (!item || !result) throw new Error("Confirmed scan requires item and identification result");

  const topCard = topCandidateCardForResult(identificationResultId);
  let finalCatalogCardId = result.final_catalog_card_id;
  if (!finalCatalogCardId) {
    finalCatalogCardId = upsertCatalogCardFromCandidate(topCard);
    if (finalCatalogCardId) {
      run(
        `UPDATE identification_results SET final_catalog_card_id = ? WHERE id = ?`,
        [finalCatalogCardId, identificationResultId],
      );
    }
  }

  const feedbackPayload = {
    acceptedBy,
    clues: parsedCluesForItem(itemId),
    confirmedCard: topCard || null,
    recommendation: result.recommendation,
    confidence: result.confidence,
  };
  run(
    `INSERT INTO identification_feedback
     (id, identification_result_id, accepted, corrected, corrected_catalog_card_id, reason, payload_json, created_at)
     VALUES (?,?,?,?,?,?,?,datetime('now'))`,
    [
      uid(),
      identificationResultId,
      1,
      0,
      finalCatalogCardId,
      null,
      JSON.stringify(feedbackPayload),
    ],
  );

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
      finalCatalogCardId,
      acceptedBy,
      0,
    ],
  );

  return get(`SELECT * FROM confirmed_scan_examples WHERE id = ?`, [id]);
}
