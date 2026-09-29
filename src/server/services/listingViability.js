const BULK_LOT_THRESHOLD = 0.5;
const NOT_WORTH_NET_THRESHOLD = 2.0;
const REVIEW_NET_THRESHOLD = 5.0;

/**
 * Pure function — classify whether a card is worth listing individually.
 * Returns: "viable" | "review" | "not_worth_listing" | "bulk_lot" | null (no data)
 */
export function classifyListingViability({ mid, net, floor } = {}) {
  const m = parseFloat(mid) || 0;
  if (!m) return null;
  const n = typeof net === "number" ? net : parseFloat(net) ?? 0;
  const f = parseFloat(floor) || 0;
  if (m < BULK_LOT_THRESHOLD) return "bulk_lot";
  if (f > 0 && m < f) return "not_worth_listing";
  if (n < NOT_WORTH_NET_THRESHOLD) return "not_worth_listing";
  if (n < REVIEW_NET_THRESHOLD) return "review";
  return "viable";
}
