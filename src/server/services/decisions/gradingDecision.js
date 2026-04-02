import { DECISION_TYPES } from "./decisionTypes.js";
import { action, buildExplanation } from "./explanationBuilder.js";

export function gradingDecision(context) {
  if (context.subjectType !== "inventory_item" || !context.item) return null;

  const raw = Number(context.item.market_price || context.item.last_comp_price || 0);
  const psa10 = Number(context.item.psa10_price || 0);
  const psa9 = Number(context.item.psa9_price || 0);
  const projectedGrade = Number(context.item.projected_grade || 8);
  const gradingCost = 25;
  const targetValue = projectedGrade >= 9.5 ? psa10 : psa9;
  const upside = targetValue - raw - gradingCost;

  let recommendation = "sell_raw";
  if (targetValue > 0 && upside > 40) recommendation = "grade_now";
  else if (targetValue > 0 && upside > 10) recommendation = "maybe_grade";
  else if (projectedGrade < 7.5) recommendation = "sell_raw";
  else if (!targetValue) recommendation = "manual_grade_review";

  return {
    decisionType: DECISION_TYPES.GRADING,
    subjectType: context.subjectType,
    subjectId: context.subjectId,
    recommendation,
    confidence: targetValue ? 0.74 : 0.41,
    explanation: buildExplanation([
      `Raw value is $${raw.toFixed(2)}.`,
      targetValue ? `Projected graded value is $${targetValue.toFixed(2)} at grade ${projectedGrade}.` : "Graded comp data is limited.",
      `Estimated grading cost is $${gradingCost.toFixed(2)}.`,
    ]),
    suggestedAction: action(
      recommendation === "grade_now" ? "move_to_grading_queue" : recommendation === "sell_raw" ? "mark_sell_raw" : "rerun_with_assumed_grade",
      { projectedGrade, estimatedUpside: upside },
    ),
    inputsUsed: { rawPrice: raw, psa9, psa10, projectedGrade, gradingCost },
    createdAt: new Date().toISOString(),
  };
}
