export function routeReview(result, item) {
  if (result.recommendation === "auto_accept_match") return { queue: "accepted", severity: "low" };
  if (result.recommendation === "requires_back_scan") return { queue: "back_scan", severity: "medium" };
  if (result.recommendation === "unresolved") return { queue: "unresolved", severity: "high" };
  return {
    queue: Number(item.market_price || item.suggested_listing_price || 0) >= 100 ? "review_high_value" : "review",
    severity: Number(item.market_price || 0) >= 100 ? "high" : "medium",
  };
}
