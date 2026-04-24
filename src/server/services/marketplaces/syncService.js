import { all, get, run, runInImmediateTransaction } from "../../database.js";
import { uid } from "../../routes/shared.js";
import { getMarketplaceAdapter, listSupportedMarketplaces } from "../../integrations/marketplaces/marketplaceRegistry.js";
import { reconcileSyncResult } from "./syncReconciler.js";
import { refreshListingAggregateState } from "./listingAggregateState.js";

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

function firstDefined(...values) {
  return values.find((value) => value != null && value !== "");
}

function normalizeCountry(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().toUpperCase();
}

function normalizePostalCode(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

function extractMarketplaceOrderMetadata(synced) {
  const payload = synced?.payload && typeof synced.payload === "object" ? synced.payload : {};
  const shippingAddress = payload.shippingAddress && typeof payload.shippingAddress === "object" ? payload.shippingAddress : {};
  const address = payload.address && typeof payload.address === "object" ? payload.address : {};
  const buyer = payload.buyer && typeof payload.buyer === "object" ? payload.buyer : {};

  return {
    externalOrderId: firstDefined(
      payload.externalOrderId,
      payload.external_order_id,
      payload.orderId,
      payload.order_id,
      buyer.orderId,
      buyer.order_id,
    ) || null,
    buyerHandle: firstDefined(
      payload.buyerHandle,
      payload.buyer_handle,
      buyer.username,
      buyer.userId,
      buyer.user_id,
      buyer.handle,
    ) || null,
    destinationCountry: normalizeCountry(firstDefined(
      payload.destinationCountry,
      payload.destination_country,
      shippingAddress.countryCode,
      shippingAddress.country_code,
      shippingAddress.country,
      address.countryCode,
      address.country_code,
      address.country,
    )),
    destinationPostalCode: normalizePostalCode(firstDefined(
      payload.destinationPostalCode,
      payload.destination_postal_code,
      shippingAddress.postalCode,
      shippingAddress.postal_code,
      shippingAddress.zip,
      address.postalCode,
      address.postal_code,
      address.zip,
    )),
  };
}

function insertSyncedSale(listing, channel, synced, metadata) {
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
      metadata.buyerHandle,
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

function ensureOrderForSyncedSale(listing, sale, synced, metadata) {
  if (synced.status !== "sold" || !sale) return null;

  const existing = get(
    `SELECT * FROM orders WHERE sale_id = ? OR listing_id = ? ORDER BY created_at DESC LIMIT 1`,
    [sale.id, listing.id],
  );
  if (existing) {
    if (!sale.order_id || sale.order_id !== existing.id) {
      run(`UPDATE sales SET order_id = ? WHERE id = ?`, [existing.id, sale.id]);
    }
    return existing;
  }

  const orderId = uid();
  run(
    `INSERT INTO orders
     (id, sale_id, listing_id, item_id, platform, external_order_id, buyer_handle, sale_price, fees, shipping_charge, tax_collected, destination_country, destination_postal_code, payment_status, fulfillment_status, sold_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`,
    [
      orderId,
      sale.id,
      listing.id,
      listing.card_id || null,
      sale.platform || synced.marketplace || null,
      metadata.externalOrderId,
      metadata.buyerHandle || sale.buyer_handle || null,
      sale.sale_price || 0,
      sale.fees || 0,
      sale.shipping_cost || 0,
      sale.tax_collected || 0,
      metadata.destinationCountry || "CA",
      metadata.destinationPostalCode,
      "paid",
      "pending",
      sale.date || synced.syncedAt,
    ],
  );
  run(`UPDATE sales SET order_id = ? WHERE id = ?`, [orderId, sale.id]);
  return get(`SELECT * FROM orders WHERE id = ?`, [orderId]);
}

function markItemSoldFromMarketplaceSync(listing, sale, synced) {
  if (synced.status !== "sold" || !listing.card_id) return;

  const profitRealized = Number(sale?.net_profit ?? sale?.payout_amount ?? sale?.sale_price ?? 0);
  run(
    `UPDATE user_items
     SET status = 'sold',
         listing_status = 'ended',
         sale_status = 'sold',
         profit_realized = ?,
         sold_at = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    [profitRealized, synced.syncedAt, listing.card_id],
  );
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
    const listingForChannel = {
      ...listing,
      external_listing_id: channel.external_listing_id || listing.external_listing_id || null,
      externalListingId: channel.external_listing_id || listing.external_listing_id || null,
    };

    let synced;
    try {
      synced = await adapter.sync(listingForChannel);
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

    const result = runInImmediateTransaction(() => {
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
         SET last_sync_at = ?
         WHERE id = ?`,
        [synced.syncedAt, listing.id],
      );

      refreshListingAggregateState(listing.id, { syncedAt: synced.syncedAt });

      const metadata = extractMarketplaceOrderMetadata(synced);
      const sale = insertSyncedSale(listing, channel, synced, metadata);
      const order = ensureOrderForSyncedSale(listing, sale, synced, metadata);
      markItemSoldFromMarketplaceSync(listing, sale, synced);
      return { sale, order };
    });
    results.push({ channelId: channel.id, synced, sale: result.sale, order: result.order, reconciliation });
  }

  return results;
}
