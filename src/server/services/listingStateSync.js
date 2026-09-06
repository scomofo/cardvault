import { all, get, run } from "../database.js";

function normalizeStatus(status, fallback = "") {
  return String(status || fallback).toLowerCase();
}

export function deriveOpenItemState(cardId) {
  const listings = all("SELECT status, sold_date, created_at FROM listings WHERE card_id = ?", [cardId]);
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

  const hasPublishedListing = statuses.some((status) => ["active", "revised"].includes(status));
  return {
    status: hasPublishedListing ? "listed" : "inventory",
    listingStatus: hasPublishedListing ? "listed" : statuses.includes("draft") ? "draft" : "not_listed",
    saleStatus: "available",
    soldAt: null,
  };
}

export function syncItemState(cardId, fallbackSoldAt = null) {
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

function listingStateKey(listingId) {
  return `listing_pre_sale_state:${listingId}`;
}

export function markListingSold(listingId, salePrice, soldAt) {
  if (!listingId) return;

  const listing = get(
    `SELECT id, status, publish_status, sold_price, sold_date
     FROM listings
     WHERE id = ?`,
    [listingId],
  );
  if (!listing) return;

  if (normalizeStatus(listing.status) !== "sold") {
    run(
      `INSERT INTO settings (key, value)
       VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [
        listingStateKey(listingId),
        JSON.stringify({
          status: listing.status,
          publishStatus: listing.publish_status,
          soldPrice: listing.sold_price ?? null,
          soldDate: listing.sold_date ?? null,
        }),
      ],
    );
  }

  run(
    `UPDATE listings
     SET status = 'sold',
         publish_status = 'sold',
         sold_price = COALESCE(sold_price, ?),
         sold_date = COALESCE(sold_date, ?)
     WHERE id = ?`,
    [salePrice, soldAt, listingId],
  );
}

export function restoreListingAfterOperationalDelete(listingId) {
  if (!listingId) return;

  const listing = get(
    `SELECT id, status, publish_status
     FROM listings
     WHERE id = ?`,
    [listingId],
  );
  if (!listing) return;

  const remainingSale = get("SELECT id FROM sales WHERE listing_id = ? LIMIT 1", [listingId]);
  const remainingOrder = get("SELECT id FROM orders WHERE listing_id = ? LIMIT 1", [listingId]);
  if (remainingSale || remainingOrder) {
    return;
  }

  const storedState = get("SELECT value FROM settings WHERE key = ?", [listingStateKey(listingId)]);
  if (storedState?.value) {
    try {
      const parsed = JSON.parse(storedState.value);
      run(
        `UPDATE listings
         SET status = ?,
             publish_status = ?,
             sold_price = ?,
             sold_date = ?
         WHERE id = ?`,
        [
          parsed.status || "draft",
          parsed.publishStatus || parsed.status || "draft",
          parsed.soldPrice ?? null,
          parsed.soldDate ?? null,
          listingId,
        ],
      );
    } catch {
      run(
        `UPDATE listings
         SET status = 'draft',
             publish_status = 'draft',
             sold_price = NULL,
             sold_date = NULL
         WHERE id = ?`,
        [listingId],
      );
    }
    run("DELETE FROM settings WHERE key = ?", [listingStateKey(listingId)]);
    return;
  }

  if (normalizeStatus(listing.status) === "sold") {
    run(
      `UPDATE listings
       SET status = 'active',
           publish_status = CASE
             WHEN publish_status = 'sold' THEN 'active'
             ELSE publish_status
           END,
           sold_price = NULL,
           sold_date = NULL
       WHERE id = ?`,
      [listingId],
    );
  }
}
