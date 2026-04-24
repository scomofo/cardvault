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

function normalizeStatus(status, fallback = "") {
  return String(status || fallback).toLowerCase();
}

function deriveOpenItemState(cardId) {
  const listings = all(`SELECT status, sold_date, created_at FROM listings WHERE card_id = ?`, [cardId]);
  if (listings.length === 0) {
    return {
      status: "inventory",
      listingStatus: "not_listed",
      saleStatus: "available",
      soldAt: null,
    };
  }

  const statuses = listings.map((listing) => normalizeStatus(listing.status));
  if (statuses.includes("sold")) {
    const soldAt = listings
      .filter((listing) => normalizeStatus(listing.status) === "sold")
      .map((listing) => listing.sold_date || listing.created_at || null)
      .filter(Boolean)
      .reduce((latest, candidate) => {
        if (!latest) return candidate;
        const latestTime = Date.parse(latest);
        const candidateTime = Date.parse(candidate);
        if (Number.isNaN(latestTime) || Number.isNaN(candidateTime)) {
          return latest;
        }
        return candidateTime > latestTime ? candidate : latest;
      }, null);

    return {
      status: "sold",
      listingStatus: "ended",
      saleStatus: "sold",
      soldAt,
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

function derivePublishStatus(status, fallback = null) {
  const normalized = normalizeStatus(status);
  if (["draft", "active", "revised", "ended", "sold"].includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function syncItemState(cardId, fallbackSoldAt = null) {
  if (!cardId) return;

  const itemState = deriveOpenItemState(cardId);
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
      itemState.status === "sold" ? itemState.soldAt || fallbackSoldAt : null,
      cardId,
    ],
  );
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
      if (body.card_id && !get("SELECT id FROM user_items WHERE id = ?", [body.card_id])) {
        return res.status(404).json({ error: "linked item not found" });
      }
      const id = body.id || uid();
      const normalizedStatus = normalizeStatus(body.status, "active");
      run(
        `INSERT INTO listings (id, card_id, external_listing_id, card_name, card_set, card_number,
         platform, listing_title, listing_description, category_path, item_specifics, shipping_profile,
         image_count, automation_state, pricing_strategy, format, start_price, buy_now_price, auction_end_date,
         shipping, shipping_weight_oz, export_batch_id, current_bid, quantity, status, publish_status, publish_error, last_sync_at, sold_price, sold_date, notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
          body.quantity ?? 1,
          normalizedStatus || "active",
          derivePublishStatus(normalizedStatus || "active", body.publish_status || "active"),
          body.publish_error || null,
          body.last_sync_at || null,
          normalizedStatus === "sold" ? (body.sold_price ?? null) : null,
          normalizedStatus === "sold" ? (body.sold_date || null) : null,
          body.notes,
        ],
      );
      syncItemState(
        body.card_id,
        normalizedStatus === "sold" ? body.sold_date || new Date().toISOString() : null,
      );
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
      if (body.card_id && !get("SELECT id FROM user_items WHERE id = ?", [body.card_id])) {
        return res.status(404).json({ error: "linked item not found" });
      }
      const normalizedStatus = normalizeStatus(body.status);
      const nextPublishStatus = derivePublishStatus(normalizedStatus, body.publish_status);
      const nextSoldPrice = normalizedStatus === "sold" ? body.sold_price : null;
      const nextSoldDate = normalizedStatus === "sold" ? body.sold_date : null;
      run(
        `UPDATE listings SET card_id=?, external_listing_id=?, card_name=?, card_set=?, card_number=?,
         platform=?, listing_title=?, listing_description=?, category_path=?, item_specifics=?, shipping_profile=?,
         image_count=?, automation_state=?, pricing_strategy=?, format=?, start_price=?, buy_now_price=?, auction_end_date=?,
         shipping=?, shipping_weight_oz=?, export_batch_id=?, current_bid=?, quantity=?, status=?, publish_status=?, publish_error=?, last_sync_at=?, sold_price=?, sold_date=?, notes=?
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
          body.quantity,
          normalizedStatus,
          nextPublishStatus,
          body.publish_error,
          body.last_sync_at,
          nextSoldPrice,
          nextSoldDate,
          body.notes,
          req.params.id,
        ],
      );
      syncItemState(
        body.card_id,
        normalizedStatus === "sold" ? body.sold_date || new Date().toISOString() : null,
      );
      if (existing.card_id && existing.card_id !== body.card_id) {
        syncItemState(existing.card_id);
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
        syncItemState(existing.card_id);
      }
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
