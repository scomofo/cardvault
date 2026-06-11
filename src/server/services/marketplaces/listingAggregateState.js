import { all, get, run } from "../../database.js";

const ACTIVE_CHANNEL_STATUSES = new Set(["draft", "active", "revised"]);
const HANDOFF_CHANNEL_STATUSES = new Set(["handoff_ready"]);

function deriveAggregateState(channels) {
  const statuses = channels
    .map((channel) => String(channel.status || "").toLowerCase())
    .filter(Boolean);

  if (statuses.includes("sold")) {
    return { status: "sold", publishStatus: "sold" };
  }

  if (statuses.some((status) => ACTIVE_CHANNEL_STATUSES.has(status))) {
    if (statuses.includes("active")) {
      return { status: "active", publishStatus: "active" };
    }
    if (statuses.includes("revised")) {
      return { status: "active", publishStatus: "revised" };
    }
    return { status: "active", publishStatus: "draft" };
  }

  if (statuses.some((status) => HANDOFF_CHANNEL_STATUSES.has(status))) {
    return { status: "active", publishStatus: "handoff_ready" };
  }

  if (statuses.includes("ended")) {
    return { status: "ended", publishStatus: "ended" };
  }

  return { status: "draft", publishStatus: "draft" };
}

export function refreshListingAggregateState(listingId, { syncedAt = null } = {}) {
  const listing = get(`SELECT * FROM listings WHERE id = ?`, [listingId]);
  if (!listing) {
    throw new Error("Listing not found");
  }

  const channels = all(
    `SELECT * FROM listing_channels WHERE listing_id = ? ORDER BY updated_at DESC, created_at DESC`,
    [listingId],
  );

  if (channels.length === 0) {
    return listing;
  }

  const primaryChannel = channels.find((channel) => channel.marketplace === listing.platform) || null;
  const { status, publishStatus } = deriveAggregateState(channels);

  run(
    `UPDATE listings
     SET publish_status = ?,
         external_listing_id = ?,
         last_sync_at = COALESCE(?, last_sync_at),
         status = ?
     WHERE id = ?`,
    [
      publishStatus,
      primaryChannel?.external_listing_id || listing.external_listing_id || null,
      syncedAt,
      status,
      listingId,
    ],
  );

  return get(`SELECT * FROM listings WHERE id = ?`, [listingId]);
}
