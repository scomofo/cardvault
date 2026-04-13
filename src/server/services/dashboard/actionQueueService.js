import { all } from "../../database.js";

function score({ base = 0, marketPrice = 0, ageDays = 0, urgency = 0, blockedCash = 0, risk = 0, marketMovement = 0, profitOpportunity = 0 }) {
  return Math.round(base + marketPrice + ageDays + urgency + blockedCash + risk + marketMovement + profitOpportunity);
}

/**
 * Build a prioritized action queue from orders, listings, pricing, and grading state.
 * @returns {{ queue: string, subjectType: string, subjectId: string, reason: string, priorityScore: number }[]}
 */
export function getActionQueue() {
  const queue = [];

  for (const order of all(`SELECT id, sale_price, platform FROM orders WHERE fulfillment_status IN ('pending', 'paid')`)) {
    queue.push({
      queue: "ship_now",
      item: order.id,
      reason: `Order from ${order.platform} is awaiting fulfillment`,
      suggestedAction: "create_shipment",
      priorityScore: score({ base: 200, marketPrice: Number(order.sale_price || 0), urgency: 50 }),
      subjectType: "order",
      subjectId: order.id,
    });
  }

  for (const item of all(`SELECT id, name, market_price FROM user_items WHERE sale_status != 'sold' AND (listing_status IS NULL OR listing_status IN ('not_listed', 'draft')) ORDER BY market_price DESC LIMIT 25`)) {
    queue.push({
      queue: "list_now",
      item: item.name,
      reason: "Inventory is not live yet",
      suggestedAction: "create_listing",
      priorityScore: score({ base: 120, marketPrice: Number(item.market_price || 0), blockedCash: 20 }),
      subjectType: "inventory_item",
      subjectId: item.id,
    });
  }

  for (const item of all(`SELECT item_id, name, age_days, market_price FROM aging_inventory_view WHERE age_days >= 30 ORDER BY age_days DESC LIMIT 25`)) {
    const marketMovement = Number(item.market_price || 0) > 0 ? 10 : 0;
    queue.push({
      queue: "reprice_now",
      item: item.name,
      reason: `${item.age_days} days in inventory`,
      suggestedAction: "revise_listing_price",
      priorityScore: score({ base: 90, marketPrice: Number(item.market_price || 0), ageDays: item.age_days, risk: 15, marketMovement }),
      subjectType: "inventory_item",
      subjectId: item.item_id,
    });
  }

  for (const item of all(`SELECT id, name, market_price, projected_grade, psa10_price FROM user_items WHERE grading_candidate = 1 OR (psa10_price > market_price + 40 AND projected_grade >= 9) ORDER BY market_price DESC LIMIT 25`)) {
    queue.push({
      queue: "grade_now",
      item: item.name,
      reason: "Grade upside appears meaningful",
      suggestedAction: "move_to_grading_queue",
      priorityScore: score({ base: 80, marketPrice: Number(item.market_price || 0), blockedCash: 10 }),
      subjectType: "inventory_item",
      subjectId: item.id,
    });
  }

  for (const item of all(`SELECT item_id, name, age_days, market_price FROM aging_inventory_view WHERE age_days >= 180 ORDER BY age_days DESC LIMIT 25`)) {
    queue.push({
      queue: "dead_inventory",
      item: item.name,
      reason: `Dead inventory risk after ${item.age_days} days`,
      suggestedAction: "mark_clearance",
      priorityScore: score({ base: 70, marketPrice: Number(item.market_price || 0), ageDays: item.age_days, risk: 25, blockedCash: Number(item.market_price || 0) * 0.2 }),
      subjectType: "inventory_item",
      subjectId: item.item_id,
    });
  }

  for (const item of all(`SELECT item_id, name, age_days, market_price FROM aging_inventory_view WHERE age_days >= 120 AND market_price < 15 ORDER BY age_days DESC LIMIT 25`)) {
    queue.push({
      queue: "bundle_low_value",
      item: item.name,
      reason: `Low-value card has been sitting ${item.age_days} days`,
      suggestedAction: "add_to_bundle_queue",
      priorityScore: score({ base: 65, marketPrice: Number(item.market_price || 0), ageDays: item.age_days, blockedCash: 15 }),
      subjectType: "inventory_item",
      subjectId: item.item_id,
    });
  }

  for (const item of all(`SELECT id, name, market_price FROM user_items WHERE sale_status != 'sold' AND (listing_status IS NULL OR listing_status IN ('not_listed', 'draft')) AND market_price >= 100 ORDER BY market_price DESC LIMIT 25`)) {
    queue.push({
      queue: "high_value_unlisted",
      item: item.name,
      reason: "High-value inventory is not monetizing yet",
      suggestedAction: "create_listing",
      priorityScore: score({ base: 110, marketPrice: Number(item.market_price || 0), blockedCash: 30 }),
      subjectType: "inventory_item",
      subjectId: item.id,
    });
  }

  for (const order of all(`SELECT id, sale_price, platform FROM orders WHERE payment_status = 'awaiting_payment' ORDER BY sold_at ASC LIMIT 25`)) {
    queue.push({
      queue: "orders_awaiting_payment",
      item: order.id,
      reason: `Awaiting payment from ${order.platform}`,
      suggestedAction: "review_order",
      priorityScore: score({ base: 60, marketPrice: Number(order.sale_price || 0), urgency: 20 }),
      subjectType: "order",
      subjectId: order.id,
    });
  }

  for (const alert of all(`SELECT id, item_id, alert_type, severity, suggested_action FROM market_alerts WHERE status = 'open' ORDER BY created_at DESC LIMIT 25`)) {
    queue.push({
      queue: "review_alerts",
      item: alert.item_id,
      reason: alert.alert_type,
      suggestedAction: alert.suggested_action || "review_alert",
      priorityScore: score({ base: alert.severity === "high" ? 95 : 55 }),
      subjectType: "inventory_item",
      subjectId: alert.item_id,
    });
  }

  return queue.sort((a, b) => b.priorityScore - a.priorityScore);
}
