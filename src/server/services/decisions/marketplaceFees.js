import { get } from "../../database.js";

/**
 * Marketplace fee model.
 * Defaults reflect rough 2026 public fee schedules — override via settings
 * if you have a negotiated rate. Fee rates are expressed as decimal fractions
 * of the sale price. `flatFee` is added on top in dollars.
 */
const DEFAULT_FEES = {
  ebay:    { rate: 0.1335, flatFee: 0.40 }, // Trading card final value fee ~13.35% + $0.40 per order
  tcgplayer: { rate: 0.1025, flatFee: 0 },
  mercari: { rate: 0.10,   flatFee: 0 },
  shopify: { rate: 0.029,  flatFee: 0.30 }, // payment processing only
  comc:    { rate: 0.20,   flatFee: 0 },    // includes port + sale fees (approx)
  consignment: { rate: 0.20, flatFee: 0 },  // high-end broker default
  local:   { rate: 0,      flatFee: 0 },    // cash sale — no marketplace fee
};

function normalizeKey(marketplaceKey) {
  return typeof marketplaceKey === "string" ? marketplaceKey.trim().toLowerCase() : "";
}

/**
 * Look up a negotiated rate stored by `PUT /api/fee-models/:platform`.
 * Matching is case-insensitive because the route stores the platform verbatim
 * while callers here pass lowercase channel keys.
 * Returns null when the DB is unavailable (pure unit tests call the fee model
 * with no database initialized) or when no usable row exists.
 * @param {string} platform normalized platform key
 * @returns {number|null}
 */
function storedFeeRate(platform) {
  let row;
  try {
    row = get("SELECT fee_rate FROM fee_models WHERE LOWER(platform) = ?", [platform]);
  } catch {
    return null;
  }
  if (!row) return null;
  const rate = Number(row.fee_rate);
  // The route validates 0..1 on write; re-check on read so a hand-edited row
  // can't push a nonsense rate into every routing decision.
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) return null;
  return rate;
}

/**
 * Resolve the effective fee for a marketplace. A negotiated rate stored in
 * `fee_models` wins over the default schedule; the flat fee stays at the
 * default because `fee_models` only models a percentage rate. A stored rate
 * also makes a platform priceable that has no default entry.
 * Returns null when the marketplace is unknown and has no stored rate.
 * @param {string} marketplaceKey
 * @returns {{ rate: number, flatFee: number, source: "negotiated"|"default" }|null}
 */
export function getMarketplaceFee(marketplaceKey) {
  const platform = normalizeKey(marketplaceKey);
  if (!platform) return null;

  const base = DEFAULT_FEES[platform];
  const negotiated = storedFeeRate(platform);
  if (negotiated == null) {
    return base ? { rate: base.rate, flatFee: base.flatFee, source: "default" } : null;
  }
  return { rate: negotiated, flatFee: base?.flatFee ?? 0, source: "negotiated" };
}

function resolveMarketplaceKey(recommendation) {
  switch (recommendation) {
    case "sell_on_ebay":         return "ebay";
    case "store_inventory_shopify": return "shopify";
    case "send_to_comc":         return "comc";
    case "consign_high_end":     return "consignment";
    case "keep_local_only":      return "local";
    case "crosspost":            return "ebay"; // primary channel for crossposted listings
    default:                     return null;
  }
}

/**
 * Compute the expected net proceeds for a given sale price and marketplace.
 * Uses the negotiated rate from `fee_models` when one is configured.
 * Returns null if the marketplace is unknown — callers should fall back to the raw price.
 * @param {number} salePrice
 * @param {string} marketplaceKey one of DEFAULT_FEES keys, or a configured fee_models platform
 * @param {number} shippingCost charged to buyer but passed through to carrier
 * @returns {number|null}
 */
export function computeExpectedNet(salePrice, marketplaceKey, shippingCost = 0) {
  const fee = getMarketplaceFee(marketplaceKey);
  if (!fee || !Number.isFinite(salePrice) || salePrice <= 0) return null;
  const feeAmount = salePrice * fee.rate + fee.flatFee;
  return Number((salePrice - feeAmount - shippingCost).toFixed(2));
}

/**
 * Resolve the marketplace key from a marketplaceDecision recommendation.
 * @param {string} recommendation
 * @returns {string|null}
 */
export function marketplaceKeyFromRecommendation(recommendation) {
  return resolveMarketplaceKey(recommendation);
}

export const MARKETPLACE_FEE_TABLE = DEFAULT_FEES;
