import { DECISION_TYPES } from "./decisionTypes.js";
import { getDecisionNumber } from "./decisionSettings.js";
import { computeExpectedNet, marketplaceKeyFromRecommendation } from "./marketplaceFees.js";
import { action } from "./explanationBuilder.js";

/**
 * Recommend optimal marketplace for listing.
 * @param {{ item: object, prices: object }} context
 * @returns {{ decisionType: string, recommendation: string, confidence: number, explanation: string }}
 */
export function marketplaceDecision(context) {
  if (context.subjectType !== "inventory_item" || !context.item) return null;

  const marketPrice = Number(context.item.market_price || 0);
  const ageDays = context.ageDays || 0;
  const recommendationFromStrategy = context.strategyDecision?.recommendation;
  const consignThreshold = getDecisionNumber("marketplace_consignment_threshold");
  const lowValueFloor = getDecisionNumber("marketplace_low_value_floor");
  const comcStaleDays = getDecisionNumber("marketplace_stale_days_comc");
  const crosspostStaleDays = getDecisionNumber("marketplace_stale_days_crosspost");
  let recommendation = "sell_on_ebay";
  if (marketPrice > consignThreshold) recommendation = "consign_high_end";
  else if (recommendationFromStrategy === "bundle_with_similar" || marketPrice < lowValueFloor) recommendation = "keep_local_only";
  else if (ageDays > comcStaleDays) recommendation = "send_to_comc";
  else if (context.item.listing_status === "listed" && ageDays > crosspostStaleDays) recommendation = "crosspost";
  else if (context.item.storage_location?.toLowerCase().includes("store")) recommendation = "store_inventory_shopify";
  else if (recommendationFromStrategy === "auction_recommended") recommendation = "sell_on_ebay";

  const marketplaceKey = marketplaceKeyFromRecommendation(recommendation);
  const expectedNet = computeExpectedNet(marketPrice, marketplaceKey, 0);
  const candidateChannels = ["ebay", "tcgplayer", "mercari", "shopify", "comc", "consignment"];
  const channelNets = {};
  for (const channel of candidateChannels) {
    const net = computeExpectedNet(marketPrice, channel, 0);
    if (net != null) channelNets[channel] = net;
  }
  const bestChannel = Object.entries(channelNets)
    .sort((a, b) => b[1] - a[1])[0];
  const netSuffix = expectedNet != null
    ? ` Expected net via ${marketplaceKey} is $${expectedNet.toFixed(2)}.`
    : "";
  const bestSuffix = bestChannel && bestChannel[0] !== marketplaceKey
    ? ` Highest expected net would be ${bestChannel[0]} at $${bestChannel[1].toFixed(2)}.`
    : "";

  return {
    decisionType: DECISION_TYPES.MARKETPLACE,
    subjectType: context.subjectType,
    subjectId: context.subjectId,
    recommendation,
    confidence: 0.65,
    explanation: `Current value tier is $${marketPrice.toFixed(2)} and age is ${ageDays} days.${netSuffix}${bestSuffix}`,
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
    inputsUsed: {
      marketPrice,
      ageDays,
      strategyDecision: recommendationFromStrategy || null,
      marketplaceKey,
      expectedNet,
      channelNets,
      bestChannel: bestChannel ? { key: bestChannel[0], net: bestChannel[1] } : null,
    },
    createdAt: new Date().toISOString(),
  };
}
