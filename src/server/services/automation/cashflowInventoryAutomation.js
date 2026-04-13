import { all, get } from "../../database.js";

/**
 * Analyze inventory for cashflow optimization.
 * @returns {{ staleItems: object[], recommendations: object[] }}
 */
export function runCashflowInventoryAutomation() {
  const metrics = get(
    `SELECT
       COALESCE(SUM(CASE WHEN sale_status != 'sold' THEN market_price ELSE 0 END), 0) AS inventory_value,
       COALESCE(SUM(CASE WHEN sale_status != 'sold' THEN cost_basis ELSE 0 END), 0) AS cost_basis_tied_up,
       COALESCE(AVG(CASE WHEN sale_status = 'sold' AND sold_at IS NOT NULL
         THEN julianday(sold_at) - julianday(COALESCE(acquisition_date, created_at)) END), 0) AS inventory_turnover,
       COALESCE(SUM(CASE WHEN sale_status != 'sold' AND market_price >= 100 AND (listing_status IS NULL OR listing_status IN ('not_listed', 'draft')) THEN 1 ELSE 0 END), 0) AS high_value_unlisted,
       COALESCE(SUM(CASE WHEN sale_status != 'sold' AND id IN (SELECT item_id FROM aging_inventory_view WHERE age_days >= 180) THEN 1 ELSE 0 END), 0) AS dead_inventory
     FROM user_items`,
  );

  const roiByCategory = all(
    `SELECT card_set AS label,
            ROUND(AVG(CASE WHEN cost_basis > 0 THEN (profit_realized / cost_basis) * 100 END), 2) AS value
     FROM user_items
     WHERE card_set IS NOT NULL
     GROUP BY card_set
     ORDER BY value DESC
     LIMIT 10`,
  );

  const roiBySource = all(
    `SELECT COALESCE(acquisition_source, 'Unknown') AS label,
            ROUND(AVG(CASE WHEN cost_basis > 0 THEN (profit_realized / cost_basis) * 100 END), 2) AS value
     FROM user_items
     GROUP BY COALESCE(acquisition_source, 'Unknown')
     ORDER BY value DESC`,
  );

  const recommendations = [];
  if (metrics.high_value_unlisted > 0) recommendations.push("List high value unlisted inventory");
  if (metrics.dead_inventory > 0) recommendations.push("Liquidate dead inventory and bundle low-value stragglers");
  if (roiBySource.some((row) => Number(row.value || 0) < 0)) recommendations.push("Stop buying from low ROI sources");
  if (roiByCategory.some((row) => Number(row.value || 0) > 25)) recommendations.push("Buy more high ROI categories");

  return {
    cashTiedUp: Number(metrics.cost_basis_tied_up || 0),
    inventoryValue: Number(metrics.inventory_value || 0),
    inventoryTurnoverDays: Number(metrics.inventory_turnover || 0),
    highValueUnlisted: Number(metrics.high_value_unlisted || 0),
    deadInventory: Number(metrics.dead_inventory || 0),
    roiByCategory,
    roiBySource,
    recommendations,
  };
}
