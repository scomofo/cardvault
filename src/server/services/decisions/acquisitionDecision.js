import { DECISION_TYPES } from "./decisionTypes.js";
import { action } from "./explanationBuilder.js";

/**
 * Evaluate whether an acquisition is worth pursuing.
 * @param {{ item: object, prices: object }} context
 * @returns {{ decisionType: string, recommendation: string, confidence: number, explanation: string }}
 */
export function acquisitionDecision(context) {
  if (context.subjectType !== "purchase" || !context.purchase) return null;

  const ask = Number(context.purchase.total_cost || context.purchase.price || 0);
  const estimatedExitValue = context.purchase.estimated_exit_value;
  const estExit = estimatedExitValue == null || estimatedExitValue === ""
    ? ask * 1.2
    : Number(estimatedExitValue);
  const spread = estExit - ask;

  const recommendation =
    spread > ask * 0.25 ? "buy_now" : spread > 0 ? "buy_if_price_drops" : "pass";

  return {
    decisionType: DECISION_TYPES.ACQUISITION,
    subjectType: context.subjectType,
    subjectId: context.subjectId,
    recommendation,
    confidence: 0.55,
    explanation: `Estimated exit value is $${estExit.toFixed(2)} against total cost of $${ask.toFixed(2)}.`,
    suggestedAction: action(
      recommendation === "buy_now" ? "set_max_buy_price" : recommendation === "pass" ? "record_pass_decision" : "create_watch_entry",
      { value: Number((estExit * 0.8).toFixed(2)) },
    ),
    inputsUsed: { askingPrice: ask, estimatedExitValue: estExit },
    createdAt: new Date().toISOString(),
  };
}
