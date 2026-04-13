import { get } from "../../database.js";

/**
 * Calculate key performance indicators for the seller dashboard.
 * @returns {object}
 */
export function getKpis() {
  const inventory = get(
    `SELECT
       COALESCE(SUM(CASE WHEN sale_status != 'sold' THEN market_price ELSE 0 END), 0) AS total_inventory_value,
       COALESCE(SUM(CASE WHEN listing_status IN ('listed', 'active') THEN market_price ELSE 0 END), 0) AS listed_inventory_value,
       COALESCE(SUM(CASE WHEN sale_status != 'sold' AND (listing_status IS NULL OR listing_status IN ('not_listed', 'draft')) THEN 1 ELSE 0 END), 0) AS unlisted_inventory_count,
       COALESCE(SUM(CASE WHEN sale_status != 'sold' THEN cost_basis ELSE 0 END), 0) AS cash_tied_up,
       COALESCE(SUM(CASE WHEN grading_candidate = 1 THEN 1 ELSE 0 END), 0) AS grading_candidates
     FROM user_items`,
  );

  const shipping = get(
    `SELECT
       COALESCE(SUM(CASE WHEN fulfillment_status IN ('pending', 'paid') THEN 1 ELSE 0 END), 0) AS orders_to_ship,
       COALESCE(SUM(CASE WHEN payment_status = 'awaiting_payment' THEN 1 ELSE 0 END), 0) AS orders_awaiting_payment
     FROM orders`,
  );

  const monthly = get(
    `SELECT
       COALESCE(SUM(sale_price), 0) AS monthly_sales,
       COALESCE(SUM(net_profit), 0) AS monthly_profit
     FROM sales
     WHERE date >= datetime('now', 'start of month')`,
  );

  const aging = get(
    `SELECT
       COALESCE(SUM(CASE WHEN age_days >= 90 THEN 1 ELSE 0 END), 0) AS stale_inventory_count,
       COALESCE(SUM(CASE WHEN age_days >= 180 THEN 1 ELSE 0 END), 0) AS dead_inventory_count
     FROM aging_inventory_view`,
  );

  const acquisitions = get(
    `SELECT COALESCE(SUM(total_cost), 0) AS acquisition_spend
     FROM purchases
     WHERE date >= date('now', 'start of month')`,
  );

  const turnover = get(
    `SELECT COALESCE(AVG(julianday(sold_at) - julianday(COALESCE(acquisition_date, created_at))), 0) AS turnover_days
     FROM user_items
     WHERE sale_status = 'sold' AND sold_at IS NOT NULL`,
  );

  const consignment = get(
    `SELECT COALESCE(SUM(CASE WHEN recommendation = 'consign_high_end' AND status = 'open' THEN 1 ELSE 0 END), 0) AS consignment_liability
     FROM decisions
     WHERE decision_type = 'marketplace_routing_decision'`,
  );

  return {
    totalInventoryValue: inventory.total_inventory_value,
    listedInventoryValue: inventory.listed_inventory_value,
    unlistedInventoryCount: inventory.unlisted_inventory_count,
    cashTiedUp: inventory.cash_tied_up,
    ordersToShip: shipping.orders_to_ship,
    ordersAwaitingPayment: shipping.orders_awaiting_payment,
    monthlyProfit: monthly.monthly_profit,
    monthlySales: monthly.monthly_sales,
    staleInventoryCount: aging.stale_inventory_count,
    deadInventoryCount: aging.dead_inventory_count,
    gradingCandidates: inventory.grading_candidates,
    acquisitionSpend: acquisitions.acquisition_spend,
    consignmentLiability: consignment.consignment_liability,
    inventoryTurnoverDays: turnover.turnover_days,
  };
}
