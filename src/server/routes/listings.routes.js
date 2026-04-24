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

function deriveOpenItemState(cardId) {
  const listings = all(`SELECT status FROM listings WHERE card_id = ?`, [cardId]);
  if (listings.length === 0) {
    return {
      status: "inventory",
      listingStatus: "not_listed",
      saleStatus: "available",
      soldAt: null,
    };
  }

  const statuses = listings.map((listing) => String(listing.status || "").toLowerCase());
  if (statuses.includes("sold")) {
    return {
      status: "sold",
      listingStatus: "ended",
      saleStatus: "sold",
      soldAt: null,
    };
  }

  const hasPublishedListing = statuses.some((status) => ["active", "revised", "ended"].includes(status));
  return {
    status: "listed",
    listingStatus: hasPublishedListing ? "listed" : "draft",
    saleStatus: "available",
    soldAt: null,
  };
}

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
         shipping, shipping_weight_oz, export_batch_id, current_bid, status, publish_status, sold_price, sold_date, notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
          body.publish_status || body.status || "active",
          body.sold_price ?? null,
          body.sold_date || null,
          body.notes,
        ],
      );
      if (body.card_id) {
        if (body.status === "sold") {
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
        } else {
          const siblingSoldCount = get(
            `SELECT COUNT(*) AS count
             FROM listings
             WHERE card_id = ?
               AND id != ?
               AND status = 'sold'`,
            [body.card_id, id],
          )?.count || 0;
          if (siblingSoldCount === 0) {
            const itemState = deriveOpenItemState(body.card_id);
            run(
              `UPDATE user_items
               SET status = ?,
                   listing_status = ?,
                   sale_status = ?,
                   sold_at = ?,
                   updated_at = datetime('now')
               WHERE id = ?`,
              [
                itemState.status,
                itemState.listingStatus,
                itemState.saleStatus,
                itemState.soldAt,
                body.card_id,
              ],
            );
          }
        }
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
      if (body.card_id) {
        if (body.status === "sold") {
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
        } else if (existing.status === "sold") {
          const siblingSoldCount = get(
            `SELECT COUNT(*) AS count
             FROM listings
             WHERE card_id = ?
               AND id != ?
               AND status = 'sold'`,
            [body.card_id, req.params.id],
          )?.count || 0;
          if (siblingSoldCount === 0) {
            const itemState = deriveOpenItemState(body.card_id);
            run(
              `UPDATE user_items
               SET status = ?,
                   listing_status = ?,
                   sale_status = ?,
                   sold_at = ?,
                   updated_at = datetime('now')
               WHERE id = ?`,
              [
                itemState.status,
                itemState.listingStatus,
                itemState.saleStatus,
                itemState.soldAt,
                body.card_id,
              ],
            );
          }
          run(
            `UPDATE listings
             SET publish_status = CASE
                   WHEN status IN ('draft', 'active', 'revised', 'ended') THEN status
                   ELSE publish_status
                 END,
                 sold_price = NULL,
                 sold_date = NULL
             WHERE id = ?`,
            [req.params.id],
          );
        }
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
        const remainingSoldCount = get(
          `SELECT COUNT(*) AS count
           FROM listings
           WHERE card_id = ?
             AND status = 'sold'`,
          [existing.card_id],
        )?.count || 0;
        const remainingListings = get(
          `SELECT COUNT(*) AS count FROM listings WHERE card_id = ?`,
          [existing.card_id],
        )?.count || 0;
        if (remainingListings === 0) {
          const itemState = deriveOpenItemState(existing.card_id);
          run(
            `UPDATE user_items
             SET status = ?,
                 listing_status = ?,
                 sale_status = ?,
                 sold_at = ?,
                 updated_at = datetime('now')
             WHERE id = ?`,
            [
              itemState.status,
              itemState.listingStatus,
              itemState.saleStatus,
              itemState.soldAt,
              existing.card_id,
            ],
          );
        } else if (existing.status === "sold" && remainingSoldCount === 0) {
          const itemState = deriveOpenItemState(existing.card_id);
          run(
            `UPDATE user_items
             SET status = ?,
                 listing_status = ?,
                 sale_status = ?,
                 sold_at = ?,
                 updated_at = datetime('now')
             WHERE id = ?`,
            [
              itemState.status,
              itemState.listingStatus,
              itemState.saleStatus,
              itemState.soldAt,
              existing.card_id,
            ],
          );
        }
      }
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
