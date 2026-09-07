export function summarizeShippingOutcome(shipment = {}) {
  const label = shipment.labelStatus || shipment.label_status;
  if (["shipped", "delivered"].includes(shipment.status) && (shipment.shippedAt || shipment.shipped_at)) return { type: "info", message: "This order is already dispatched." };
  if (["failed", "purchase_unknown", "purchasing"].includes(label)) return { type: "warning", message: "Shipping needs review. Check the provider for an existing charge or label before retrying." };
  if (label === "purchased" && (shipment.labelUrl || shipment.label_url)) return { type: "success", message: "Label purchased — pack the card, then confirm dispatch. It is not marked shipped yet." };
  return { type: "info", message: "Shipping prepared only — no label was purchased and the order is not shipped. Configure a provider or use your own postage." };
}
