import { get, run } from "../../database.js";
import { uid } from "../../routes/shared.js";

function pickService({ country = "CA", salePrice = 0, weightOz = 3 }) {
  if (country === "CA") {
    if (salePrice < 20 && weightOz <= 3) {
      return { service: "Canada Post Lettermail", cost: 1.94, tracking: false, carrier: "Canada Post" };
    }
    if (salePrice < 100) {
      return { service: "Canada Post Tracked Packet", cost: 13.0, tracking: true, carrier: "Canada Post" };
    }
    return { service: "Canada Post Expedited Parcel", cost: 18.0, tracking: true, carrier: "Canada Post" };
  }

  if (salePrice < 25 && weightOz <= 3) {
    return { service: "Canada Post USA Lettermail", cost: 3.5, tracking: false, carrier: "Canada Post" };
  }
  if (salePrice < 125) {
    return { service: "Canada Post Tracked Packet USA", cost: 14.5, tracking: true, carrier: "Canada Post" };
  }
  return { service: "Courier USA", cost: 24.0, tracking: true, carrier: "Courier" };
}

function buildTracking(service) {
  const prefix = service.includes("Lettermail") ? "LT" : "TRK";
  return `${prefix}${Date.now().toString().slice(-10)}`;
}

/**
 * Automate shipment creation for a fulfilled order.
 * @param {string} orderId
 * @param {object} [options]
 * @returns {object}
 */
export function automateShipment(orderId, options = {}) {
  const order = get(`SELECT * FROM orders WHERE id = ?`, [orderId]);
  if (!order) throw new Error("Order not found");

  const country = options.destinationCountry || order.destination_country || "CA";
  const weightOz = Number(options.weightOz || 3);
  const packageType = options.packageType || "card_mailer";
  const service = pickService({
    country,
    salePrice: Number(order.sale_price || 0),
    weightOz,
  });

  const trackingNumber = service.tracking ? buildTracking(service.service) : null;
  const shipmentId = uid();
  const labelUrl = `labels/${shipmentId}.pdf`;

  run(
    `INSERT INTO shipments
     (id, order_id, item_id, carrier, service_level, package_type, label_status, tracking_number,
      shipping_cost, packaging_cost, weight_oz, purchased_at, shipped_at, created_at, label_url, status, provider)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,?,?)`,
    [
      shipmentId,
      orderId,
      order.item_id || null,
      service.carrier,
      service.service,
      packageType,
      "created",
      trackingNumber,
      service.cost,
      0.35,
      weightOz,
      new Date().toISOString(),
      new Date().toISOString(),
      labelUrl,
      "shipped",
      service.carrier,
    ],
  );

  run(
    `UPDATE orders
     SET fulfillment_status = 'shipped'
     WHERE id = ?`,
    [orderId],
  );

  run(
    `UPDATE sales
     SET shipping_cost = ?, tracking_number = COALESCE(?, tracking_number)
     WHERE order_id = ? OR id = ?`,
    [service.cost, trackingNumber, orderId, order.sale_id || ""],
  );

  if (order.listing_id) {
    const channel = get(`SELECT * FROM listing_channels WHERE listing_id = ? ORDER BY updated_at DESC LIMIT 1`, [order.listing_id]);
    if (channel) {
      run(
        `INSERT INTO listing_channel_events (id, listing_channel_id, event_type, status, payload)
         VALUES (?,?,?,?,?)`,
        [
          uid(),
          channel.id,
          "tracking_sync",
          "shipped",
          JSON.stringify({ trackingNumber, service: service.service, labelUrl }),
        ],
      );
    }
  }

  return get(`SELECT * FROM shipments WHERE id = ?`, [shipmentId]);
}
