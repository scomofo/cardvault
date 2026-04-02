import { DECISION_TYPES } from "./decisionTypes.js";
import { action } from "./explanationBuilder.js";

export function marketplaceDecision(context) {
  if (context.subjectType !== "inventory_item" || !context.item) return null;

  const marketPrice = Number(context.item.market_price || 0);
  const ageDays = context.ageDays || 0;
  const recommendationFromStrategy = context.strategyDecision?.recommendation;
  let recommendation = "sell_on_ebay";
  if (marketPrice > 500) recommendation = "consign_high_end";
  else if (recommendationFromStrategy === "bundle_with_similar" || marketPrice < 10) recommendation = "keep_local_only";
  else if (ageDays > 120) recommendation = "send_to_comc";
  else if (context.item.listing_status === "listed" && ageDays > 60) recommendation = "crosspost";
  else if (context.item.storage_location?.toLowerCase().includes("store")) recommendation = "store_inventory_shopify";
  else if (recommendationFromStrategy === "auction_recommended") recommendation = "sell_on_ebay";

  return {
    decisionType: DECISION_TYPES.MARKETPLACE,
    subjectType: context.subjectType,
    subjectId: context.subjectId,
    recommendation,
    confidence: 0.65,
    explanation: `Current value tier is $${marketPrice.toFixed(2)} and age is ${ageDays} days.`,
    suggestedAction: action(
      recommendation === "consign_high_end"
        ? "route_to_consignment"
        : recommendation === "send_to_comc"
          ? "assign_marketplace"
        : recommendation === "store_inventory_shopify"
          ? "assign_marketplace"
        : recommendation === "crosspost"
          ? "create_crosspost_plan"
          : "assign_marketplace",
      {
        marketplace:
          recommendation === "sell_on_ebay"
            ? "ebay"
            : recommendation === "send_to_comc"
              ? "comc"
              : recommendation === "store_inventory_shopify"
                ? "shopify"
                : null,
      },
    ),
    inputsUsed: { marketPrice, ageDays, strategyDecision: recommendationFromStrategy || null },
    createdAt: new Date().toISOString(),
  };
}
