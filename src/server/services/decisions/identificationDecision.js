import { DECISION_TYPES } from "./decisionTypes.js";
import { action } from "./explanationBuilder.js";

/**
 * Assess identification completeness and confidence.
 * @param {{ item: object, prices: object }} context
 * @returns {{ decisionType: string, recommendation: string, confidence: number, explanation: string }}
 */
export function identificationDecision(context) {
  if (context.subjectType !== "inventory_item" || !context.item) return null;

  const confidence = Number(context.item.cv_centering_score || 0);
  const hasFront = Boolean(context.item.front_img_id);
  const hasBack = Boolean(context.item.back_img_id);

  let recommendation = "unresolved";
  if (confidence >= 0.95) recommendation = "auto_accept_match";
  else if (confidence >= 0.8) recommendation = "needs_manual_review";
  else if (hasFront && !hasBack) recommendation = "requires_back_scan";

  const clampedConfidence = Math.min(Math.max(confidence, 0.35), 0.98);

  return {
    decisionType: DECISION_TYPES.IDENTIFICATION,
    subjectType: context.subjectType,
    subjectId: context.subjectId,
    recommendation,
    confidence: clampedConfidence,
    explanation: `Current identification confidence is ${clampedConfidence.toFixed(2)} with ${hasBack ? "front and back" : "front only"} imagery.`,
    suggestedAction: action(
      recommendation === "auto_accept_match"
        ? "accept_card_identity"
        : recommendation === "requires_back_scan"
          ? "prompt_back_scan"
          : "open_review_queue",
    ),
    inputsUsed: { confidence: clampedConfidence, hasFront, hasBack },
    createdAt: new Date().toISOString(),
  };
}
