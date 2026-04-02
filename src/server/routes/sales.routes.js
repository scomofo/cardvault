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
      run(
        `INSERT INTO sales (id, card_id, card_name, card_set, sale_price,
         cost_basis, platform, fees, shipping_cost, net_profit, listing_id, date)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          body.card_id,
          body.card_name,
          body.card_set,
          body.sale_price,
          body.cost_basis || 0,
          body.platform,
          body.fees || 0,
          body.shipping_cost || 0,
          body.net_profit || 0,
          body.listing_id,
          body.date || new Date().toISOString(),
        ],
      );
      if (body.card_id) {
        run(
          "UPDATE user_items SET status = 'sold', updated_at = datetime('now') WHERE id = ?",
          [body.card_id],
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
