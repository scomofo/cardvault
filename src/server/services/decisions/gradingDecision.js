import { DECISION_TYPES } from "./decisionTypes.js";
import { getDecisionNumber } from "./decisionSettings.js";
import { expectedGradedValue } from "./gradeRiskModel.js";
import { action, buildExplanation } from "./explanationBuilder.js";

/**
 * Evaluate grading candidacy and PSA value uplift.
 * @param {{ item: object, prices: object }} context
 * @returns {{ decisionType: string, recommendation: string, confidence: number, explanation: string }}
 */
export function gradingDecision(context) {
  if (context.subjectType !== "inventory_item" || !context.item) return null;

  const raw = Number(context.item.market_price || context.item.last_comp_price || 0);
  const psa10 = Number(context.item.psa10_price || 0);
  const psa9 = Number(context.item.psa9_price || 0);
  const projectedGrade = Number(context.item.projected_grade || 8);
  const gradingCost = getDecisionNumber("grading_cost");
  const gradeNowThreshold = getDecisionNumber("grading_upside_grade_now");
  const maybeThreshold = getDecisionNumber("grading_upside_maybe");
  const minProjected = getDecisionNumber("grading_min_projected_grade");
  const hasComps = psa10 > 0 || psa9 > 0;
  const { expectedValue: targetValue, distribution } = hasComps
    ? expectedGradedValue(projectedGrade, { raw, psa9, psa10 })
    : { expectedValue: 0, distribution: [] };
  const upside = targetValue - raw - gradingCost;

  let recommendation = "sell_raw";
  if (hasComps && upside > gradeNowThreshold) recommendation = "grade_now";
  else if (hasComps && upside > maybeThreshold) recommendation = "maybe_grade";
  else if (projectedGrade < minProjected) recommendation = "sell_raw";
  else if (!hasComps) recommendation = "manual_grade_review";

  return {
    decisionType: DECISION_TYPES.GRADING,
    subjectType: context.subjectType,
    subjectId: context.subjectId,
    recommendation,
    confidence: hasComps ? 0.74 : 0.41,
    explanation: buildExplanation([
      `Raw value is $${raw.toFixed(2)}.`,
      hasComps
        ? `Expected graded value across grade distribution is $${targetValue.toFixed(2)} (projected ${projectedGrade}).`
        : "Graded comp data is limited.",
      `Estimated grading cost is $${gradingCost.toFixed(2)}.`,
    ]),
    suggestedAction: action(
      recommendation === "grade_now" ? "move_to_grading_queue" : recommendation === "sell_raw" ? "mark_sell_raw" : "rerun_with_assumed_grade",
      { projectedGrade, estimatedUpside: upside },
    ),
    inputsUsed: { rawPrice: raw, psa9, psa10, projectedGrade, gradingCost, expectedGradedValue: targetValue, distribution },
    createdAt: new Date().toISOString(),
  };
}
