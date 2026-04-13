import { DECISION_TYPES } from "./decisionTypes.js";
import { action } from "./explanationBuilder.js";

/**
 * Recommend selling strategy.
 * @param {{ item: object, prices: object }} context
 * @returns {{ decisionType: string, recommendation: string, confidence: number, explanation: string }}
 */
export function sellingStrategyDecision(context) {
  if (context.subjectType !== "inventory_item" || !context.item) return null;

  const marketPrice = Number(context.item.market_price || 0);
  const ageDays = context.ageDays || 0;
  const projectedGrade = Number(context.item.projected_grade || 0);
  const psa10 = Number(context.item.psa10_price || 0);
  const duplicates = Number(context.duplicateCount || 0);
  const shippingCost = 4.99;
  const trend = Number(context.marketTrend || 0);

  let recommendation = "fixed_price_recommended";
  if ((marketPrice < 15 && ageDays > 30) || duplicates > 1 || shippingCost > marketPrice * 0.35) {
    recommendation = "bundle_with_similar";
  } else if (projectedGrade >= 9.5 && psa10 > marketPrice + 40) {
    recommendation = "grade_before_sale";
  } else if (trend > 0.1 && ageDays < 45) {
    recommendation = "hold";
  } else if (ageDays >= 90 || trend < -0.08) {
    recommendation = "sell_now";
  } else if (marketPrice >= 150 || Math.abs(trend) > 0.15) {
    recommendation = "auction_recommended";
  }

  return {
    decisionType: DECISION_TYPES.SELLING_STRATEGY,
    subjectType: context.subjectType,
    subjectId: context.subjectId,
    recommendation,
    confidence: 0.69,
    explanation: `Market price is $${marketPrice.toFixed(2)}, age is ${ageDays} days, duplicate count is ${duplicates}, and market trend is ${(trend * 100).toFixed(1)}%.`,
    suggestedAction: action(
      recommendation === "grade_before_sale"
        ? "move_to_grading_queue"
        : recommendation === "bundle_with_similar"
          ? "add_to_bundle_queue"
          : recommendation === "hold"
            ? "mark_hold_box"
            : recommendation === "auction_recommended"
              ? "create_listing"
          : recommendation === "sell_now"
            ? "create_listing"
            : "create_listing",
    ),
    inputsUsed: { marketPrice, ageDays, projectedGrade, psa10, duplicates, trend },
    createdAt: new Date().toISOString(),
  };
}
