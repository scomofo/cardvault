import { all, get, run } from "../../database.js";
import { uid } from "../../routes/shared.js";
import { getMarketplaceAdapter } from "../../integrations/marketplaces/marketplaceRegistry.js";

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
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
  const adapter = getMarketplaceAdapter(marketplace);
  const listings = listingIds.length
    ? all(`SELECT * FROM listings WHERE id IN (${listingIds.map(() => "?").join(",")})`, listingIds)
    : all(`SELECT * FROM listings WHERE platform = ? OR publish_status IN ('draft', 'active', 'revised')`, [marketplace]);

  if (!listings.length) {
    throw new Error("No listings available for export");
  }

  const rows = listings.map((listing) => adapter.mapForExport(listing));
  const csv = toCsv(rows);
  const exportId = uid();
  const filePath = `exports/${marketplace}_${new Date().toISOString().slice(0, 10)}.${exportType}`;

  run(
    `INSERT INTO listing_exports (id, listing_batch_id, export_type, export_status, file_path, item_count, exported_at)
     VALUES (?,?,?,?,?,?,datetime('now'))`,
    [exportId, null, `${marketplace}_${exportType}`, "completed", filePath, listings.length],
  );

  return {
    exportId,
    marketplace,
    exportType,
    itemCount: listings.length,
    filePath,
    content: csv,
  };
}
