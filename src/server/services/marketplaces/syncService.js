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

function toNumberOrNull(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundCurrency(value) {
  return Number(Number(value || 0).toFixed(2));
}

function reconciliationMessage(reconciliation) {
  const firstMessage = reconciliation?.conflicts?.find((conflict) => conflict?.message)?.message;
  return `Sync needs review: ${firstMessage || "marketplace conflict detected"}`;
}

function persistBlockingReconciliationConflict(listingId, channelId, reconciliation) {
  const message = reconciliationMessage(reconciliation);
  run(
    `UPDATE listing_channels
     SET publish_error = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [message, channelId],
  );
  run(
    `UPDATE listings
     SET publish_error = ?
     WHERE id = ?`,
    [message, listingId],
  );
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
    salePrice: toNumberOrNull(firstDefined(
      payload.salePrice,
      payload.sale_price,
      payload.total,
    )),
    shippingCharge: toNumberOrNull(firstDefined(
      payload.shippingCharge,
      payload.shipping_charge,
      payload.deliveryCost,
      payload.delivery_cost,
    )),
    taxCollected: toNumberOrNull(firstDefined(
      payload.taxCollected,
      payload.tax_collected,
      payload.tax,
    )),
    payoutAmount: toNumberOrNull(firstDefined(
      payload.payoutAmount,
      payload.payout_amount,
      payload.totalDueSeller,
      payload.total_due_seller,
    )),
  };
}

function updateExistingSyncedSale(saleId, metadata, costBasis, marketplace) {
  run(
    `UPDATE sales
     SET platform = COALESCE(?, platform),
         buyer_handle = COALESCE(?, buyer_handle),
         sale_price = COALESCE(?, sale_price),
         cost_basis = COALESCE(?, cost_basis),
         tax_collected = COALESCE(?, tax_collected),
         payout_amount = COALESCE(?, payout_amount),
         net_profit = COALESCE(?, net_profit)
     WHERE id = ?`,
    [
      marketplace,
      metadata.buyerHandle,
      metadata.salePrice,
      costBasis,
      metadata.taxCollected,
      metadata.payoutAmount,
      metadata.netProfit,
      saleId,
    ],
  );
}

function insertSyncedSale(listing, channel, synced, metadata) {
  if (!listing.sold_price && synced.status !== "sold") return null;
  const saleId = uid();
  const item = listing.card_id
    ? get(`SELECT id, cost_basis FROM user_items WHERE id = ?`, [listing.card_id])
    : null;
  const costBasis = Number(item?.cost_basis || 0);
  const salePrice = Number(metadata.salePrice ?? listing.sold_price ?? listing.start_price ?? 0);
  const shippingCost = Number(listing.shipping || 0);
  const taxCollected = Number(metadata.taxCollected ?? 0);
  const payoutAmount = Number(metadata.payoutAmount ?? salePrice);
  const netProfit = roundCurrency(payoutAmount - costBasis - shippingCost);
  metadata.netProfit = netProfit;
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
      costBasis,
      channel.marketplace,
      metadata.buyerHandle,
      0,
      shippingCost,
      0,
      0,
      taxCollected,
      payoutAmount,
      netProfit,
      listing.id,
      synced.syncedAt,
      listing.id,
    ],
  );

  if (inserted.changes === 0) {
    const existingSale = get(`SELECT * FROM sales WHERE listing_id = ?`, [listing.id]);
    if (existingSale) {
      updateExistingSyncedSale(existingSale.id, metadata, costBasis, channel.marketplace || synced.marketplace || null);
      return get(`SELECT * FROM sales WHERE id = ?`, [existingSale.id]);
    }
    return null;
  }

  return get(`SELECT * FROM sales WHERE id = ?`, [saleId]);
}

function updateExistingSyncedOrder(orderId, metadata, sale, marketplace) {
  run(
    `UPDATE orders
     SET sale_id = COALESCE(?, sale_id),
         platform = COALESCE(?, platform),
         external_order_id = COALESCE(?, external_order_id),
         buyer_handle = COALESCE(?, buyer_handle),
         sale_price = COALESCE(?, sale_price),
         shipping_charge = COALESCE(?, shipping_charge),
         tax_collected = COALESCE(?, tax_collected),
         destination_country = COALESCE(?, destination_country),
         destination_postal_code = COALESCE(?, destination_postal_code)
    WHERE id = ?`,
    [
      sale?.id || null,
      marketplace,
      metadata.externalOrderId,
      metadata.buyerHandle || sale?.buyer_handle || null,
      metadata.salePrice ?? sale?.sale_price ?? null,
      metadata.shippingCharge,
      metadata.taxCollected ?? sale?.tax_collected ?? null,
      metadata.destinationCountry,
      metadata.destinationPostalCode,
      orderId,
    ],
  );
}

function ensureOrderForSyncedSale(listing, sale, synced, metadata) {
  if (synced.status !== "sold" || !sale) return null;

  const existing = get(
    `SELECT * FROM orders WHERE sale_id = ? OR listing_id = ? ORDER BY created_at DESC LIMIT 1`,
    [sale.id, listing.id],
  );
  if (existing) {
    updateExistingSyncedOrder(existing.id, metadata, sale, sale?.platform || synced.marketplace || null);
    if (!sale.order_id || sale.order_id !== existing.id) {
      run(`UPDATE sales SET order_id = ? WHERE id = ?`, [existing.id, sale.id]);
    }
    return get(`SELECT * FROM orders WHERE id = ?`, [existing.id]);
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
      metadata.salePrice ?? sale.sale_price ?? 0,
      sale.fees || 0,
      metadata.shippingCharge ?? 0,
      metadata.taxCollected ?? sale.tax_collected ?? 0,
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
      channel_status: channel.status || null,
      channelStatus: channel.status || null,
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
    const normalizedSynced = {
      ...synced,
      externalListingId: synced.externalListingId || reconciliation.remoteState.externalListingId,
      status: synced.status || reconciliation.remoteState.status,
      remoteUpdatedAt: synced.remoteUpdatedAt || synced.remote_updated_at || reconciliation.remoteState.updatedAt,
      priceHistory: synced.priceHistory || synced.price_history || reconciliation.remoteState.priceHistory,
      syncedAt: synced.syncedAt || new Date().toISOString(),
    };

    if (reconciliation.conflicts.length > 0) {
      run(
        `INSERT INTO listing_channel_events (id, listing_channel_id, event_type, status, payload)
         VALUES (?,?,?,?,?)`,
        [
          uid(),
          channel.id,
          "reconciliation_conflict",
          reconciliation.hasBlockingConflict ? "blocked" : "warning",
          JSON.stringify({ conflicts: reconciliation.conflicts, remote: normalizedSynced }),
        ],
      );
    }

    if (!reconciliation.safeToApply) {
      persistBlockingReconciliationConflict(listing.id, channel.id, reconciliation);
      results.push({ channelId: channel.id, synced: normalizedSynced, sale: null, reconciliation });
      continue;
    }

    const result = runInImmediateTransaction(() => {
      run(
        `UPDATE listing_channels
         SET status = ?,
             last_sync_at = ?,
             remote_updated_at = COALESCE(?, remote_updated_at),
             remote_price_history = COALESCE(?, remote_price_history),
             publish_error = NULL,
             updated_at = datetime('now')
         WHERE id = ?`,
        [
          normalizedSynced.status,
          normalizedSynced.syncedAt,
          normalizedSynced.remoteUpdatedAt || null,
          normalizedSynced.priceHistory?.length ? JSON.stringify(normalizedSynced.priceHistory) : null,
          channel.id,
        ],
      );
      run(
        `INSERT INTO listing_channel_events (id, listing_channel_id, event_type, status, payload)
         VALUES (?,?,?,?,?)`,
        [uid(), channel.id, "sync", normalizedSynced.status, JSON.stringify(normalizedSynced)],
      );
      run(
        `UPDATE listings
         SET last_sync_at = ?
         WHERE id = ?`,
        [normalizedSynced.syncedAt, listing.id],
      );

      refreshListingAggregateState(listing.id, { syncedAt: normalizedSynced.syncedAt });

      const metadata = extractMarketplaceOrderMetadata(normalizedSynced);
      const sale = insertSyncedSale(listing, channel, normalizedSynced, metadata);
      const order = ensureOrderForSyncedSale(listing, sale, normalizedSynced, metadata);
      markItemSoldFromMarketplaceSync(listing, sale, normalizedSynced);
      return { sale, order };
    });
    results.push({ channelId: channel.id, synced: normalizedSynced, sale: result.sale, order: result.order, reconciliation });
  }

  return results;
}
