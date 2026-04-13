import { DECISION_TYPES } from "./decisionTypes.js";
import { action } from "./explanationBuilder.js";

/**
 * Prioritize items in the workflow queue.
 * @param {{ item: object, prices: object }} context
 * @returns {{ decisionType: string, recommendation: string, confidence: number, explanation: string }}
 */
export function workflowPriorityDecision(context) {
  const score = context.priorityScore || 0;
  const recommendation =
    context.subjectType === "order"
      ? "ship_now"
      : context.ageDays >= 90
        ? "reprice_now"
        : Number(context.item?.market_price || 0) >= 100
          ? "list_first"
          : "review_alert_now";

  return {
    decisionType: DECISION_TYPES.WORKFLOW_PRIORITY,
    subjectType: context.subjectType,
    subjectId: context.subjectId,
    recommendation,
    confidence: Math.min(0.6 + score / 200, 0.95),
    explanation: `Priority score is ${score}. Higher value, age, and fulfillment urgency push this toward the top of the queue.`,
    suggestedAction: action("assign_priority_score", { value: score }),
    inputsUsed: { priorityScore: score, ageDays: context.ageDays || 0 },
    createdAt: new Date().toISOString(),
  };
}
