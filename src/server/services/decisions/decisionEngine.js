import { all, get } from "../../database.js";
import { decisionRegistry } from "./decisionRegistry.js";
import { saveDecisions } from "./decisionStore.js";

function getAgeDays(item) {
  if (!item) return 0;
  const anchor = item.acquisition_date || item.created_at;
  if (!anchor) return 0;
  const diff = Date.now() - new Date(anchor).getTime();
  return Math.max(Math.floor(diff / 86400000), 0);
}

function getPriorityScore(context) {
  if (context.subjectType === "order") {
    return 100 + Number(context.order?.sale_price || 0);
  }

  const marketPrice = Number(context.item?.market_price || 0);
  const ageDays = context.ageDays || 0;
  const listedPenalty = context.item?.listing_status === "listed" ? 10 : 0;
  return Math.round(marketPrice + ageDays - listedPenalty);
}

function buildContext(subjectType, subjectId) {
  if (subjectType === "inventory_item") {
    const item = get("SELECT * FROM user_items WHERE id = ?", [subjectId]);
    if (!item) throw new Error("Inventory item not found");
    const latestPriceSnapshot = get(
      `SELECT * FROM price_snapshots WHERE item_id = ? ORDER BY observed_at DESC, created_at DESC LIMIT 1`,
      [subjectId],
    );
    const latestListing = get(
      `SELECT * FROM listings WHERE card_id = ? ORDER BY created_at DESC LIMIT 1`,
      [subjectId],
    );
    const duplicateCountRow = get(
      `SELECT COUNT(*) AS count
       FROM user_items
       WHERE id != ?
         AND COALESCE(player_name, name) = COALESCE(?, COALESCE(player_name, name))
         AND COALESCE(card_set, '') = COALESCE(?, '')
         AND COALESCE(card_number, '') = COALESCE(?, '')`,
      [subjectId, item.player_name || item.name || null, item.card_set || "", item.card_number || ""],
    );
    const marketTrend = latestPriceSnapshot
      ? Number(latestPriceSnapshot.high_price_cents || 0) > 0
        ? (Number(latestPriceSnapshot.last_comp_price_cents || 0) - Number(latestPriceSnapshot.average_price_cents || 0)) /
          Math.max(Number(latestPriceSnapshot.average_price_cents || 1), 1)
        : 0
      : 0;
    const context = {
      subjectType,
      subjectId,
      item,
      latestPriceSnapshot,
      latestListing,
      ageDays: getAgeDays(item),
      duplicateCount: duplicateCountRow?.count || 0,
      marketTrend,
    };
    context.priorityScore = getPriorityScore(context);
    return context;
  }

  if (subjectType === "order") {
    const order = get("SELECT * FROM orders WHERE id = ?", [subjectId]);
    if (!order) throw new Error("Order not found");
    const context = { subjectType, subjectId, order, priorityScore: getPriorityScore({ subjectType, order }) };
    return context;
  }

  if (subjectType === "purchase") {
    const purchase = get("SELECT * FROM purchases WHERE id = ?", [subjectId]);
    if (!purchase) throw new Error("Purchase not found");
    return { subjectType, subjectId, purchase, priorityScore: 25 };
  }

  throw new Error(`Unsupported subject_type ${subjectType}`);
}

export function evaluateSubject(subjectType, subjectId, { persist = true } = {}) {
  const context = buildContext(subjectType, subjectId);
  const decisions = [];
  for (const rule of decisionRegistry) {
    const decision = rule(context);
    if (!decision) continue;
    decisions.push(decision);
    if (decision.decisionType === "selling_strategy_decision") {
      context.strategyDecision = decision;
    }
  }

  return persist ? saveDecisions(decisions) : decisions;
}

export function buildActionQueue() {
  const actions = [];

  const staleInventory = all(
    `SELECT item_id, name, age_days, market_price FROM aging_inventory_view WHERE age_days >= 30 ORDER BY age_days DESC LIMIT 25`,
  );
  for (const item of staleInventory) {
    actions.push({
      queue: "reprice_now",
      subjectType: "inventory_item",
      subjectId: item.item_id,
      priorityScore: Number(item.market_price || 0) + item.age_days,
      label: `${item.name} is ${item.age_days} days old`,
    });
  }

  const unshippedOrders = all(
    `SELECT id, platform, sale_price FROM orders WHERE fulfillment_status IN ('pending', 'paid') ORDER BY sold_at ASC LIMIT 25`,
  );
  for (const order of unshippedOrders) {
    actions.push({
      queue: "ship_now",
      subjectType: "order",
      subjectId: order.id,
      priorityScore: 100 + Number(order.sale_price || 0),
      label: `Order ${order.id.slice(0, 8)} is waiting to ship`,
    });
  }

  const unlisted = all(
    `SELECT id, name, market_price FROM user_items WHERE sale_status != 'sold' AND (listing_status IS NULL OR listing_status IN ('not_listed', 'draft')) ORDER BY market_price DESC LIMIT 25`,
  );
  for (const item of unlisted) {
    actions.push({
      queue: "list_now",
      subjectType: "inventory_item",
      subjectId: item.id,
      priorityScore: Number(item.market_price || 0) + 50,
      label: `${item.name} is not live yet`,
    });
  }

  return actions.sort((a, b) => b.priorityScore - a.priorityScore);
}
