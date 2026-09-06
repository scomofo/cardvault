import { get, run, runInImmediateTransaction } from "../../database.js";
import { pickShippingProviderService } from "../../integrations/shipping/shippingProviderRegistry.js";
import { shipmentStateFromService, shipmentFulfillmentStatus } from "../../integrations/shipping/shipmentState.js";
import { uid } from "../../routes/shared.js";

function firstDefined(...values) {
  return values.find((value) => value != null && value !== "");
}

// Planning estimates only. These must never create labels, tracking or costs
// in the sale ledger without a confirmed provider purchase.
function pickService({ country = "CA", salePrice = 0, weightOz = 3 }) {
  if (country === "CA") {
    if (salePrice < 20 && weightOz <= 3) return { service: "Canada Post Lettermail", cost: 1.94, tracking: false, carrier: "Canada Post" };
    if (salePrice < 100) return { service: "Canada Post Tracked Packet", cost: 13.0, tracking: true, carrier: "Canada Post" };
    return { service: "Canada Post Expedited Parcel", cost: 18.0, tracking: true, carrier: "Canada Post" };
  }
  if (salePrice < 25 && weightOz <= 3) return { service: "Canada Post USA Lettermail", cost: 3.5, tracking: false, carrier: "Canada Post" };
  if (salePrice < 125) return { service: "Canada Post Tracked Packet USA", cost: 14.5, tracking: true, carrier: "Canada Post" };
  return { service: "Courier USA", cost: 24.0, tracking: true, carrier: "Courier" };
}

function syncOrderAndSaleShippingState(order, shipment) {
  const fulfillmentStatus = shipmentFulfillmentStatus(shipment);
  run(
    `UPDATE orders SET fulfillment_status = CASE
       WHEN fulfillment_status IN ('shipped', 'delivered') THEN fulfillment_status
       ELSE ? END WHERE id = ?`,
    [fulfillmentStatus, order.id],
  );
  if (shipment.label_status === "purchased") {
    run(
      `UPDATE sales SET shipping_cost = ?, tracking_number = COALESCE(?, tracking_number)
       WHERE order_id = ? OR id = ?`,
      [shipment.shipping_cost || 0, shipment.tracking_number || null, order.id, order.sale_id || ""],
    );
  }
}

/** Prepare shipping or buy a label. Dispatch requires a separate confirmation. */
export async function automateShipment(orderId, options = {}) {
  const weightOz = Number(options.weightOz ?? 3);
  if (!Number.isFinite(weightOz) || weightOz <= 0) throw new Error("Package weight must be positive");
  const packageType = options.packageType || "card_mailer";

  // Persist the claim BEFORE contacting a carrier, so overlapping requests or
  // a process restart cannot buy a second label. A stranded 'purchasing' row
  // needs provider reconciliation, not an automatic retry.
  const claim = runInImmediateTransaction(() => {
    const order = get(`SELECT * FROM orders WHERE id = ?`, [orderId]);
    if (!order) throw new Error("Order not found");
    if (order.payment_status !== "paid") throw new Error("Confirm payment before purchasing shipping");
    const existing = get(`SELECT * FROM shipments WHERE order_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`, [orderId]);
    if (["shipped", "delivered"].includes(order.fulfillment_status)) {
      if (existing) return { order, existing };
      throw new Error("Order is already dispatched");
    }
    const startedAt = existing?.created_at ? Date.parse(existing.created_at.replace(" ", "T") + (existing.created_at.endsWith("Z") ? "" : "Z")) : NaN;
    if (existing?.label_status === "purchasing" && (!Number.isFinite(startedAt) || Date.now() - startedAt < 120_000)) return { order, existing };
    const retryable = existing && (existing.label_status === "pending"
      || (options.retry === true && options.confirmNoExistingLabel === true
        && ["failed", "purchase_unknown", "purchasing"].includes(existing.label_status)));
    if (existing && !retryable) return { order, existing };

    const shipmentId = existing?.id || uid();
    if (existing) {
      run(`UPDATE shipments SET label_status = 'purchasing', status = 'pending', created_at = datetime('now') WHERE id = ?`, [shipmentId]);
    } else {
      run(
        `INSERT INTO shipments (id, order_id, item_id, package_type, weight_oz, label_status, status)
         VALUES (?,?,?,?,?,'purchasing','pending')`,
        [shipmentId, orderId, order.item_id || null, packageType, weightOz],
      );
    }
    return { order, shipmentId };
  });
  const { order } = claim;
  if (claim.existing) {
    syncOrderAndSaleShippingState(order, claim.existing);
    return claim.existing;
  }

  const { shipmentId } = claim;
  const country = options.destinationCountry || order.destination_country || "CA";
  const destinationPostalCode = firstDefined(options.destinationPostalCode, options.destination_postal_code, order.destination_postal_code);
  let service;
  try {
    service = await pickShippingProviderService({
      provider: options.provider || "Canada Post", country,
      salePrice: Number(order.sale_price || 0), weightOz, shipmentId,
      packageType, destinationPostalCode, destination: options.destination,
    }) || pickService({ country, salePrice: Number(order.sale_price || 0), weightOz });
  } catch (error) {
    service = {
      carrier: options.provider || "Canada Post", service: "Needs provider review",
      labelStatus: "purchase_unknown", purchaseError: error.message,
    };
  }
  const state = shipmentStateFromService(service);

  return runInImmediateTransaction(() => {
    run(
      `UPDATE shipments SET carrier = ?, service_level = ?, package_type = ?, weight_oz = ?,
       label_status = ?, tracking_number = ?, shipping_cost = ?, packaging_cost = ?,
       purchased_at = ?, shipped_at = ?, label_url = ?, status = ?, provider = ? WHERE id = ?`,
      [service.carrier || null, service.service || null, packageType, weightOz,
        state.label_status, state.tracking_number, state.shipping_cost,
        state.label_status === "purchased" ? 0.35 : 0,
        state.purchased_at, state.shipped_at, state.label_url, state.status,
        service.carrier || null, shipmentId],
    );
    syncOrderAndSaleShippingState(order, state);
    if (order.listing_id) {
      const channel = get(
        `SELECT * FROM listing_channels WHERE listing_id = ? AND marketplace = ?
         ORDER BY updated_at DESC, created_at DESC LIMIT 1`,
        [order.listing_id, order.platform],
      ) || get(
        `SELECT * FROM listing_channels WHERE listing_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1`,
        [order.listing_id],
      );
      if (channel) {
        const event = state.status === "exception" ? "shipping_exception"
          : state.label_status === "purchased" ? "label_purchased" : "shipping_prepared";
        run(
          `INSERT INTO listing_channel_events (id, listing_channel_id, event_type, status, payload)
           VALUES (?,?,?,?,?)`,
          [uid(), channel.id, event, state.status === "exception" ? "failed" : state.status, JSON.stringify({
            trackingNumber: state.tracking_number, service: service.service,
            labelUrl: state.label_url, labelStatus: state.label_status,
            estimatedShippingCost: service.cost ?? null,
            error: service.purchaseError || undefined,
          })],
        );
      }
    }
    return get(`SELECT * FROM shipments WHERE id = ?`, [shipmentId]);
  });
}
