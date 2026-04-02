import { get, run } from "../../database.js";
import { uid } from "../../routes/shared.js";
import { getMarketplaceAdapter } from "../../integrations/marketplaces/marketplaceRegistry.js";

function upsertChannel({ listingId, marketplace, connectionId, externalListingId, status, payload, publishError }) {
  const existing = get(
    `SELECT * FROM listing_channels WHERE listing_id = ? AND marketplace = ?`,
    [listingId, marketplace],
  );

  if (existing) {
    run(
      `UPDATE listing_channels
       SET connection_id = ?,
           external_listing_id = ?,
           status = ?,
           last_sync_at = datetime('now'),
           publish_error = ?,
           overrides = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
      [
        connectionId || existing.connection_id,
        externalListingId || existing.external_listing_id,
        status,
        publishError || null,
        JSON.stringify(payload || {}),
        existing.id,
      ],
    );
    return existing.id;
  }

  const channelId = uid();
  run(
    `INSERT INTO listing_channels
     (id, listing_id, marketplace, connection_id, external_listing_id, status, last_sync_at, publish_error, overrides)
     VALUES (?,?,?,?,?,?,datetime('now'),?,?)`,
    [
      channelId,
      listingId,
      marketplace,
      connectionId || null,
      externalListingId || null,
      status,
      publishError || null,
      JSON.stringify(payload || {}),
    ],
  );
  return channelId;
}

function addChannelEvent(channelId, eventType, status, payload) {
  run(
    `INSERT INTO listing_channel_events (id, listing_channel_id, event_type, status, payload)
     VALUES (?,?,?,?,?)`,
    [uid(), channelId, eventType, status || null, JSON.stringify(payload || {})],
  );
}

export async function publishListingToMarketplace(listingId, marketplace, options = {}) {
  const listing = get(`SELECT * FROM listings WHERE id = ?`, [listingId]);
  if (!listing) throw new Error("Listing not found");

  const adapter = getMarketplaceAdapter(marketplace);
  const result = await adapter.publish(listing, options);
  const channelId = upsertChannel({
    listingId,
    marketplace,
    connectionId: options.connectionId,
    externalListingId: result.externalListingId,
    status: result.status,
    payload: result.payload,
  });
  addChannelEvent(channelId, "publish", result.status, result);

  run(
    `UPDATE listings
     SET publish_status = ?, external_listing_id = ?, last_sync_at = ?, status = ?, notes = COALESCE(notes, notes)
     WHERE id = ?`,
    [result.status, result.externalListingId, result.syncedAt, "active", listingId],
  );

  return get(`SELECT * FROM listing_channels WHERE id = ?`, [channelId]);
}

export async function reviseListingOnMarketplace(listingId, marketplace, overrides = {}) {
  const listing = get(`SELECT * FROM listings WHERE id = ?`, [listingId]);
  if (!listing) throw new Error("Listing not found");

  const adapter = getMarketplaceAdapter(marketplace);
  const result = await adapter.revise(listing, overrides);
  const channelId = upsertChannel({
    listingId,
    marketplace,
    externalListingId: result.externalListingId,
    status: result.status,
    payload: result.payload,
  });
  addChannelEvent(channelId, "revise", result.status, result);

  run(
    `UPDATE listings
     SET publish_status = ?, last_sync_at = ?, publish_error = NULL
     WHERE id = ?`,
    [result.status, result.syncedAt, listingId],
  );

  return get(`SELECT * FROM listing_channels WHERE id = ?`, [channelId]);
}

export async function endListingOnMarketplace(listingId, marketplace) {
  const listing = get(`SELECT * FROM listings WHERE id = ?`, [listingId]);
  if (!listing) throw new Error("Listing not found");

  const adapter = getMarketplaceAdapter(marketplace);
  const result = await adapter.end(listing);
  const channelId = upsertChannel({
    listingId,
    marketplace,
    externalListingId: result.externalListingId,
    status: result.status,
    payload: result.payload,
  });
  addChannelEvent(channelId, "end", result.status, result);

  run(
    `UPDATE listings
     SET publish_status = ?, status = 'ended', last_sync_at = ?
     WHERE id = ?`,
    [result.status, result.syncedAt, listingId],
  );

  return get(`SELECT * FROM listing_channels WHERE id = ?`, [channelId]);
}
