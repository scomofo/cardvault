import { DECISION_TYPES } from "./decisionTypes.js";
import { action, buildExplanation } from "./explanationBuilder.js";

export function catalogDecision(context) {
  if (context.subjectType !== "inventory_item" || !context.item) return null;

  const item = context.item;
  const hasIdentity = Boolean(item.name || item.player_name);
  const hasCostBasis = Number(item.cost_basis || 0) > 0;
  const hasStorage = Boolean(item.storage_location || item.binder);
  const hasPricing = Number(item.market_price || item.suggested_listing_price || 0) > 0;

  let recommendation = "incomplete_record";
  if (hasIdentity && hasPricing && hasStorage) recommendation = "ready_to_list";
  else if (hasIdentity && hasStorage) recommendation = "ready_to_catalog";
  else if (!hasCostBasis) recommendation = "missing_cost_basis";

  return {
    decisionType: DECISION_TYPES.CATALOG,
    subjectType: context.subjectType,
    subjectId: context.subjectId,
    recommendation,
    confidence: 0.71,
    explanation: buildExplanation([
      !hasIdentity ? "Identity is incomplete." : null,
      !hasPricing ? "Pricing is missing." : null,
      !hasStorage ? "Storage assignment is missing." : null,
      !hasCostBasis ? "Cost basis is missing." : null,
    ]) || "Core catalog fields are present.",
    suggestedAction: action(
      recommendation === "ready_to_list"
        ? "save_inventory_item"
        : recommendation === "missing_cost_basis"
          ? "request_cost_basis"
          : "open_condition_review",
    ),
    inputsUsed: { hasIdentity, hasCostBasis, hasStorage, hasPricing },
    createdAt: new Date().toISOString(),
  };
}
