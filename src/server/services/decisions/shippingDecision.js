import { DECISION_TYPES } from "./decisionTypes.js";
import { action } from "./explanationBuilder.js";

/**
 * Recommend shipping method and estimate costs.
 * @param {{ item: object, prices: object }} context
 * @returns {{ decisionType: string, recommendation: string, confidence: number, explanation: string }}
 */
export function shippingDecision(context) {
  if (context.subjectType !== "order" || !context.order) return null;

  const salePrice = Number(context.order.sale_price || 0);
  const itemCount = Number(context.order.item_count || 1);
  const destinationCountry = context.order.destination_country || "CA";
  const weightOz = Number(context.order.weight_oz || 3);

  let recommendation = destinationCountry === "CA" ? "use_plain_mail" : "use_usa_lettermail";
  if (itemCount > 1) recommendation = "combine_shipment";
  else if (destinationCountry === "CA" && salePrice >= 100) recommendation = "use_expedited_parcel";
  else if (destinationCountry === "CA" && salePrice >= 20) recommendation = "use_tracked_parcel";
  else if (destinationCountry !== "CA" && salePrice >= 125) recommendation = "use_courier";
  else if (destinationCountry !== "CA" && salePrice >= 25) recommendation = "use_tracked_packet_usa";
  if (Number(context.order.shipping_cost || 0) > salePrice * 0.25) recommendation = "shipping_cost_warning";

  return {
    decisionType: DECISION_TYPES.SHIPPING,
    subjectType: context.subjectType,
    subjectId: context.subjectId,
    recommendation,
    confidence: 0.78,
    explanation: `Sale value is $${salePrice.toFixed(2)} across ${itemCount} item(s) to ${destinationCountry} at ${weightOz.toFixed(1)} oz.`,
    suggestedAction: action(
      recommendation === "combine_shipment"
        ? "combine_order"
        : recommendation === "shipping_cost_warning"
          ? "review_shipping_profit"
          : "choose_service_level",
    ),
    inputsUsed: { salePrice, itemCount, destinationCountry, weightOz },
    createdAt: new Date().toISOString(),
  };
}
