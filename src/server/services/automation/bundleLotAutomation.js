import { all } from "../../database.js";

function bundleKey(item) {
  return item.player_name || item.team || item.card_set || "misc";
}

export function runBundleLotAutomation() {
  const candidates = all(
    `SELECT
       a.item_id,
       ui.name,
       ui.player_name,
       ui.team,
       ui.card_set,
       ui.year,
       ui.market_price,
       a.age_days
     FROM aging_inventory_view a
     JOIN user_items ui ON ui.id = a.item_id
     WHERE ui.sale_status != 'sold'
       AND (ui.market_price <= 15 OR a.age_days >= 120)`,
  );

  const groups = new Map();
  for (const item of candidates) {
    const key = bundleKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const bundles = [];
  for (const [key, items] of groups.entries()) {
    if (items.length < 2) continue;
    const total = items.reduce((sum, item) => sum + Number(item.market_price || 0), 0);
    const oldestAge = Math.max(...items.map((item) => Number(item.age_days || 0)));
    bundles.push({
      bundleKey: key,
      bundleType: items.every((item) => item.player_name === items[0].player_name)
        ? "player_lot"
        : items.every((item) => item.card_set === items[0].card_set)
          ? "set_lot"
          : "clearance_lot",
      suggestedBundlePrice: Number((total * 0.82).toFixed(2)),
      itemCount: items.length,
      oldestAge,
      inventoryList: items.map((item) => item.item_id),
    });
  }

  return bundles.sort((a, b) => b.oldestAge - a.oldestAge || b.itemCount - a.itemCount);
}
