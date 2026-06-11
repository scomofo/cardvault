const BULK_LOT_THRESHOLD = 0.5;
const NOT_WORTH_NET_THRESHOLD = 2.0;
const REVIEW_NET_THRESHOLD = 5.0;

export function classifyListingViability({ mid, net, floor } = {}) {
  const marketPrice = parseFloat(mid) || 0;
  if (!marketPrice) return null;

  const netProceeds = Number.isFinite(Number(net)) ? Number(net) : 0;
  const floorPrice = parseFloat(floor) || 0;

  if (marketPrice < BULK_LOT_THRESHOLD) return "bulk_lot";
  if (floorPrice > 0 && marketPrice < floorPrice) return "not_worth_listing";
  if (netProceeds < NOT_WORTH_NET_THRESHOLD) return "not_worth_listing";
  if (netProceeds < REVIEW_NET_THRESHOLD) return "review";
  return "viable";
}
