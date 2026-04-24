import { all, get, run } from "../../database.js";
import { uid } from "../../routes/shared.js";
import { getMarketplaceAdapter } from "../../integrations/marketplaces/marketplaceRegistry.js";

const SUPPORTED_EXPORT_TYPES = new Set(["csv"]);
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9_-]+$/;

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
    : all(`SELECT * FROM listings WHERE platform = ? AND publish_status IN ('draft', 'active', 'revised')`, [normalizedMarketplace]);

  if (!listings.length) {
    throw new Error("No listings available for export");
  }

  const rows = listings.map((listing) => adapter.mapForExport(listing));
  const csv = toCsv(rows);
  const exportId = uid();
  const filePath = `exports/${normalizedMarketplace}_${new Date().toISOString().slice(0, 10)}.${exportType}`;

  run(
    `INSERT INTO listing_exports (id, listing_batch_id, export_type, export_status, file_path, item_count, exported_at)
     VALUES (?,?,?,?,?,?,datetime('now'))`,
    [exportId, null, `${normalizedMarketplace}_${exportType}`, "completed", filePath, listings.length],
  );

  return {
    exportId,
    marketplace: normalizedMarketplace,
    exportType,
    itemCount: listings.length,
    filePath,
    content: csv,
  };
}
