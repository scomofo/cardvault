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
      const linkedSaleId = body.saleId || body.sale_id || null;
      const linkedSale = linkedSaleId
        ? get(
          `SELECT id, card_id, listing_id, order_id, sale_price, net_profit, date, platform, buyer_handle
           FROM sales
           WHERE id = ?`,
          [linkedSaleId],
        )
        : null;
      if (linkedSaleId && !linkedSale) {
        return res.status(404).json({ error: "linked sale not found" });
      }
      if (
        linkedSale
        && (body.listingId || body.listing_id)
        && (body.listingId || body.listing_id) !== linkedSale.listing_id
      ) {
        return res.status(409).json({ error: "listing does not match linked sale" });
      }
      if (
        linkedSale
        && (body.itemId || body.item_id)
        && (body.itemId || body.item_id) !== linkedSale.card_id
      ) {
        return res.status(409).json({ error: "item does not match linked sale" });
      }
      if (
        linkedSale
        && body.platform
        && body.platform !== linkedSale.platform
      ) {
        return res.status(409).json({ error: "platform does not match linked sale" });
      }
      if (
        linkedSale
        && (body.salePrice != null || body.sale_price != null)
        && Number(body.salePrice ?? body.sale_price) !== Number(linkedSale.sale_price)
      ) {
        return res.status(409).json({ error: "sale price does not match linked sale" });
      }
      if (
        linkedSale
        && (body.buyerHandle || body.buyer_handle)
        && (body.buyerHandle || body.buyer_handle) !== linkedSale.buyer_handle
      ) {
        return res.status(409).json({ error: "buyer handle does not match linked sale" });
      }
      if (
        linkedSale
        && (body.soldAt || body.sold_at)
        && (body.soldAt || body.sold_at) !== linkedSale.date
      ) {
        return res.status(409).json({ error: "sold_at does not match linked sale" });
      }
      const resolvedPlatform = body.platform || linkedSale?.platform || null;
      if (!resolvedPlatform) return res.status(400).json({ error: "platform required" });
      const resolvedSalePrice = body.salePrice ?? body.sale_price ?? linkedSale?.sale_price;
      const numericChecks = [
        validateNumberLike(resolvedSalePrice, "sale_price"),
        validateNumberLike(body.fees, "fees"),
        validateNumberLike(body.shippingCharge ?? body.shipping_charge, "shipping_charge"),
        validateNumberLike(body.taxCollected ?? body.tax_collected, "tax_collected"),
      ];
      for (const err of numericChecks) {
        if (err) return sendValidationError(res, err);
      }
      if (linkedSale?.order_id) {
        return res.status(409).json({ error: "sale already linked to an order" });
      }
      const id = body.id || uid();
      const linkedListingId = body.listingId || body.listing_id || linkedSale?.listing_id || null;
      const linkedItemId = body.itemId || body.item_id || linkedSale?.card_id || get(
        "SELECT card_id FROM listings WHERE id = ?",
        [linkedListingId],
      )?.card_id || null;
      const soldAt = body.soldAt || body.sold_at || linkedSale?.date || new Date().toISOString();
      run(
        `INSERT INTO orders
         (id, sale_id, listing_id, item_id, platform, external_order_id, buyer_handle, sale_price, fees, shipping_charge, tax_collected, destination_country, destination_postal_code, payment_status, fulfillment_status, sold_at, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`,
        [
          id,
          linkedSaleId,
          linkedListingId,
          linkedItemId,
          resolvedPlatform,
          body.externalOrderId || body.external_order_id || null,
          body.buyerHandle || body.buyer_handle || linkedSale?.buyer_handle || null,
          resolvedSalePrice || 0,
          body.fees || 0,
          body.shippingCharge || body.shipping_charge || 0,
          body.taxCollected || body.tax_collected || 0,
          body.destinationCountry || body.destination_country || "CA",
          body.destinationPostalCode || body.destination_postal_code || null,
          body.paymentStatus || body.payment_status || "paid",
          body.fulfillmentStatus || body.fulfillment_status || "pending",
          soldAt,
        ],
      );
      if (linkedSaleId) {
        run(
          `UPDATE sales
           SET order_id = COALESCE(order_id, ?)
           WHERE id = ?`,
          [id, linkedSaleId],
        );
      }
      if (linkedListingId) {
        run(
          `UPDATE listings
           SET status = 'sold',
               publish_status = 'sold',
               sold_price = COALESCE(sold_price, ?),
               sold_date = COALESCE(sold_date, ?)
           WHERE id = ?`,
          [
            resolvedSalePrice || 0,
            soldAt,
            linkedListingId,
          ],
        );
      }
      if (linkedItemId) {
        run(
          `UPDATE user_items
           SET status = 'sold',
                listing_status = CASE WHEN ? IS NOT NULL THEN 'ended' ELSE listing_status END,
                sale_status = 'sold',
                profit_realized = CASE
                  WHEN profit_realized IS NULL OR profit_realized = 0 THEN ?
                  ELSE profit_realized
                END,
                sold_at = COALESCE(?, sold_at),
                updated_at = datetime('now')
             WHERE id = ?`,
          [
            linkedListingId,
            linkedSale?.net_profit || 0,
            soldAt,
            linkedItemId,
          ],
        );
      }
      res.status(201).json(get(`SELECT * FROM orders WHERE id = ?`, [id]));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
