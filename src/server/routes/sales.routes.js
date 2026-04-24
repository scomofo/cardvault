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
      const linkedListingId = body.listing_id || null;
      const linkedCardId = body.card_id || get(
        "SELECT card_id FROM listings WHERE id = ?",
        [linkedListingId],
      )?.card_id || null;
      run(
        `INSERT INTO sales (id, card_id, order_id, card_name, card_set, sale_price,
         cost_basis, platform, buyer_handle, fees, shipping_cost, packaging_cost,
         grading_cost, tax_collected, payout_amount, net_profit, listing_id, date)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          linkedCardId,
          body.order_id,
          body.card_name,
          body.card_set,
          body.sale_price,
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
          body.listing_id,
          body.date || new Date().toISOString(),
        ],
      );
      if (body.order_id) {
        run(
          `UPDATE orders
           SET sale_id = COALESCE(sale_id, ?)
           WHERE id = ?`,
          [id, body.order_id],
        );
      }
      if (body.listing_id) {
        run(
          `UPDATE listings
           SET status = 'sold',
               publish_status = 'sold',
               sold_price = COALESCE(sold_price, ?),
               sold_date = COALESCE(sold_date, ?)
           WHERE id = ?`,
          [body.sale_price || 0, body.date || new Date().toISOString(), body.listing_id],
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
            body.listing_id || null,
            body.net_profit || 0,
            body.date || new Date().toISOString(),
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
