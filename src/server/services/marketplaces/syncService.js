import { all, get, run, runInImmediateTransaction } from "../../database.js";
import { uid } from "../../routes/shared.js";
import { getMarketplaceAdapter, listSupportedMarketplaces } from "../../integrations/marketplaces/marketplaceRegistry.js";
import { reconcileSyncResult } from "./syncReconciler.js";

function validateSyncInputs(marketplace, listingId) {
  if (typeof marketplace !== "string" || !marketplace.trim()) {
    throw new Error("marketplace is required");
  }

  const normalizedMarketplace = marketplace.trim().toLowerCase();
  if (!listSupportedMarketplaces().includes(normalizedMarketplace)) {
    throw new Error(`Unsupported marketplace: ${marketplace}`);
  }

  if (listingId != null && typeof listingId !== "string" && typeof listingId !== "number") {
    throw new Error("listingId must be a string or number");
  }

  return {
    marketplace: normalizedMarketplace,
    listingId: listingId == null ? null : String(listingId),
  };
}

function insertSyncedSale(listing, channel, synced) {
  if (!listing.sold_price && synced.status !== "sold") return null;
  const saleId = uid();
  const salePrice = Number(listing.sold_price || listing.start_price || 0);
  const inserted = run(
    `INSERT INTO sales
     (id, card_id, order_id, card_name, card_set, sale_price, cost_basis, platform, buyer_handle, fees, shipping_cost, packaging_cost, grading_cost, tax_collected, payout_amount, net_profit, listing_id, date)
     SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
     WHERE NOT EXISTS (SELECT 1 FROM sales WHERE listing_id = ?)`,
    [
      saleId,
      listing.card_id,
      null,
      listing.card_name,
      listing.card_set,
      salePrice,
      0,
      channel.marketplace,
      null,
      0,
      listing.shipping || 0,
      0,
      0,
      0,
      salePrice,
      salePrice - Number(listing.shipping || 0),
      listing.id,
      synced.syncedAt,
      listing.id,
    ],
  );

  if (inserted.changes === 0) {
    return get(`SELECT * FROM sales WHERE listing_id = ?`, [listing.id]);
  }

  return get(`SELECT * FROM sales WHERE id = ?`, [saleId]);
}

/**
 * Sync listing status with a marketplace.
 * @param {string} marketplace
 * @param {string|null} [listingId]
 * @returns {Promise<object[]>}
 */
export async function syncMarketplaceListings(marketplace, listingId = null) {
  const normalizedInputs = validateSyncInputs(marketplace, listingId);
  const adapter = getMarketplaceAdapter(normalizedInputs.marketplace);
  const channels = normalizedInputs.listingId
    ? all(`SELECT * FROM listing_channels WHERE marketplace = ? AND listing_id = ?`, [normalizedInputs.marketplace, normalizedInputs.listingId])
    : all(`SELECT * FROM listing_channels WHERE marketplace = ?`, [normalizedInputs.marketplace]);

  const results = [];
  for (const channel of channels) {
    const listing = get(`SELECT * FROM listings WHERE id = ?`, [channel.listing_id]);
    if (!listing) continue;

    let synced;
    try {
      synced = await adapter.sync(listing);
    } catch (error) {
      console.error(`Failed to sync ${channel.marketplace} listing ${listing.id}:`, error);
      run(
        `INSERT INTO listing_channel_events (id, listing_channel_id, event_type, status, payload)
         VALUES (?,?,?,?,?)`,
        [uid(), channel.id, "sync", "failed", JSON.stringify({ error: error.message || "Sync failed" })],
      );
      run(
        `UPDATE listing_channels
         SET publish_error = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [error.message || "Sync failed", channel.id],
      );
      results.push({
        channelId: channel.id,
        synced: null,
        sale: null,
        reconciliation: null,
        error: error.message || "Sync failed",
      });
      continue;
    }

    const reconciliation = reconcileSyncResult(listing, channel, synced);

    if (reconciliation.conflicts.length > 0) {
      run(
        `INSERT INTO listing_channel_events (id, listing_channel_id, event_type, status, payload)
         VALUES (?,?,?,?,?)`,
        [
          uid(),
          channel.id,
          "reconciliation_conflict",
          reconciliation.hasBlockingConflict ? "blocked" : "warning",
          JSON.stringify({ conflicts: reconciliation.conflicts, remote: synced }),
        ],
      );
    }

    if (!reconciliation.safeToApply) {
      results.push({ channelId: channel.id, synced, sale: null, reconciliation });
      continue;
    }

    const sale = runInImmediateTransaction(() => {
      run(
        `UPDATE listing_channels
         SET status = ?, last_sync_at = ?, publish_error = NULL, updated_at = datetime('now')
         WHERE id = ?`,
        [synced.status, synced.syncedAt, channel.id],
      );
      run(
        `INSERT INTO listing_channel_events (id, listing_channel_id, event_type, status, payload)
         VALUES (?,?,?,?,?)`,
        [uid(), channel.id, "sync", synced.status, JSON.stringify(synced)],
      );
      run(
        `UPDATE listings
         SET publish_status = ?, last_sync_at = ?, status = CASE WHEN ? = 'sold' THEN 'sold' ELSE status END
         WHERE id = ?`,
        [synced.status, synced.syncedAt, synced.status, listing.id],
      );

      return insertSyncedSale(listing, channel, synced);
    });
    results.push({ channelId: channel.id, synced, sale, reconciliation });
  }

  return results;
}
