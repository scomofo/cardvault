import { get, run, all } from "../../database.js";
import { uid } from "../../routes/shared.js";
import { automateIdentificationAndPricing } from "./identificationPricingAutomation.js";

/**
 * Create a new intake batch for bulk card scanning.
 * @param {{ source?: string, notes?: string }} [options]
 * @returns {object} The created batch record
 */
export function createIntakeBatch({
  name,
  intakeMode = "quick_batch",
  acquisitionSource = null,
  storageLocation = null,
  defaults = {},
  notes = null,
} = {}) {
  const batchId = uid();
  run(
    `INSERT INTO intake_batches (id, source, status, card_count, started_at, notes, created_at)
     VALUES (?,?,?,?,datetime('now'),?,datetime('now'))`,
    [batchId, intakeMode, "draft", 0, notes || name || intakeMode],
  );
  run(
    `INSERT INTO batch_defaults (id, batch_id, defaults_json, created_at, updated_at)
     VALUES (?,?,?,?,datetime('now'))`,
    [
      uid(),
      batchId,
      JSON.stringify({
        acquisitionSource,
        storageLocation,
        ...defaults,
      }),
      new Date().toISOString(),
    ],
  );
  return get(`SELECT * FROM intake_batches WHERE id = ?`, [batchId]);
}

/**
 * Add a scanned item to an intake batch.
 * @param {string} batchId
 * @param {{ itemId: string, captureId?: string }} params
 * @returns {object}
 */
export function addItemToBatch(batchId, {
  itemId,
  imageRef = null,
  imageSide = "front",
  blurScore = 0.9,
  edgeScore = 0.9,
} = {}) {
  const batch = get(`SELECT * FROM intake_batches WHERE id = ?`, [batchId]);
  if (!batch) throw new Error("Batch not found");
  const item = get(`SELECT * FROM user_items WHERE id = ?`, [itemId]);
  if (!item) throw new Error("Item not found");

  const captureId = uid();
  const batchItemId = uid();
  run(
    `INSERT INTO scan_captures
     (id, batch_id, inventory_item_id, image_side, image_ref, blur_score, edge_score, capture_status)
     VALUES (?,?,?,?,?,?,?,?)`,
    [captureId, batchId, itemId, imageSide, imageRef, blurScore, edgeScore, blurScore < 0.5 ? "blurry" : "captured"],
  );
  run(
    `INSERT INTO intake_batch_items
     (id, batch_id, inventory_item_id, scan_capture_id, processing_status, created_at)
     VALUES (?,?,?,?,?,datetime('now'))`,
    [batchItemId, batchId, itemId, captureId, "captured"],
  );
  run(`UPDATE intake_batches SET card_count = card_count + 1, status = 'scanning' WHERE id = ?`, [batchId]);
  return get(`SELECT * FROM intake_batch_items WHERE id = ?`, [batchItemId]);
}

/**
 * Process a single batch item through identification, pricing, and routing.
 * @param {string} batchItemId
 * @param {object} [options]
 * @returns {object} Processing result with identification and routing data
 */
