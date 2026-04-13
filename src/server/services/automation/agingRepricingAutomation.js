import { all, get, run } from "../../database.js";
import { uid } from "../../routes/shared.js";

function suggestionForItem(item) {
  const ageDays = Number(item.age_days || 0);
  const trend = Number(item.market_trend || 0);

  if (ageDays >= 180) {
    return { recommendation: "liquidate", action: "mark_clearance", priceMultiplier: 0.6 };
  }
  if (ageDays >= 120) {
    return { recommendation: "bundle_or_clearance", action: "bundle_suggestion", priceMultiplier: 0.72 };
  }
  if (ageDays >= 90) {
    return { recommendation: "price_drop_or_auction", action: "auction_conversion_suggestion", priceMultiplier: trend < 0 ? 0.82 : 0.88 };
  }
  if (ageDays >= 60) {
    return { recommendation: "suggest_price_drop", action: "price_drop_suggestion", priceMultiplier: trend < 0 ? 0.9 : 0.95 };
  }
  if (ageDays >= 30) {
    return { recommendation: "review", action: "review_inventory", priceMultiplier: 1 };
  }
  return null;
}

function ensureAlert(itemId, alertType, explanation, suggestedAction) {
  const existing = get(
    `SELECT * FROM market_alerts WHERE item_id = ? AND alert_type = ? AND status = 'open'`,
    [itemId, alertType],
  );
  if (existing) return existing.id;

  const id = uid();
  run(
    `INSERT INTO market_alerts
     (id, item_id, alert_type, severity, explanation, suggested_action, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?, 'open', datetime('now'), datetime('now'))`,
    [id, itemId, alertType, alertType === "dead_inventory" ? "high" : "medium", explanation, suggestedAction],
  );
  return id;
}

/**
 * Identify aging listings and generate repricing recommendations.
 * @param {{ autoApply?: boolean }} [options]
 * @returns {{ repriced: object[], skipped: object[] }}
 */
export function runAgingRepricingAutomation({ autoApply = false } = {}) {
  const items = all(
    `SELECT
       a.item_id,
       a.name,
       a.age_days,
       a.market_price,
       a.suggested_listing_price,
       a.listing_status,
       ui.last_comp_price,
       CASE
         WHEN COALESCE(ui.average_comp_price, 0) > 0
           THEN (COALESCE(ui.last_comp_price, 0) - COALESCE(ui.average_comp_price, 0)) / ui.average_comp_price
         ELSE 0
       END AS market_trend,
       (
         SELECT COUNT(*) FROM user_items dupe
         WHERE dupe.id != ui.id
           AND COALESCE(dupe.player_name, dupe.name) = COALESCE(ui.player_name, ui.name)
           AND COALESCE(dupe.card_set, '') = COALESCE(ui.card_set, '')
           AND COALESCE(dupe.card_number, '') = COALESCE(ui.card_number, '')
       ) AS duplicate_count
     FROM aging_inventory_view a
     JOIN user_items ui ON ui.id = a.item_id
     WHERE a.age_days >= 30`,
  );

  const actions = [];
  for (const item of items) {
    const suggestion = suggestionForItem(item);
    if (!suggestion) continue;

    const basePrice = Number(item.suggested_listing_price || item.last_comp_price || item.market_price || 0);
    const recommendedPrice = suggestion.priceMultiplier === 1
      ? basePrice
      : Number((basePrice * suggestion.priceMultiplier).toFixed(2));
    const reason = `${item.name} is ${item.age_days} days old${Number(item.duplicate_count || 0) > 0 ? " with duplicate inventory" : ""}.`;

    ensureAlert(
      item.item_id,
      suggestion.recommendation === "liquidate" ? "dead_inventory" : "repricing",
      reason,
      suggestion.action,
    );

    if (autoApply && recommendedPrice > 0) {
      run(
        `UPDATE user_items
         SET suggested_listing_price = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [recommendedPrice, item.item_id],
      );
      run(
        `UPDATE listings
         SET start_price = CASE WHEN status IN ('draft', 'ready', 'active') THEN ? ELSE start_price END,
             buy_now_price = CASE WHEN format = 'fixed' AND status IN ('draft', 'ready', 'active') THEN ? ELSE buy_now_price END
         WHERE card_id = ? AND status IN ('draft', 'ready', 'active')`,
        [recommendedPrice, recommendedPrice, item.item_id],
      );
    }

    actions.push({
      itemId: item.item_id,
      name: item.name,
      recommendation: suggestion.recommendation,
      suggestedAction: suggestion.action,
      recommendedPrice,
      autoApplied: autoApply,
    });
  }

  return actions;
}
