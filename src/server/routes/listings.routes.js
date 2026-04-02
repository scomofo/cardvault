import { all, get, run } from "../database.js";
import { LISTING_FIELD_MAP } from "../mappers/fieldMaps.js";
import {
  toCamel,
  toCamelArray,
  toSnake,
} from "../mappers/recordMappers.js";
import { validateListingPayload } from "../validation/writeValidators.js";
import { uid } from "./shared.js";

export function registerListingRoutes(app) {
  app.get("/api/listings", (req, res) => {
    try {
      const { status } = req.query;
      let sql = "SELECT * FROM listings";
      const params = [];
      if (status) {
        sql += " WHERE status = ?";
        params.push(status);
      }
      sql += " ORDER BY created_at DESC";
      res.json(toCamelArray(all(sql, params), LISTING_FIELD_MAP));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/listings", validateListingPayload, (req, res) => {
    try {
      const body = toSnake(req.body);
      const id = body.id || uid();
      run(
        `INSERT INTO listings (id, card_id, card_name, card_set, card_number,
         platform, format, start_price, buy_now_price, auction_end_date,
         shipping, current_bid, status, notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          body.card_id,
          body.card_name,
          body.card_set,
          body.card_number,
          body.platform,
          body.format || "fixed",
          body.start_price,
          body.buy_now_price,
          body.auction_end_date,
          body.shipping || 0,
          body.current_bid,
          body.status || "active",
          body.notes,
        ],
      );
      if (body.card_id) {
        run(
          "UPDATE user_items SET status = 'listed', updated_at = datetime('now') WHERE id = ?",
          [body.card_id],
        );
      }
      res
        .status(201)
        .json(
          toCamel(get("SELECT * FROM listings WHERE id = ?", [id]), LISTING_FIELD_MAP),
        );
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/listings/:id", validateListingPayload, (req, res) => {
    try {
      const existing = get("SELECT * FROM listings WHERE id = ?", [req.params.id]);
      if (!existing) return res.status(404).json({ error: "Listing not found" });
      const body = { ...existing, ...toSnake(req.body) };
      run(
        `UPDATE listings SET card_id=?, card_name=?, card_set=?, card_number=?,
         platform=?, format=?, start_price=?, buy_now_price=?, auction_end_date=?,
         shipping=?, current_bid=?, status=?, sold_price=?, sold_date=?, notes=?
         WHERE id=?`,
        [
          body.card_id,
          body.card_name,
          body.card_set,
          body.card_number,
          body.platform,
          body.format,
          body.start_price,
          body.buy_now_price,
          body.auction_end_date,
          body.shipping,
          body.current_bid,
          body.status,
          body.sold_price,
          body.sold_date,
          body.notes,
          req.params.id,
        ],
      );
      res.json(
        toCamel(get("SELECT * FROM listings WHERE id = ?", [req.params.id]), LISTING_FIELD_MAP),
      );
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/listings/:id", (req, res) => {
    try {
      const result = run("DELETE FROM listings WHERE id = ?", [req.params.id]);
      if (result.changes === 0) return res.status(404).json({ error: "Listing not found" });
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
