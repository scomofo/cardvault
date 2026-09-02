import { searchBrowse } from "../../integrations/ebay/ebayBrowse.js";
import { dollarsToCents, normalizePricingPayload } from "./pricingMapper.js";

/**
 * IMPORTANT CAVEAT
 * ----------------
 * This adapter sources pricing from eBay Browse item_summary/search, which
 * returns ACTIVE listings — asking prices, not realized sales. Active
 * listings skew high vs what cards actually sell for, because they include
 * unsold asks, delusional pricing, and listings that will never move.
 *
 * Downstream consumers that treat `price_snapshots` rows as sold comps
 * (e.g. pricing recommendations, repricing automation) will produce
 * optimistic/overpriced output when fed this source. The distinction is
 * encoded in the `source` field as `"ebay-browse-active"` so those callers
 * can filter or discount this data if/when they become source-aware.
 *
 * Today nothing filters by source, so the pricing recommender will happily
 * treat these numbers as comps. That's known technical debt, not a bug —
 * it's preferable to stop feeding the simulation into the recommender.
 */

function buildQuery(item) {
  const parts = [
    item?.year,
    item?.card_set || item?.set,
    item?.player_name || item?.name,
    item?.card_number ? `#${item.card_number}` : null,
    item?.parallel || null,
  ]
    .map((part) => (part == null ? "" : String(part).trim()))
    .filter(Boolean);
  return parts.join(" ");
}

function summarizePrices(items) {
  const prices = items
    .map((entry) => Number(entry?.price))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (prices.length === 0) return null;
  const low = prices[0];
  const high = prices[prices.length - 1];
  const average = prices.reduce((sum, value) => sum + value, 0) / prices.length;
  const median = prices.length % 2 === 0
    ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
    : prices[Math.floor(prices.length / 2)];
  return { low, high, average, median, prices };
}

/**
 * Fetch an active-listing pricing snapshot from eBay Browse.
 *
 * `search` is injectable for unit tests. On any failure (missing creds,
 * network, timeout, empty response) returns `null` so the pricing service
 * can fall back to another source rather than crash the pipeline.
 *
 * @param {object} item user_items row (or equivalent lookup shape)
 * @param {{ search?: typeof searchBrowse, limit?: number }} [options]
 * @returns {Promise<object|null>} normalized pricing payload or null
 */
export async function fetchEbayBrowsePrice(item, { search = searchBrowse, limit = 15 } = {}) {
  const query = buildQuery(item);
  if (!query) return null;

  let results;
  try {
    results = await search(query, { limit });
  } catch {
    return null;
  }
  if (!results || !Array.isArray(results.items) || results.items.length === 0) return null;

  const summary = summarizePrices(results.items);
  if (!summary) return null;

  return normalizePricingPayload({
    source: "ebay-browse-active",
    catalogCardId: item?.catalog_card_id || null,
    observedAt: new Date().toISOString(),
    conditionBucket: "raw",
    marketPriceCents: dollarsToCents(summary.median),
    averagePriceCents: dollarsToCents(summary.average),
    lowPriceCents: dollarsToCents(summary.low),
    highPriceCents: dollarsToCents(summary.high),
    lastCompPriceCents: dollarsToCents(summary.median),
    sampleSize: summary.prices.length,
    comps: results.items
      .filter((entry) => Number(entry?.price) > 0)
      .map((entry) => ({
        compDate: null,
        compPriceCents: dollarsToCents(entry.price),
        title: entry.title || null,
        url: entry.url || null,
        grade: null,
        conditionBucket: "raw-active",
      })),
    // The Browse call is scoped to EBAY_CA, so results should already be
    // CAD; recorded here rather than trusted blindly, since price_snapshots
    // has no currency column of its own to convert against.
    rawPayload: {
      query,
      total: results.total,
      itemCount: results.items.length,
      currencies: [...new Set(results.items.map((entry) => entry.currency).filter(Boolean))],
    },
  });
}
