import { all, get } from "../../database.js";

function buildGroupKey(item) {
  return [
    item.player_name || item.name || "",
    item.card_set || "",
    item.card_number || "",
    item.parallel || "",
  ].join("|");
}

/**
 * Detect duplicate items in inventory.
 * @param {{ itemId?: string|null }} [options]
 * @returns {object[]}
 */
export function detectDuplicateInventory({ itemId = null } = {}) {
  const items = itemId
    ? all(`SELECT * FROM user_items WHERE id = ? OR id IN (
        SELECT id FROM user_items
      )`, [itemId])
    : all(`SELECT * FROM user_items WHERE sale_status != 'sold'`);

  const grouped = new Map();
  for (const item of items) {
    const key = buildGroupKey(item);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }

  const duplicates = [];
  for (const [key, group] of grouped.entries()) {
    if (group.length < 2) continue;
    const sortedByPrice = [...group].sort((a, b) => Number(a.suggested_listing_price || a.market_price || 0) - Number(b.suggested_listing_price || b.market_price || 0));
    duplicates.push({
      key,
      count: group.length,
      items: group.map((item) => ({
        id: item.id,
        name: item.name,
        set: item.card_set,
        number: item.card_number,
        parallel: item.parallel,
        suggestedPrice: Number(item.suggested_listing_price || item.market_price || 0),
      })),
      suggestedAction: group.length >= 3 ? "bundle_duplicates" : "price_ladder",
      priceLadder: sortedByPrice.map((item, index) => ({
        itemId: item.id,
        price: Number((Number(item.suggested_listing_price || item.market_price || 0) - index * 1.5).toFixed(2)),
      })),
    });
  }

  return duplicates;
}
