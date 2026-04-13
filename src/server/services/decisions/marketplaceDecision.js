import { DECISION_TYPES } from "./decisionTypes.js";
import { getDecisionNumber } from "./decisionSettings.js";
import { computeExpectedNet } from "./marketplaceFees.js";
import { action } from "./explanationBuilder.js";

const ALL_CHANNELS = ["ebay", "tcgplayer", "mercari", "shopify", "comc", "consignment"];
const OPEN_MARKET_CHANNELS = ["ebay", "tcgplayer", "mercari", "shopify"];

const CHANNEL_TO_RECOMMENDATION = {
  ebay: "sell_on_ebay",
  tcgplayer: "sell_on_ebay", // no TCGplayer adapter yet — route through eBay as primary
  mercari: "sell_on_ebay",   // same — disclosure only until adapter lands
  shopify: "store_inventory_shopify",
  comc: "send_to_comc",
  consignment: "consign_high_end",
  local: "keep_local_only",
};

const CHANNEL_TO_ACTION = {
  sell_on_ebay: "assign_marketplace",
  store_inventory_shopify: "assign_marketplace",
  send_to_comc: "assign_marketplace",
  consign_high_end: "route_to_consignment",
  keep_local_only: "assign_marketplace",
  crosspost: "create_crosspost_plan",
};

function buildChannelNets(marketPrice) {
  const result = {};
  for (const channel of ALL_CHANNELS) {
    const net = computeExpectedNet(marketPrice, channel, 0);
    if (net != null) result[channel] = net;
  }
  return result;
}

function pickBestEligible(eligible, channelNets) {
  let best = null;
  for (const channel of eligible) {
    const net = channelNets[channel];
    if (net == null) continue;
    if (best == null || net > best.net) best = { key: channel, net };
  }
  return best;
}

/**
 * Recommend optimal marketplace for listing.
 *
 * The rule tree produces a set of *eligible* channels based on hard
 * constraints (consignment threshold, stale-age clearance, bundle strategy,
 * storage location). Within the eligible set, the channel with the highest
 * expected net is selected. See docs/decisions/Marketplace-Routing.md.
 *
 * @param {{ subjectType: string, item: object, ageDays?: number, strategyDecision?: object }} context
 */
export function marketplaceDecision(context) {
  if (context.subjectType !== "inventory_item" || !context.item) return null;

  const marketPrice = Number(context.item.market_price || 0);
  const ageDays = context.ageDays || 0;
  const strategy = context.strategyDecision?.recommendation;
  const consignThreshold = getDecisionNumber("marketplace_consignment_threshold");
  const lowValueFloor = getDecisionNumber("marketplace_low_value_floor");
  const comcStaleDays = getDecisionNumber("marketplace_stale_days_comc");
  const crosspostStaleDays = getDecisionNumber("marketplace_stale_days_crosspost");
  const storageStore = context.item.storage_location?.toLowerCase().includes("store");
  const channelNets = buildChannelNets(marketPrice);
  const globalBest = pickBestEligible(Object.keys(channelNets), channelNets);

  let eligible;
  let recommendation;
  let selectionReason;

  if (marketPrice > consignThreshold) {
    eligible = ["consignment"];
    selectionReason = `market price $${marketPrice.toFixed(2)} exceeds consignment threshold $${consignThreshold.toFixed(2)}`;
  } else if (strategy === "bundle_with_similar" || marketPrice < lowValueFloor) {
    recommendation = "keep_local_only";
    eligible = ["local"];
    selectionReason = strategy === "bundle_with_similar"
      ? "strategy is bundle_with_similar"
      : `market price $${marketPrice.toFixed(2)} below low-value floor $${lowValueFloor.toFixed(2)}`;
  } else if (ageDays > comcStaleDays) {
    eligible = ["comc"];
    selectionReason = `inventory age ${ageDays}d exceeds COMC stale threshold ${comcStaleDays}d`;
  } else if (context.item.listing_status === "listed" && ageDays > crosspostStaleDays) {
    recommendation = "crosspost";
    eligible = OPEN_MARKET_CHANNELS;
    selectionReason = `listed for ${ageDays}d — crossposting to increase reach`;
  } else if (storageStore) {
    eligible = ["shopify"];
    selectionReason = "storage location tagged as store inventory";
  } else if (strategy === "auction_recommended") {
    eligible = ["ebay"];
    selectionReason = "selling strategy is auction_recommended";
  } else {
    eligible = OPEN_MARKET_CHANNELS;
    selectionReason = "no hard constraints — optimizing for expected net";
  }

  if (!recommendation) {
    const best = pickBestEligible(eligible, channelNets) || { key: eligible[0] };
    recommendation = CHANNEL_TO_RECOMMENDATION[best.key] || "sell_on_ebay";
  }

  const selectedKey = recommendation === "crosspost"
    ? "ebay"
    : Object.keys(CHANNEL_TO_RECOMMENDATION).find(
        (key) => CHANNEL_TO_RECOMMENDATION[key] === recommendation,
      ) || "ebay";
  const expectedNet = channelNets[selectedKey] ?? null;

  const explanationParts = [
    `Current value tier is $${marketPrice.toFixed(2)} and age is ${ageDays} days.`,
    `Selection rule: ${selectionReason}.`,
  ];
  if (expectedNet != null) {
    explanationParts.push(`Expected net via ${selectedKey} is $${expectedNet.toFixed(2)}.`);
  }
  if (globalBest && globalBest.key !== selectedKey && recommendation !== "crosspost") {
    explanationParts.push(
      `Unconstrained best would be ${globalBest.key} at $${globalBest.net.toFixed(2)} (${(globalBest.net - (expectedNet ?? 0)).toFixed(2)} more).`,
    );
  }

  return {
    decisionType: DECISION_TYPES.MARKETPLACE,
    subjectType: context.subjectType,
    subjectId: context.subjectId,
    recommendation,
    confidence: 0.65,
    explanation: explanationParts.join(" "),
    suggestedAction: action(CHANNEL_TO_ACTION[recommendation] || "assign_marketplace", {
      marketplace: selectedKey,
    }),
    inputsUsed: {
      marketPrice,
      ageDays,
      strategyDecision: strategy || null,
      eligibleChannels: eligible,
      selectedChannel: selectedKey,
      expectedNet,
      channelNets,
      unconstrainedBest: globalBest,
      selectionReason,
    },
    createdAt: new Date().toISOString(),
  };
}
