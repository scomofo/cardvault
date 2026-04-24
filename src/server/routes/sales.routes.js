import { all, get, run } from "../database.js";
import { SALE_FIELD_MAP } from "../mappers/fieldMaps.js";
import {
  toCamel,
  toCamelArray,
  toSnake,
} from "../mappers/recordMappers.js";
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
          `SELECT id, item_id, listing_id, sale_price, sold_at
           FROM orders
           WHERE id = ?`,
          [linkedOrderId],
        )
        : null;
      const linkedListingId = body.listing_id || linkedOrder?.listing_id || null;
      const linkedCardId = body.card_id || linkedOrder?.item_id || get(
        "SELECT card_id FROM listings WHERE id = ?",
        [linkedListingId],
      )?.card_id || null;
      const saleDate = body.date || linkedOrder?.sold_at || new Date().toISOString();
      const salePrice = body.sale_price ?? linkedOrder?.sale_price ?? 0;
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
          body.platform,
          body.buyer_handle,
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
        run(
          `UPDATE listings
           SET status = 'sold',
               publish_status = 'sold',
                sold_price = COALESCE(sold_price, ?),
                sold_date = COALESCE(sold_date, ?)
            WHERE id = ?`,
          [salePrice, saleDate, linkedListingId],
        );
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
}
