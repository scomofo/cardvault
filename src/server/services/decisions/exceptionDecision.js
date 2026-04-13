import { DECISION_TYPES } from "./decisionTypes.js";
import { action, buildExplanation } from "./explanationBuilder.js";

/**
 * Flag exceptional items needing manual attention.
 * @param {{ item: object, prices: object }} context
 * @returns {{ decisionType: string, recommendation: string, confidence: number, explanation: string }}
 */
export function exceptionDecision(context) {
  const issues = [];

  if (context.subjectType === "inventory_item" && context.item) {
    if (!context.item.name && !context.item.player_name) issues.push("identity is incomplete");
    if (Number(context.item.cost_basis || 0) <= 0) issues.push("cost basis is missing");
    if (!context.latestPriceSnapshot) issues.push("pricing data is unavailable");
  }

  if (context.subjectType === "order" && context.order) {
    if (!context.order.platform) issues.push("marketplace source is missing");
    if (Number(context.order.sale_price || 0) <= 0) issues.push("sale price is missing");
  }

  if (issues.length === 0) return null;

  return {
    decisionType: DECISION_TYPES.EXCEPTION,
    subjectType: context.subjectType,
    subjectId: context.subjectId,
    recommendation: "manual_review_required",
    confidence: 0.88,
    explanation: buildExplanation(issues.map((issue) => `${issue}.`)),
    suggestedAction: action("create_review_task", { reasons: issues }),
    inputsUsed: { issues },
    createdAt: new Date().toISOString(),
  };
}