export async function processBatchItem(batchItemId, options = {}) {
  const batchItem = get(`SELECT * FROM intake_batch_items WHERE id = ?`, [batchItemId]);
  if (!batchItem) throw new Error("Batch item not found");

  const item = get(`SELECT * FROM user_items WHERE id = ?`, [batchItem.inventory_item_id]);
  if (!item) throw new Error(`User item not found for batch item ${batchItemId}`);
  const automation = await automateIdentificationAndPricing(item.id, options);
  const identifiedCard = automation.identification.finalCatalogCardId
    ? get(`SELECT * FROM catalog_cards WHERE id = ?`, [automation.identification.finalCatalogCardId])
    : null;
  const confidence = Number(automation.identification.confidence || 0);
  const needsReview =
    automation.identification.recommendation === "needs_manual_review" ||
    automation.identification.recommendation === "requires_back_scan" ||
    automation.identification.recommendation === "unresolved" ||
    automation.identification.duplicateFlag;

  run(
    `UPDATE intake_batch_items
     SET processing_status = 'processed',
         identification_status = ?,
         pricing_status = ?,
         duplicate_status = ?,
         exception_status = ?,
         routing_recommendation = ?,
         finalized_status = ?
     WHERE id = ?`,
    [
      automation.identification.recommendation,
      automation.pricing.pricingConfidence,
      automation.identification.duplicateFlag ? "flagged" : "clear",
      needsReview ? "open" : "none",
      automation.pricing.suggestedPrice > 0 ? "ready_to_list" : "review",
      needsReview ? "needs_review" : "auto_accepted",
      batchItemId,
    ],
  );

  run(
    `INSERT INTO scan_processing_results
     (id, batch_item_id, ocr_text, match_confidence, matched_player, matched_set, matched_year, matched_card_number, parallel_detected, result_status)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      uid(),
      batchItemId,
      identifiedCard
        ? [
            identifiedCard.year,
            identifiedCard.manufacturer_name,
            identifiedCard.set_name,
            identifiedCard.player_name,
            identifiedCard.card_number,
            identifiedCard.parallel_name,
          ]
            .filter(Boolean)
            .join(" ")
        : item.name || item.player_name || "",
      confidence,
      identifiedCard?.player_name || item.player_name || item.name || null,
      identifiedCard?.set_name || item.card_set || null,
      identifiedCard?.year || item.year || null,
      identifiedCard?.card_number || item.card_number || null,
      identifiedCard?.parallel_name || item.parallel || null,
      needsReview ? "needs_review" : "processed",
    ],
  );

  if (needsReview) {
    run(
      `INSERT INTO intake_exceptions
       (id, batch_item_id, exception_type, severity, explanation, resolution_status, created_at)
       VALUES (?,?,?,?,?,?,datetime('now'))`,
      [
        uid(),
        batchItemId,
        automation.identification.duplicateFlag ? "possible_duplicate" : automation.identification.recommendation,
        confidence >= 0.85 ? "medium" : "high",
        automation.identification.explanation || `Automation recommendation: ${automation.identification.recommendation}`,
        "open",
      ],
    );
  }

  run(`UPDATE intake_batches SET status = 'processing' WHERE id = ?`, [batchItem.batch_id]);
  return automation;
}

/**
 * Finalize an intake batch and route items to inventory.
 * @param {string} batchId
 * @param {{ route?: string }} [options]
 * @returns {object}
 */
export function finalizeIntakeBatch(batchId, { route = "inventory" } = {}) {
  const batch = get(`SELECT * FROM intake_batches WHERE id = ?`, [batchId]);
  if (!batch) throw new Error("Batch not found");

  const items = all(`SELECT * FROM intake_batch_items WHERE batch_id = ?`, [batchId]);
  const defaults = get(`SELECT * FROM batch_defaults WHERE batch_id = ? ORDER BY updated_at DESC LIMIT 1`, [batchId]);
  const parsedDefaults = defaults?.defaults_json ? JSON.parse(defaults.defaults_json) : {};

  for (const item of items) {
    if (item.inventory_item_id) {
      run(
        `UPDATE user_items
         SET acquisition_source = COALESCE(acquisition_source, ?),
             storage_location = COALESCE(storage_location, ?),
             listing_status = CASE WHEN ? = 'ready_to_list' THEN 'draft' ELSE listing_status END,
             updated_at = datetime('now')
         WHERE id = ?`,
        [parsedDefaults.acquisitionSource || null, parsedDefaults.storageLocation || null, route, item.inventory_item_id],
      );
    }
  }

  run(
    `UPDATE intake_batches
     SET status = 'finalized',
         completed_at = datetime('now')
     WHERE id = ?`,
    [batchId],
  );

  return {
    batchId,
    finalizedCount: items.length,
    route,
  };
}
