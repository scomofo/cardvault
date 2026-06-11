import { all, run } from "../../database.js";
import { uid } from "../../routes/shared.js";
import { getMarketplaceAdapter } from "../../integrations/marketplaces/marketplaceRegistry.js";
import { refreshListingAggregateState } from "../marketplaces/listingAggregateState.js";

const SUPPORTED_EXPORT_TYPES = new Set(["csv"]);
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9_-]+$/;
const HANDOFF_MARKETPLACES = new Set(["comc", "consignment"]);

function normalizeMarketplace(marketplace) {
  if (typeof marketplace !== "string" || !marketplace.trim()) {
    throw new Error("marketplace is required");
  }

  const normalized = marketplace.trim().toLowerCase();
  if (!SAFE_PATH_SEGMENT.test(normalized)) {
    throw new Error("marketplace contains invalid characters");
  }

  return normalized;
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (value) => {
    const normalized = String(value ?? "").replace(/\r\n|\r|\n/g, " ");
    return `"${normalized.replace(/"/g, '""')}"`;
  };
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => esc(row[header])).join(",")),
  ].join("\n");
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function addChannelEvent(channelId, eventType, status, payload) {
  run(
    `INSERT INTO listing_channel_events (id, listing_channel_id, event_type, status, payload)
     VALUES (?,?,?,?,?)`,
    [uid(), channelId, eventType, status || null, JSON.stringify(payload || {})],
  );
}

function findChannelsForListings(listingIds, marketplace) {
  if (!listingIds.length) return [];
  return all(
    `SELECT *
     FROM listing_channels
     WHERE marketplace = ?
       AND listing_id IN (${listingIds.map(() => "?").join(",")})`,
    [marketplace, ...listingIds],
  );
}

function attachChannelHandoff(listings, channels) {
  const channelByListingId = new Map(channels.map((channel) => [channel.listing_id, channel]));
  return listings.map((listing) => {
    const channel = channelByListingId.get(listing.id);
    const overrides = parseJsonObject(channel?.overrides);
    return {
      ...listing,
      handoff: overrides.handoff || null,
    };
  });
}

function markHandoffExported({ channels, exportId, marketplace, filePath }) {
  const exportedAt = new Date().toISOString();
  const exportedListingIds = [];

  for (const channel of channels) {
    const overrides = parseJsonObject(channel.overrides);
    const handoff = {
      ...(overrides.handoff || {}),
      submissionStatus: "exported",
      exportId,
      exportedAt,
      filePath,
    };
    const nextOverrides = {
      ...overrides,
      handoff,
    };

    run(
      `UPDATE listing_channels
       SET status = 'handoff_exported',
           publish_error = NULL,
           overrides = ?,
           last_sync_at = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ?`,
      [JSON.stringify(nextOverrides), channel.id],
    );
    addChannelEvent(channel.id, "handoff_export", "handoff_exported", {
      listingId: channel.listing_id,
      marketplace,
      exportId,
      filePath,
      previousStatus: channel.status,
      handoff,
    });
    refreshListingAggregateState(channel.listing_id, { syncedAt: exportedAt });
    exportedListingIds.push(channel.listing_id);
  }

  return exportedListingIds;
}

/**
 * Export listings as CSV for a specific marketplace.
 * @param {{ marketplace: string, listingIds?: string[], exportType?: string }} options
 * @returns {{ exportId: string, csvContent: string, listingCount: number }}
 */
export function exportListingsForMarketplace({ marketplace, listingIds = [], exportType = "csv" }) {
  const normalizedMarketplace = normalizeMarketplace(marketplace);
  if (!SUPPORTED_EXPORT_TYPES.has(exportType)) {
    throw new Error(`Unsupported export type: ${exportType}`);
  }

  const adapter = getMarketplaceAdapter(normalizedMarketplace);
  const listings = listingIds.length
    ? all(`SELECT * FROM listings WHERE id IN (${listingIds.map(() => "?").join(",")})`, listingIds)
    : all(
        `SELECT DISTINCT listings.*
         FROM listings
         INNER JOIN listing_channels
           ON listing_channels.listing_id = listings.id
         WHERE listing_channels.marketplace = ?
           AND listing_channels.status IN ('draft', 'active', 'revised', 'handoff_ready')`,
        [normalizedMarketplace],
      );

  if (!listings.length) {
    throw new Error("No listings available for export");
  }

  const channels = findChannelsForListings(listings.map((listing) => listing.id), normalizedMarketplace);
  const rows = attachChannelHandoff(listings, channels).map((listing) => adapter.mapForExport(listing));
  const csv = toCsv(rows);
  const exportId = uid();
  const filePath = `exports/${normalizedMarketplace}_${new Date().toISOString().slice(0, 10)}.${exportType}`;

  run(
    `INSERT INTO listing_exports (id, listing_batch_id, export_type, export_status, file_path, item_count, exported_at)
     VALUES (?,?,?,?,?,?,datetime('now'))`,
    [exportId, null, `${normalizedMarketplace}_${exportType}`, "completed", filePath, listings.length],
  );

  const exportedListingIds = HANDOFF_MARKETPLACES.has(normalizedMarketplace)
    ? markHandoffExported({ channels, exportId, marketplace: normalizedMarketplace, filePath })
    : [];

  return {
    exportId,
    marketplace: normalizedMarketplace,
    exportType,
    itemCount: listings.length,
    filePath,
    content: csv,
    handoff: HANDOFF_MARKETPLACES.has(normalizedMarketplace)
      ? { status: "handoff_exported", listingIds: exportedListingIds }
      : undefined,
  };
}
