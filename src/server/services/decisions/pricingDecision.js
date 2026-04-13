import { DECISION_TYPES } from "./decisionTypes.js";
import { action, buildExplanation } from "./explanationBuilder.js";

/**
 * Evaluate pricing strategy and recommend list price.
 * @param {{ item: object, prices: object }} context
 * @returns {{ decisionType: string, recommendation: string, confidence: number, explanation: string }}
 */
export function pricingDecision(context) {
  if (context.subjectType !== "inventory_item" || !context.item) return null;

  const snapshot = context.latestPriceSnapshot;
  const ageDays = context.ageDays || 0;
  const sampleSize = snapshot?.sample_size || 0;
  const lastComp = Number(snapshot?.last_comp_price_cents || 0);
  const highComp = Number(snapshot?.high_price_cents || lastComp);
  const trend = Number(context.marketTrend || 0);

  if (!snapshot || !lastComp || sampleSize < 2) {
    return {
      decisionType: DECISION_TYPES.PRICING,
      subjectType: context.subjectType,
      subjectId: context.subjectId,
      recommendation: "manual_price_review",
      confidence: 0.42,
      explanation: buildExplanation([
        "Comp data is thin or missing.",
        `Sample size is ${sampleSize || 0}.`,
      ]),
      suggestedAction: action("flag_pricing_review"),
      inputsUsed: { sampleSize, ageDays },
      createdAt: new Date().toISOString(),
    };
  }

  const market = lastComp;
  const quick = Math.round(lastComp * 0.9);
  const premium = highComp;
  let recommendation = "list_at_market";
  if (ageDays >= 60 && trend < -0.05) recommendation = "list_quick_sale";
  else if (trend > 0.12 && sampleSize >= 5) recommendation = "list_premium";
  const chosen =
    recommendation === "list_quick_sale"
      ? quick
      : recommendation === "list_premium"
        ? premium
        : market;

  return {
    decisionType: DECISION_TYPES.PRICING,
    subjectType: context.subjectType,
    subjectId: context.subjectId,
    recommendation,
    confidence: sampleSize >= 8 ? 0.9 : 0.72,
    explanation: buildExplanation([
      `Last comp is $${(lastComp / 100).toFixed(2)} with ${sampleSize} recent comps.`,
      ageDays >= 60 ? `Inventory age is ${ageDays} days.` : null,
      trend > 0.12 ? `Market trend is rising ${(trend * 100).toFixed(1)}%.` : null,
      trend < -0.05 ? `Market trend is down ${(Math.abs(trend) * 100).toFixed(1)}%.` : null,
      `Premium range tops out near $${(premium / 100).toFixed(2)}.`,
    ]),
    suggestedAction: action("set_listing_price", { valueCents: chosen, premiumValueCents: premium }),
    inputsUsed: { marketPriceCents: market, sampleSize, ageDays },
    createdAt: new Date().toISOString(),
  };
}
