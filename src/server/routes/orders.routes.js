import { all, get, run } from "../database.js";
import { requireJsonBody, validateNumberLike, sendValidationError } from "../validation/common.js";
import { uid } from "./shared.js";

export function registerOrderRoutes(app) {
  app.get("/api/orders", (_req, res) => {
    try {
      res.json(all(`
        SELECT
          orders.*,
          shipments.id AS shipment_id,
          shipments.tracking_number,
          shipments.label_url,
          shipments.status AS shipment_status,
          shipments.carrier,
          shipments.service_level,
          shipments.shipped_at
        FROM orders
        LEFT JOIN shipments
          ON shipments.id = (
            SELECT id
            FROM shipments
            WHERE order_id = orders.id
            ORDER BY created_at DESC
            LIMIT 1
          )
        ORDER BY orders.sold_at DESC, orders.created_at DESC
      `));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/orders", requireJsonBody, (req, res) => {
    try {
      const body = req.body;
      if (!body.platform) return res.status(400).json({ error: "platform required" });
      const numericChecks = [
        validateNumberLike(body.salePrice ?? body.sale_price, "sale_price"),
        validateNumberLike(body.fees, "fees"),
        validateNumberLike(body.shippingCharge ?? body.shipping_charge, "shipping_charge"),
        validateNumberLike(body.taxCollected ?? body.tax_collected, "tax_collected"),
      ];
      for (const err of numericChecks) {
        if (err) return sendValidationError(res, err);
      }
      const id = body.id || uid();
      run(
        `INSERT INTO orders
         (id, sale_id, listing_id, item_id, platform, external_order_id, buyer_handle, sale_price, fees, shipping_charge, tax_collected, destination_country, destination_postal_code, payment_status, fulfillment_status, sold_at, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`,
        [
          id,
          body.saleId || body.sale_id || null,
          body.listingId || body.listing_id || null,
          body.itemId || body.item_id || null,
          body.platform,
          body.externalOrderId || body.external_order_id || null,
          body.buyerHandle || body.buyer_handle || null,
          body.salePrice || body.sale_price || 0,
          body.fees || 0,
          body.shippingCharge || body.shipping_charge || 0,
          body.taxCollected || body.tax_collected || 0,
          body.destinationCountry || body.destination_country || "CA",
          body.destinationPostalCode || body.destination_postal_code || null,
          body.paymentStatus || body.payment_status || "paid",
          body.fulfillmentStatus || body.fulfillment_status || "pending",
          body.soldAt || body.sold_at || new Date().toISOString(),
        ],
      );
      if (body.saleId || body.sale_id) {
        run(
          `UPDATE sales
           SET order_id = COALESCE(order_id, ?)
           WHERE id = ?`,
          [id, body.saleId || body.sale_id],
        );
      }
      if (body.listingId || body.listing_id) {
        run(
          `UPDATE listings
           SET status = 'sold',
               publish_status = 'sold',
               sold_price = COALESCE(sold_price, ?),
               sold_date = COALESCE(sold_date, ?)
           WHERE id = ?`,
          [
            body.salePrice || body.sale_price || 0,
            body.soldAt || body.sold_at || new Date().toISOString(),
            body.listingId || body.listing_id,
          ],
        );
      }
      if (body.itemId || body.item_id) {
        run(
          `UPDATE user_items
           SET status = 'sold',
               listing_status = CASE WHEN ? IS NOT NULL THEN 'ended' ELSE listing_status END,
               sale_status = 'sold',
               sold_at = COALESCE(?, sold_at),
               updated_at = datetime('now')
           WHERE id = ?`,
          [
            body.listingId || body.listing_id || null,
            body.soldAt || body.sold_at || new Date().toISOString(),
            body.itemId || body.item_id,
          ],
        );
      }
      res.status(201).json(get(`SELECT * FROM orders WHERE id = ?`, [id]));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
