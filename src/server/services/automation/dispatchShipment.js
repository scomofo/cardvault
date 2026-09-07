import { get, run, runInImmediateTransaction } from "../../database.js";
import { uid } from "../../routes/shared.js";

/** Explicit physical dispatch confirmation. Never invoked by label purchase. */
export function confirmShipmentDispatch(orderId, options = {}) {
  if (options.confirmed !== true) throw new Error("Confirm that the package has been handed to the carrier");
  const trackingNumber = options.trackingNumber == null ? null : String(options.trackingNumber).trim();
  if (trackingNumber && trackingNumber.length > 120) throw new Error("Tracking number is too long");
  for (const name of ["shippingCost", "packagingCost"]) {
    if (options[name] != null && (!Number.isFinite(Number(options[name])) || Number(options[name]) < 0)) throw new Error(`${name} must be a non-negative amount`);
  }
  return runInImmediateTransaction(() => {
    const order = get(`SELECT * FROM orders WHERE id = ?`, [orderId]);
    if (!order) throw new Error("Order not found");
    if (order.payment_status !== "paid") throw new Error("Confirm payment before dispatching");
    let shipment = get(`SELECT * FROM shipments WHERE order_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`, [orderId]);
    if (["shipped", "delivered"].includes(order.fulfillment_status)) return shipment || order;
    if (["purchasing", "purchase_unknown"].includes(shipment?.label_status)) throw new Error("Resolve the uncertain label purchase with the provider before dispatch confirmation");
    const id = shipment?.id || uid();
    if (!shipment) {
      run(`INSERT INTO shipments (id, order_id, item_id, label_status, status) VALUES (?,?,?,'manual','pending')`, [id, orderId, order.item_id]);
    }
    run(`UPDATE shipments SET status = 'shipped', shipped_at = COALESCE(shipped_at, datetime('now')),
      carrier = COALESCE(?, carrier), tracking_number = COALESCE(?, tracking_number),
      shipping_cost = COALESCE(?, shipping_cost), packaging_cost = COALESCE(?, packaging_cost)
      WHERE id = ?`, [options.carrier || null, trackingNumber || null, options.shippingCost ?? null, options.packagingCost ?? null, id]);
    run(`UPDATE orders SET fulfillment_status = 'shipped' WHERE id = ?`, [orderId]);
    shipment = get(`SELECT * FROM shipments WHERE id = ?`, [id]);
    run(`UPDATE sales SET tracking_number = COALESCE(?, tracking_number),
      shipping_cost = CASE WHEN ? IS NOT NULL THEN ? ELSE shipping_cost END,
      packaging_cost = CASE WHEN ? IS NOT NULL THEN ? ELSE packaging_cost END
      WHERE order_id = ? OR id = ?`, [shipment.tracking_number, options.shippingCost ?? null, options.shippingCost ?? null,
      options.packagingCost ?? null, options.packagingCost ?? null, orderId, order.sale_id || ""]);
    return shipment;
  });
}
