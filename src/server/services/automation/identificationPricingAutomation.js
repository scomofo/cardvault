import { all, get, run } from "../../database.js";
import { identifyCard } from "../identification/identificationService.js";
import { refreshPricingForItem } from "../pricing/pricingService.js";

function getDuplicateCount(item) {
  const row = get(
    `SELECT COUNT(*) AS count
     FROM user_items
     WHERE id != ?
       AND COALESCE(player_name, name) = COALESCE(?, COALESCE(player_name, name))
       AND COALESCE(card_set, '') = COALESCE(?, '')
       AND COALESCE(card_number, '') = COALESCE(?, '')`,
    [item.id, item.player_name || item.name || null, item.card_set || "", item.card_number || ""],
  );
  return row?.count || 0;
}

/**
 * Run full identification and pricing pipeline for an item.
 * @param {string} itemId
 * @param {{ pricingStrategy?: string }} [options]
 * @returns {Promise<{ identification: object, pricing: object }>}
 */
export async function automateIdentificationAndPricing(itemId, { pricingStrategy = "market" } = {}) {
  const item = get(`SELECT * FROM user_items WHERE id = ?`, [itemId]);
  if (!item) throw new Error("Item not found");

  const identification = identifyCard({ itemId });
  const matchConfidence = Number(identification.result.confidence || 0);
  const duplicateCount = getDuplicateCount(item);
  const topCandidate = identification.result.finalCatalogCard;

  if (topCandidate) {
    run(
      `UPDATE user_items
       SET player_name = COALESCE(NULLIF(player_name, ''), ?),
           manufacturer = COALESCE(NULLIF(manufacturer, ''), ?),
           card_set = COALESCE(NULLIF(card_set, ''), ?),
           year = COALESCE(NULLIF(year, ''), ?),
           card_number = COALESCE(NULLIF(card_number, ''), ?),
           parallel = COALESCE(NULLIF(parallel, ''), ?),
           team = COALESCE(NULLIF(team, ''), ?),
           updated_at = datetime('now')
       WHERE id = ?`,
      [
        topCandidate.player_name || null,
        topCandidate.manufacturer_name || null,
        topCandidate.set_name || null,
        topCandidate.year || null,
        topCandidate.card_number || null,
        topCandidate.parallel_name || null,
        topCandidate.team_name || null,
        itemId,
      ],
    );
  }

  let identificationRecommendation = identification.result.recommendation;
  if (duplicateCount > 0) identificationRecommendation = "flag_duplicate";

  const pricing = await refreshPricingForItem(itemId);
  const preferredRecommendation = pricing.recommendations.find((row) => row.strategy === pricingStrategy)
    || pricing.recommendations.find((row) => row.strategy === "market")
    || pricing.recommendations[0]
    || null;

  const weakComps = Number(pricing.latest?.sample_size || 0) < 2;
  const repricingTrigger = item.listing_status === "listed" && Number(item.last_comp_price || 0) > 0
    ? Number(item.suggested_listing_price || 0) > Number(item.last_comp_price || 0) * 1.1
    : false;

  run(
    `UPDATE user_items
     SET listing_status = CASE
           WHEN ? = 'auto_accept_match' AND ? = 0 THEN 'ready_to_list'
           WHEN ? = 'flag_duplicate' THEN 'review'
           WHEN ? = 'requires_back_scan' THEN 'review'
           WHEN ? = 'needs_manual_review' THEN 'review'
           ELSE listing_status
         END,
         updated_at = datetime('now')
     WHERE id = ?`,
    [
      identificationRecommendation,
      weakComps ? 1 : 0,
      identificationRecommendation,
      identificationRecommendation,
      identificationRecommendation,
      itemId,
    ],
  );

  return {
    itemId,
    identification: {
      recommendation: identificationRecommendation,
      confidence: matchConfidence,
      duplicateFlag: duplicateCount > 0,
      reviewFlag: identificationRecommendation === "needs_manual_review",
      duplicateCount,
      resultId: identification.result.id,
      explanation: identification.result.explanation,
      reviewQueue: identification.result.reviewQueue,
      finalCatalogCardId: identification.result.finalCatalogCardId,
    },
    pricing: {
      suggestedPrice: preferredRecommendation ? Number((preferredRecommendation.recommended_price_cents / 100).toFixed(2)) : 0,
      offerFloor: preferredRecommendation ? Number((preferredRecommendation.minimum_acceptable_price_cents / 100).toFixed(2)) : 0,
      pricingConfidence: preferredRecommendation?.confidence || "low",
      repricingTrigger,
      latestSnapshot: pricing.latest,
    },
  };
}
