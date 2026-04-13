import { all, get, run } from "../../database.js";
import { uid } from "../../routes/shared.js";
import { fetchSportsCardsProPrice } from "./sportscardspro.js";
import {
  centsToDollars,
  recommendationFromSnapshot,
} from "./pricingMapper.js";

function insertSnapshot(itemId, snapshot) {
  const snapshotId = uid();
  run(
    `INSERT INTO price_snapshots
     (id, item_id, catalog_card_id, source, observed_at, condition_bucket,
      market_price_cents, average_price_cents, low_price_cents, high_price_cents,
      last_comp_price_cents, sample_size, raw_payload)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      snapshotId,
      itemId,
      snapshot.catalogCardId,
      snapshot.source,
      snapshot.observedAt,
      snapshot.conditionBucket,
      snapshot.marketPriceCents,
      snapshot.averagePriceCents,
      snapshot.lowPriceCents,
      snapshot.highPriceCents,
      snapshot.lastCompPriceCents,
      snapshot.sampleSize,
      JSON.stringify(snapshot.rawPayload),
    ],
  );

  for (const comp of snapshot.comps) {
    run(
      `INSERT INTO price_comps
       (id, snapshot_id, item_id, source, comp_date, comp_price_cents, title, url, grade, condition_bucket)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        uid(),
        snapshotId,
        itemId,
        snapshot.source,
        comp.compDate || null,
        comp.compPriceCents || 0,
        comp.title || null,
        comp.url || null,
        comp.grade || null,
        comp.conditionBucket || snapshot.conditionBucket,
      ],
    );
  }

  const recommendations = recommendationFromSnapshot(snapshot);
  const explanation = `Quick sale follows the last comp less 10%, market tracks the last comp, and premium leans toward the recent high range.`;

  for (const [strategy, recommendedPriceCents] of Object.entries(recommendations)) {
    if (strategy === "min_acceptable_price_cents") continue;
    run(
      `INSERT INTO pricing_recommendations
       (id, item_id, snapshot_id, strategy, recommended_price_cents, minimum_acceptable_price_cents, confidence, explanation)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        uid(),
        itemId,
        snapshotId,
        strategy,
        recommendedPriceCents,
        recommendations.min_acceptable_price_cents,
        snapshot.sampleSize >= 8 ? "high" : snapshot.sampleSize >= 4 ? "medium" : "low",
        explanation,
      ],
    );
  }

  run(
    `UPDATE user_items
     SET market_price = ?,
         suggested_listing_price = ?,
         min_acceptable_price = ?,
         last_comp_price = ?,
         average_comp_price = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    [
      centsToDollars(snapshot.marketPriceCents),
      centsToDollars(recommendations.market),
      centsToDollars(recommendations.min_acceptable_price_cents),
      centsToDollars(snapshot.lastCompPriceCents),
      centsToDollars(snapshot.averagePriceCents),
      itemId,
    ],
  );

  return { snapshotId, recommendations };
}

export async function refreshPricingForItem(itemId) {
  const item = get("SELECT * FROM user_items WHERE id = ?", [itemId]);
  if (!item) throw new Error("Item not found");

  const snapshot = await fetchSportsCardsProPrice(item);
  insertSnapshot(itemId, snapshot);
  return getPricingForItem(itemId);
}

/**
 * Look up pricing by catalog card reference.
 * @param {object} lookup
 * @returns {Promise<object>}
 */
export async function lookupPricingByCatalogCard(lookup) {
  return fetchSportsCardsProPrice(lookup);
}

/**
 * Get historical price snapshots for an item.
 * @param {string} itemId
 * @returns {object[]}
 */
export function getPricingHistory(itemId) {
  return all(
    `SELECT * FROM price_snapshots WHERE item_id = ? ORDER BY observed_at DESC, created_at DESC`,
    [itemId],
  );
}

/**
 * Get the most recent price snapshot for an item.
 * @param {string} itemId
 * @returns {object|null}
 */
export function getLatestPricing(itemId) {
  return get(
    `SELECT * FROM price_snapshots WHERE item_id = ? ORDER BY observed_at DESC, created_at DESC LIMIT 1`,
    [itemId],
  );
}

/**
 * Get pricing recommendations for an item.
 * @param {string} itemId
 * @returns {object[]}
 */
export function getPricingRecommendations(itemId) {
  return all(
    `SELECT * FROM pricing_recommendations WHERE item_id = ? ORDER BY created_at DESC`,
    [itemId],
  );
}

/**
 * Get current pricing data for an item including history and recommendations.
 * @param {string} itemId
 * @returns {{ latest: object|null, history: object[], recommendations: object[] }}
 */
export function getPricingForItem(itemId) {
  const latest = getLatestPricing(itemId);
  return {
    latest,
    history: getPricingHistory(itemId),
    recommendations: getPricingRecommendations(itemId),
    comps: latest
      ? all(`SELECT * FROM price_comps WHERE snapshot_id = ? ORDER BY comp_date DESC, created_at DESC`, [
          latest.id,
        ])
      : [],
  };
}
