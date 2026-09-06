/** A label purchase is not evidence that a parcel has been dispatched. */
export function shipmentStateFromService(service = {}, now = new Date().toISOString()) {
  const labelStatus = String(service.labelStatus || "pending").toLowerCase();
  const unknown = labelStatus === "purchase_unknown";
  const failed = labelStatus === "failed" || Boolean(service.purchaseError);
  const labelUrl = typeof service.labelUrl === "string" && service.labelUrl.trim() ? service.labelUrl.trim() : null;
  const purchased = labelStatus === "purchased" && Boolean(labelUrl);
  if (unknown || (labelStatus === "purchased" && !labelUrl)) {
    return {
      label_status: "purchase_unknown", status: "exception", tracking_number: null,
      label_url: null, shipping_cost: 0, purchased_at: null, shipped_at: null,
    };
  }
  if (failed) {
    return {
      label_status: "failed", status: "exception", tracking_number: null,
      label_url: null, shipping_cost: 0, purchased_at: null, shipped_at: null,
    };
  }
  return {
    label_status: purchased ? "purchased" : "pending",
    status: purchased ? "label_purchased" : "pending",
    tracking_number: purchased ? (service.trackingNumber || null) : null,
    label_url: purchased ? labelUrl : null,
    shipping_cost: purchased && Number.isFinite(Number(service.cost)) ? Number(service.cost) : 0,
    purchased_at: purchased ? now : null,
    shipped_at: null,
  };
}

export function shipmentFulfillmentStatus(shipment) {
  if (shipment.status === "delivered") return "delivered";
  if (shipment.status === "shipped" && shipment.shipped_at) return "shipped";
  if (shipment.status === "exception" || ["failed", "purchase_unknown"].includes(shipment.label_status)) return "shipping_exception";
  return "pending";
}
