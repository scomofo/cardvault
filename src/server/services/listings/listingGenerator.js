import { all, get, run } from "../../database.js";
import { uid } from "../../routes/shared.js";
import { buildListingTitle } from "./titleBuilder.js";
import { buildListingDescription } from "./descriptionBuilder.js";
import { buildItemSpecifics } from "./itemSpecificsBuilder.js";

function getLatestRecommendation(itemId) {
  return get(
    `SELECT * FROM pricing_recommendations WHERE item_id = ? ORDER BY created_at DESC LIMIT 1`,
    [itemId],
  );
}

function determinePrice(item, strategy) {
  const recommendation = all(
    `SELECT * FROM pricing_recommendations WHERE item_id = ? ORDER BY created_at DESC`,
    [item.id],
  ).find((row) => row.strategy === strategy) || getLatestRecommendation(item.id);

  if (recommendation?.recommended_price_cents) {
    return Number((recommendation.recommended_price_cents / 100).toFixed(2));
  }

  return (
    item.suggested_listing_price ||
    item.market_price ||
    item.last_comp_price ||
    item.cost_basis * 1.5 ||
    0.99
  );
}

export function generateListingDrafts({
  itemIds,
  platform = "ebay",
  pricingStrategy = "market",
  format = "fixed",
}) {
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    throw new Error("itemIds required");
  }

  const batchId = uid();
  run(
    `INSERT INTO listing_batches (id, platform, status, pricing_strategy, item_count, export_format)
     VALUES (?,?,?,?,?,?)`,
    [batchId, platform, "draft", pricingStrategy, itemIds.length, "csv"],
  );

  const drafts = [];

  for (const itemId of itemIds) {
    const item = get("SELECT * FROM user_items WHERE id = ?", [itemId]);
    if (!item) continue;
    if (item.sale_status === "sold") continue;

    const title = buildListingTitle(item);
    const description = buildListingDescription(item);
    const itemSpecifics = buildItemSpecifics(item);
    const listingId = uid();
    const price = determinePrice(item, pricingStrategy);

    run(
      `INSERT INTO listings
       (id, card_id, card_name, card_set, card_number, platform, listing_title,
        listing_description, category_path, item_specifics, pricing_strategy,
        format, start_price, buy_now_price, shipping, shipping_weight_oz,
        export_batch_id, status, publish_status, quantity, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`,
      [
        listingId,
        item.id,
        item.player_name || item.name,
        item.card_set,
        item.card_number,
        platform,
        title,
        description,
        "Sports Mem, Cards & Fan Shop > Sports Trading Cards > Trading Card Singles",
        JSON.stringify(itemSpecifics),
        pricingStrategy,
        format,
        price,
        format === "fixed" ? price : null,
        4.99,
        3,
        batchId,
        "draft",
        "draft",
        1,
      ],
    );

    run(
      `UPDATE user_items
       SET status = CASE WHEN status = 'inventory' THEN 'listed' ELSE status END,
           listing_status = 'draft',
           suggested_listing_price = COALESCE(NULLIF(suggested_listing_price, 0), ?),
           updated_at = datetime('now')
       WHERE id = ?`,
      [price, item.id],
    );

    drafts.push(get("SELECT * FROM listings WHERE id = ?", [listingId]));
  }

  return { batchId, drafts };
}
