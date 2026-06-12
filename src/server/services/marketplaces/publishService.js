import { all, get, run } from "../../database.js";
import { uid } from "../../routes/shared.js";
import { getMarketplaceAdapter } from "../../integrations/marketplaces/marketplaceRegistry.js";
import { refreshListingAggregateState } from "./listingAggregateState.js";

const HANDOFF_MARKETPLACES = new Set(["comc", "consignment"]);
const SUBMITTABLE_HANDOFF_STATUSES = new Set(["handoff_ready", "handoff_exported", "handoff_exception"]);
const HANDOFF_STATUS_MAP = new Map([
  ["ready", "handoff_ready"],
  ["ready_for_review", "handoff_ready"],
  ["ready_to_ship", "handoff_ready"],
  ["exported", "handoff_exported"],
  ["submitted", "handoff_submitted"],
  ["accepted", "handoff_accepted"],
  ["settled", "handoff_settled"],
  ["exception", "handoff_exception"],
  ["failed", "handoff_exception"],
]);

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

function normalizeHandoffStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  const withoutPrefix = normalized.startsWith("handoff_") ? normalized.slice("handoff_".length) : normalized;
  const channelStatus = HANDOFF_STATUS_MAP.get(withoutPrefix);
  if (!channelStatus) {
    throw new Error("Unsupported handoff status");
  }
  return channelStatus;
}

function handoffSubmissionStatus(channelStatus) {
  return channelStatus.replace(/^handoff_/, "");
}

function normalizeHandoffMarketplace(marketplace) {
  const normalizedMarketplace = String(marketplace || "").trim().toLowerCase();
  if (!HANDOFF_MARKETPLACES.has(normalizedMarketplace)) {
    throw new Error("Marketplace does not support external handoff lifecycle");
  }
  return normalizedMarketplace;
}

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

function findSubmittableHandoffChannels(marketplace, listingIds = []) {
  if (listingIds.length) {
    return all(
      `SELECT *
       FROM listing_channels
       WHERE marketplace = ?
         AND listing_id IN (${listingIds.map(() => "?").join(",")})
         AND status IN (${Array.from(SUBMITTABLE_HANDOFF_STATUSES).map(() => "?").join(",")})`,
      [marketplace, ...listingIds, ...SUBMITTABLE_HANDOFF_STATUSES],
    );
  }

  return all(
    `SELECT *
     FROM listing_channels
     WHERE marketplace = ?
       AND status IN (${Array.from(SUBMITTABLE_HANDOFF_STATUSES).map(() => "?").join(",")})`,
    [marketplace, ...SUBMITTABLE_HANDOFF_STATUSES],
  );
}

function channelListingForHandoff(listing, channel) {
  return {
    ...listing,
    channel_status: channel.status || null,
    channelStatus: channel.status || null,
    channel_id: channel.id,
    channelId: channel.id,
    external_listing_id: channel.external_listing_id || listing.external_listing_id || null,
    externalListingId: channel.external_listing_id || listing.external_listing_id || null,
    overrides: channel.overrides || null,
  };
}

function publishErrorFromHandoffResult(result) {
  if (result.status !== "handoff_exception") return null;
  return result.payload?.handoff?.note
    || result.payload?.note
    || result.payload?.message
    || result.payload?.error
    || "External handoff needs retry";
}

function persistHandoffSubmission(channel, result) {
  const updatedAt = result.syncedAt || new Date().toISOString();
  const overrides = parseJsonObject(channel.overrides);
  const handoff = {
    ...(overrides.handoff || {}),
    ...(result.payload?.handoff || {}),
  };
  const nextOverrides = {
    ...overrides,
    handoff,
  };
  const publishError = publishErrorFromHandoffResult(result);

  run(
    `UPDATE listing_channels
     SET status = ?,
         publish_error = ?,
         overrides = ?,
         last_sync_at = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    [result.status, publishError, JSON.stringify(nextOverrides), updatedAt, channel.id],
  );

  addChannelEvent(channel.id, "handoff_submission", result.status, {
    listingId: channel.listing_id,
    marketplace: channel.marketplace,
    previousStatus: channel.status,
    status: result.status,
    handoff,
  });
  refreshListingAggregateState(channel.listing_id, { syncedAt: updatedAt });

  return get(`SELECT * FROM listing_channels WHERE id = ?`, [channel.id]);
}

function persistHandoffSubmissionException(channel, error) {
  const updatedAt = new Date().toISOString();
  const message = error?.message || "External handoff submission failed";
  const overrides = parseJsonObject(channel.overrides);
  const handoff = {
    ...(overrides.handoff || {}),
    submissionStatus: "exception",
    note: message,
    updatedAt,
  };
  const nextOverrides = {
    ...overrides,
    handoff,
  };

  run(
    `UPDATE listing_channels
     SET status = 'handoff_exception',
         publish_error = ?,
         overrides = ?,
         last_sync_at = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    [message, JSON.stringify(nextOverrides), updatedAt, channel.id],
  );

  addChannelEvent(channel.id, "handoff_submission", "handoff_exception", {
    listingId: channel.listing_id,
    marketplace: channel.marketplace,
    previousStatus: channel.status,
    status: "handoff_exception",
    handoff,
  });
  refreshListingAggregateState(channel.listing_id, { syncedAt: updatedAt });

  return get(`SELECT * FROM listing_channels WHERE id = ?`, [channel.id]);
}

