import { all } from "../../database.js";

export function getPerformancePanels() {
  return {
    topProfitPlayers: all(
      `SELECT COALESCE(player_name, name) AS label, ROUND(SUM(profit_realized), 2) AS value
       FROM user_items
       WHERE sale_status = 'sold'
       GROUP BY COALESCE(player_name, name)
       ORDER BY value DESC
       LIMIT 5`,
    ),
    topProfitSets: all(
      `SELECT card_set AS label, ROUND(SUM(profit_realized), 2) AS value
       FROM user_items
       WHERE sale_status = 'sold' AND card_set IS NOT NULL
       GROUP BY card_set
       ORDER BY value DESC
       LIMIT 5`,
    ),
    bestMarketplaces: all(
      `SELECT platform AS label, ROUND(AVG(net_profit), 2) AS value
       FROM sales
       WHERE platform IS NOT NULL
       GROUP BY platform
       ORDER BY value DESC
       LIMIT 5`,
    ),
    worstMarketplaces: all(
      `SELECT platform AS label, ROUND(AVG(net_profit), 2) AS value
       FROM sales
       WHERE platform IS NOT NULL
       GROUP BY platform
       ORDER BY value ASC
       LIMIT 5`,
    ),
    fastestSellingInventory: all(
      `SELECT name AS label,
              CAST(julianday(sold_at) - julianday(COALESCE(acquisition_date, created_at)) AS INTEGER) AS value
       FROM user_items
       WHERE sale_status = 'sold' AND sold_at IS NOT NULL
       ORDER BY value ASC
       LIMIT 5`,
    ),
    slowestSellingInventory: all(
      `SELECT name AS label,
              age_days AS value
       FROM aging_inventory_view
       ORDER BY age_days DESC
       LIMIT 5`,
    ),
    highestRoiAcquisitions: all(
      `SELECT name AS label, roi_percent AS value
       FROM inventory_profit_view
       WHERE roi_percent IS NOT NULL
       ORDER BY roi_percent DESC
       LIMIT 5`,
    ),
    roiBySource: all(
      `SELECT COALESCE(acquisition_source, 'Unknown') AS label,
              ROUND(AVG(CASE WHEN cost_basis > 0 THEN (profit_realized / cost_basis) * 100 END), 2) AS value
       FROM user_items
       GROUP BY COALESCE(acquisition_source, 'Unknown')
       ORDER BY value DESC
       LIMIT 5`,
    ),
    roiByCategory: all(
      `SELECT card_set AS label,
              ROUND(AVG(CASE WHEN cost_basis > 0 THEN (profit_realized / cost_basis) * 100 END), 2) AS value
       FROM user_items
       WHERE card_set IS NOT NULL
       GROUP BY card_set
       ORDER BY value DESC
       LIMIT 5`,
    ),
  };
}
