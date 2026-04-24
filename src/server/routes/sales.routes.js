import { all, get, run } from "../database.js";
import { SALE_FIELD_MAP } from "../mappers/fieldMaps.js";
import {
  toCamel,
  toCamelArray,
  toSnake,
} from "../mappers/recordMappers.js";
import { markListingSold, restoreListingAfterOperationalDelete, syncItemState } from "../services/listingStateSync.js";
import { requireJsonBody } from "../validation/common.js";
import { validateSalePayload } from "../validation/writeValidators.js";
import { uid } from "./shared.js";

export function registerSalesRoutes(app) {
  app.get("/api/sales", (_req, res) => {
    try {
      res.json(toCamelArray(all("SELECT * FROM sales ORDER BY date DESC"), SALE_FIELD_MAP));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sales", validateSalePayload, (req, res) => {
    try {
      const body = toSnake(req.body);
      const id = body.id || uid();
      const linkedOrderId = body.order_id || null;
      const linkedOrder = linkedOrderId
        ? get(
          `SELECT id, item_id, listing_id, sale_price, sold_at, platform, buyer_handle, sale_id
           FROM orders
            WHERE id = ?`,
          [linkedOrderId],
        )
        : null;
      if (linkedOrderId && !linkedOrder) {
        return res.status(404).json({ error: "linked order not found" });
      }
      if (
        linkedOrder
        && body.listing_id
        && body.listing_id !== linkedOrder.listing_id
      ) {
        return res.status(409).json({ error: "listing does not match linked order" });
      }
      if (
        linkedOrder
        && body.card_id
        && body.card_id !== linkedOrder.item_id
      ) {
        return res.status(409).json({ error: "item does not match linked order" });
      }
      if (
        linkedOrder
        && body.platform
        && body.platform !== linkedOrder.platform
      ) {
        return res.status(409).json({ error: "platform does not match linked order" });
      }
      if (
        linkedOrder
        && body.sale_price != null
        && Number(body.sale_price) !== Number(linkedOrder.sale_price)
      ) {
        return res.status(409).json({ error: "sale price does not match linked order" });
      }
      if (
        linkedOrder
        && body.buyer_handle
        && body.buyer_handle !== linkedOrder.buyer_handle
      ) {
        return res.status(409).json({ error: "buyer handle does not match linked order" });
      }
      if (
        linkedOrder
        && body.date
        && body.date !== linkedOrder.sold_at
      ) {
        return res.status(409).json({ error: "date does not match linked order" });
      }
      const linkedListingId = body.listing_id || linkedOrder?.listing_id || null;
      const listingRecord = linkedListingId
        ? get("SELECT id, card_id FROM listings WHERE id = ?", [linkedListingId])
        : null;
      if (linkedListingId && !listingRecord) {
        return res.status(404).json({ error: "linked listing not found" });
      }
      if (linkedOrder?.item_id && listingRecord?.card_id && linkedOrder.item_id !== listingRecord.card_id) {
        return res.status(409).json({ error: "linked order item does not match linked listing" });
      }
      if (body.card_id && listingRecord?.card_id && body.card_id !== listingRecord.card_id) {
        return res.status(409).json({ error: "item does not match listing" });
      }
      const linkedCardId = body.card_id || linkedOrder?.item_id || listingRecord?.card_id || null;
      const itemRecord = linkedCardId
        ? get("SELECT id FROM user_items WHERE id = ?", [linkedCardId])
        : null;
      if (linkedCardId && !itemRecord) {
        return res.status(404).json({ error: "linked item not found" });
      }
      const saleDate = body.date || linkedOrder?.sold_at || new Date().toISOString();
      const salePrice = body.sale_price ?? linkedOrder?.sale_price ?? 0;
      const resolvedPlatform = body.platform || linkedOrder?.platform || null;
      const resolvedBuyerHandle = body.buyer_handle || linkedOrder?.buyer_handle || null;
      if (linkedOrder?.sale_id) {
        return res.status(409).json({ error: "order already linked to a sale" });
      }
      run(
        `INSERT INTO sales (id, card_id, order_id, card_name, card_set, sale_price,
         cost_basis, platform, buyer_handle, fees, shipping_cost, packaging_cost,
         grading_cost, tax_collected, payout_amount, net_profit, listing_id, date)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          linkedCardId,
          linkedOrderId,
          body.card_name,
          body.card_set,
          salePrice,
          body.cost_basis || 0,
          resolvedPlatform,
          resolvedBuyerHandle,
          body.fees || 0,
          body.shipping_cost || 0,
          body.packaging_cost || 0,
          body.grading_cost || 0,
          body.tax_collected || 0,
          body.payout_amount || 0,
          body.net_profit || 0,
          linkedListingId,
          saleDate,
        ],
      );
      if (linkedOrderId) {
        run(
          `UPDATE orders
           SET sale_id = COALESCE(sale_id, ?)
           WHERE id = ?`,
          [id, linkedOrderId],
        );
      }
      if (linkedListingId) {
        markListingSold(linkedListingId, salePrice, saleDate);
      }
      if (linkedCardId) {
        run(
          `UPDATE user_items
           SET status = 'sold',
               listing_status = CASE WHEN ? IS NOT NULL THEN 'ended' ELSE listing_status END,
               sale_status = 'sold',
               profit_realized = ?,
               sold_at = ?,
               updated_at = datetime('now')
            WHERE id = ?`,
          [
            linkedListingId,
            body.net_profit || 0,
            saleDate,
            linkedCardId,
          ],
        );
      }
      res
        .status(201)
        .json(toCamel(get("SELECT * FROM sales WHERE id = ?", [id]), SALE_FIELD_MAP));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/sales/:id", requireJsonBody, (req, res) => {
    try {
      const existing = get("SELECT * FROM sales WHERE id = ?", [req.params.id]);
      if (!existing) return res.status(404).json({ error: "Sale not found" });

      const body = { ...existing, ...toSnake(req.body) };
      run(
        `UPDATE sales SET
          card_id=?, order_id=?, card_name=?, card_set=?, sale_price=?, cost_basis=?,
          platform=?, buyer_handle=?, fees=?, shipping_cost=?, packaging_cost=?,
          grading_cost=?, tax_collected=?, payout_amount=?, net_profit=?,
          tracking_number=?, listing_id=?, date=?
         WHERE id=?`,
        [
          body.card_id,
          body.order_id,
          body.card_name,
          body.card_set,
          body.sale_price ?? 0,
          body.cost_basis ?? 0,
          body.platform,
          body.buyer_handle,
          body.fees ?? 0,
          body.shipping_cost ?? 0,
          body.packaging_cost ?? 0,
          body.grading_cost ?? 0,
          body.tax_collected ?? 0,
          body.payout_amount ?? 0,
          body.net_profit ?? 0,
          body.tracking_number ?? null,
          body.listing_id,
          body.date,
          req.params.id,
        ],
      );

      res.json(toCamel(get("SELECT * FROM sales WHERE id = ?", [req.params.id]), SALE_FIELD_MAP));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/sales/:id", (req, res) => {
    try {
      const existing = get("SELECT * FROM sales WHERE id = ?", [req.params.id]);
      if (!existing) return res.status(404).json({ error: "Sale not found" });

      const result = run("DELETE FROM sales WHERE id = ?", [req.params.id]);
      if (existing.order_id) {
        run(
          `UPDATE orders
           SET sale_id = NULL
           WHERE id = ?`,
          [existing.order_id],
        );
      }
      if (existing.listing_id) {
        restoreListingAfterOperationalDelete(existing.listing_id);
      }
      if (existing.card_id) {
        syncItemState(existing.card_id);
      }
      if (result.changes === 0) return res.status(404).json({ error: "Sale not found" });
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
