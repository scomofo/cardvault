import { all, get, run } from "../../database.js";
import { uid } from "../../routes/shared.js";
import { getMarketplaceAdapter } from "../../integrations/marketplaces/marketplaceRegistry.js";
import { reconcileSyncResult } from "./syncReconciler.js";

function insertSyncedSale(listing, channel, synced) {
  if (!listing.sold_price && synced.status !== "sold") return null;
  const existingSale = get(`SELECT * FROM sales WHERE listing_id = ?`, [listing.id]);
  if (existingSale) return existingSale;

  const saleId = uid();
  const salePrice = Number(listing.sold_price || listing.start_price || 0);
  run(
    `INSERT INTO sales
     (id, card_id, order_id, card_name, card_set, sale_price, cost_basis, platform, buyer_handle, fees, shipping_cost, packaging_cost, grading_cost, tax_collected, payout_amount, net_profit, listing_id, date)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
    ],
  );

  return get(`SELECT * FROM sales WHERE id = ?`, [saleId]);
}

/**
 * Sync listing status with a marketplace.
 * @param {string} marketplace
 * @param {string|null} [listingId]
 * @returns {Promise<object[]>}
 */
export async function syncMarketplaceListings(marketplace, listingId = null) {
  const adapter = getMarketplaceAdapter(marketplace);
  const channels = listingId
    ? all(`SELECT * FROM listing_channels WHERE marketplace = ? AND listing_id = ?`, [marketplace, listingId])
    : all(`SELECT * FROM listing_channels WHERE marketplace = ?`, [marketplace]);

  const results = [];
  for (const channel of channels) {
    const listing = get(`SELECT * FROM listings WHERE id = ?`, [channel.listing_id]);
    if (!listing) continue;

    const synced = await adapter.sync(listing);
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

    const sale = insertSyncedSale(listing, channel, synced);
    results.push({ channelId: channel.id, synced, sale, reconciliation });
  }

  return results;
}
