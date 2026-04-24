import { all, get, run } from "../database.js";
import { LISTING_FIELD_MAP } from "../mappers/fieldMaps.js";
import {
  json,
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
        `INSERT INTO listings (id, card_id, external_listing_id, card_name, card_set, card_number,
         platform, listing_title, listing_description, category_path, item_specifics, shipping_profile,
         image_count, automation_state, pricing_strategy, format, start_price, buy_now_price, auction_end_date,
         shipping, shipping_weight_oz, export_batch_id, current_bid, status, notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          body.card_id,
          body.external_listing_id,
          body.card_name,
          body.card_set,
          body.card_number,
          body.platform,
          body.listing_title,
          body.listing_description,
          body.category_path,
          json(body.item_specifics),
          json(body.shipping_profile),
          body.image_count || 0,
          body.automation_state || "draft",
          body.pricing_strategy || "market",
          body.format || "fixed",
          body.start_price,
          body.buy_now_price,
          body.auction_end_date,
          body.shipping || 0,
          body.shipping_weight_oz || 0,
          body.export_batch_id,
          body.current_bid,
          body.status || "active",
          body.notes,
        ],
      );
      if (body.card_id) {
        run(
          `UPDATE user_items
           SET status = 'listed',
               listing_status = 'listed',
               updated_at = datetime('now')
           WHERE id = ?`,
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
        `UPDATE listings SET card_id=?, external_listing_id=?, card_name=?, card_set=?, card_number=?,
         platform=?, listing_title=?, listing_description=?, category_path=?, item_specifics=?, shipping_profile=?,
         image_count=?, automation_state=?, pricing_strategy=?, format=?, start_price=?, buy_now_price=?, auction_end_date=?,
         shipping=?, shipping_weight_oz=?, export_batch_id=?, current_bid=?, status=?, publish_status=?, sold_price=?, sold_date=?, notes=?
         WHERE id=?`,
        [
          body.card_id,
          body.external_listing_id,
          body.card_name,
          body.card_set,
          body.card_number,
          body.platform,
          body.listing_title,
          body.listing_description,
          body.category_path,
          json(body.item_specifics),
          json(body.shipping_profile),
          body.image_count,
          body.automation_state,
          body.pricing_strategy,
          body.format,
          body.start_price,
          body.buy_now_price,
          body.auction_end_date,
          body.shipping,
          body.shipping_weight_oz,
          body.export_batch_id,
          body.current_bid,
          body.status,
          body.status === "sold" ? "sold" : body.publish_status,
          body.sold_price,
          body.sold_date,
          body.notes,
          req.params.id,
        ],
      );
      if (body.card_id && body.status === "sold") {
        run(
          `UPDATE user_items
           SET status = 'sold',
               listing_status = 'ended',
               sale_status = 'sold',
               sold_at = COALESCE(?, sold_at),
               updated_at = datetime('now')
           WHERE id = ?`,
          [body.sold_date || new Date().toISOString(), body.card_id],
        );
      }
      res.json(
        toCamel(get("SELECT * FROM listings WHERE id = ?", [req.params.id]), LISTING_FIELD_MAP),
      );
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/listings/:id", (req, res) => {
    try {
      const existing = get("SELECT * FROM listings WHERE id = ?", [req.params.id]);
      if (!existing) return res.status(404).json({ error: "Listing not found" });
      run("DELETE FROM listings WHERE id = ?", [req.params.id]);
      if (existing.card_id) {
        const remainingListings = get(
          `SELECT COUNT(*) AS count FROM listings WHERE card_id = ?`,
          [existing.card_id],
        )?.count || 0;
        if (remainingListings === 0) {
          run(
            `UPDATE user_items
             SET status = CASE
                   WHEN sale_status = 'sold' THEN status
                   WHEN status = 'listed' THEN 'inventory'
                   ELSE status
                 END,
                 listing_status = 'not_listed',
                 updated_at = datetime('now')
             WHERE id = ?`,
            [existing.card_id],
          );
        }
      }
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
