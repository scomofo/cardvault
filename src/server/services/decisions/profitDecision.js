import { DECISION_TYPES } from "./decisionTypes.js";
import { action } from "./explanationBuilder.js";

/**
 * Analyze profit potential and margins.
 * @param {{ item: object, prices: object }} context
 * @returns {{ decisionType: string, recommendation: string, confidence: number, explanation: string }}
 */
export function profitDecision(context) {
  if (context.subjectType !== "inventory_item" || !context.item) return null;

  const ageDays = context.ageDays || 0;
  const margin = Number(context.item.profit_realized || 0);
  const marketPrice = Number(context.item.market_price || 0);
  const costBasis = Number(context.item.cost_basis || 0);

  let recommendation = "protect_margin";
  if (ageDays >= 90 && context.item.sale_status !== "sold") recommendation = "drop_price";
  if (ageDays >= 180) recommendation = "liquidate";
  if (margin > 50) recommendation = "top_performer";
  if (marketPrice > costBasis * 1.5 && ageDays < 30) recommendation = "hold_for_market";

  return {
    decisionType: DECISION_TYPES.PROFIT,
    subjectType: context.subjectType,
    subjectId: context.subjectId,
    recommendation,
    confidence: 0.7,
    explanation: `Age is ${ageDays} days, market value is $${marketPrice.toFixed(2)}, and realized profit is $${margin.toFixed(2)}.`,
    suggestedAction: action(
      recommendation === "drop_price" || recommendation === "liquidate"
        ? "revise_listing_price"
        : recommendation === "hold_for_market"
          ? "add_hold_tag"
          : "mark_clearance",
    ),
    inputsUsed: { ageDays, marketPrice, costBasis, realizedProfit: margin },
    createdAt: new Date().toISOString(),
  };
}
