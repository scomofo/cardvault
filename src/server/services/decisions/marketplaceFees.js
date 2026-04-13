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
 * Returns null if the marketplace is unknown — callers should fall back to the raw price.
 * @param {number} salePrice
 * @param {string} marketplaceKey one of DEFAULT_FEES keys
 * @param {number} shippingCost charged to buyer but passed through to carrier
 * @returns {number|null}
 */
export function computeExpectedNet(salePrice, marketplaceKey, shippingCost = 0) {
  const fee = DEFAULT_FEES[marketplaceKey];
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