function getListingForMarketplace(listingId, marketplace) {
  const listing = get(`SELECT * FROM listings WHERE id = ?`, [listingId]);
  if (!listing) throw new Error("Listing not found");

  const channel = get(
    `SELECT * FROM listing_channels WHERE listing_id = ? AND marketplace = ?`,
    [listingId, marketplace],
  );
  const externalListingId = channel?.external_listing_id || listing.external_listing_id || null;

  return {
    channel,
    listing: {
      ...listing,
      external_listing_id: externalListingId,
      externalListingId,
    },
  };
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
  refreshListingAggregateState(listingId, { syncedAt: result.syncedAt });

  return get(`SELECT * FROM listing_channels WHERE id = ?`, [channelId]);
}

export async function reviseListingOnMarketplace(listingId, marketplace, overrides = {}) {
  const { listing } = getListingForMarketplace(listingId, marketplace);

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
  refreshListingAggregateState(listingId, { syncedAt: result.syncedAt });
  run(`UPDATE listings SET publish_error = NULL WHERE id = ?`, [listingId]);

  return get(`SELECT * FROM listing_channels WHERE id = ?`, [channelId]);
}

export async function endListingOnMarketplace(listingId, marketplace) {
  const { listing } = getListingForMarketplace(listingId, marketplace);

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
  refreshListingAggregateState(listingId, { syncedAt: result.syncedAt });

  return get(`SELECT * FROM listing_channels WHERE id = ?`, [channelId]);
}

export function updateMarketplaceHandoffStatus({ listingId, marketplace, status, submissionReference, note }) {
  if (!listingId || !marketplace || !status) {
    throw new Error("listingId, marketplace, and status required");
  }

  const normalizedMarketplace = normalizeHandoffMarketplace(marketplace);

  const listing = get(`SELECT * FROM listings WHERE id = ?`, [listingId]);
  if (!listing) throw new Error("Listing not found");

  const channel = get(
    `SELECT * FROM listing_channels WHERE listing_id = ? AND marketplace = ?`,
    [listingId, normalizedMarketplace],
  );
  if (!channel) throw new Error("Listing channel not found");

  const channelStatus = normalizeHandoffStatus(status);
  const updatedAt = new Date().toISOString();
  const overrides = parseJsonObject(channel.overrides);
  const handoff = {
    ...(overrides.handoff || {}),
    submissionStatus: handoffSubmissionStatus(channelStatus),
    updatedAt,
  };
  if (submissionReference) {
    handoff.submissionReference = String(submissionReference);
  }
  if (note) {
    handoff.note = String(note);
  }

  const nextOverrides = {
    ...overrides,
    handoff,
  };
  const publishError = channelStatus === "handoff_exception" ? note || "External handoff needs retry" : null;

  run(
    `UPDATE listing_channels
     SET status = ?,
         publish_error = ?,
         overrides = ?,
         last_sync_at = datetime('now'),
         updated_at = datetime('now')
     WHERE id = ?`,
    [channelStatus, publishError, JSON.stringify(nextOverrides), channel.id],
  );

  addChannelEvent(channel.id, "handoff_status", channelStatus, {
    listingId,
    marketplace: normalizedMarketplace,
    previousStatus: channel.status,
    status: channelStatus,
    handoff,
  });
  refreshListingAggregateState(listingId, { syncedAt: updatedAt });

  return get(`SELECT * FROM listing_channels WHERE id = ?`, [channel.id]);
}

export async function submitMarketplaceHandoffs({ marketplace, listingIds = [] }) {
  const normalizedMarketplace = normalizeHandoffMarketplace(marketplace);
  const normalizedListingIds = Array.isArray(listingIds)
    ? listingIds.map((id) => String(id)).filter(Boolean)
    : [];
  const channels = findSubmittableHandoffChannels(normalizedMarketplace, normalizedListingIds);
  if (!channels.length) {
    throw new Error("No handoff channels available for submission");
  }

  const adapter = getMarketplaceAdapter(normalizedMarketplace);
  const results = [];
  for (const channel of channels) {
    const listing = get(`SELECT * FROM listings WHERE id = ?`, [channel.listing_id]);
    if (!listing) continue;
    const connection = channel.connection_id
      ? get(`SELECT * FROM marketplace_connections WHERE id = ?`, [channel.connection_id])
      : null;

    try {
      const result = await adapter.submitHandoff(channelListingForHandoff(listing, channel), { channel, connection });
      results.push(persistHandoffSubmission(channel, result));
    } catch (error) {
      results.push(persistHandoffSubmissionException(channel, error));
    }
  }

  const submittedListingIds = results
    .filter((channel) => channel?.status !== "handoff_exception")
    .map((channel) => channel.listing_id);

  return {
    marketplace: normalizedMarketplace,
    handoff: {
      status: "handoff_submitted",
      listingIds: submittedListingIds,
    },
    results,
  };
}
