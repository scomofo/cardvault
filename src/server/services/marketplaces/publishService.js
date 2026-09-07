import { all, get, run, runInImmediateTransaction } from "../../database.js";
import { uid } from "../../routes/shared.js";
import { getMarketplaceAdapter } from "../../integrations/marketplaces/marketplaceRegistry.js";
import { refreshListingAggregateState } from "./listingAggregateState.js";

const HANDOFF_MARKETPLACES = new Set(["comc", "consignment"]);
const SUBMITTABLE_HANDOFF_STATUSES = new Set(["handoff_ready", "handoff_exported", "handoff_exception"]);
// Once a handoff channel moves past handoff_ready, the partner (COMC, a
// consignment shop) owns it — advancing it further has to go through
// submitMarketplaceHandoffs/updateMarketplaceHandoffStatus, which merge
// into the channel's handoff record. A stray re-publish or revise (a
// crosspost, a redundant scan retry) must not regress that state.
const LOCKED_HANDOFF_STATUSES = new Set([
  "handoff_exported",
  "handoff_submitted",
  "handoff_accepted",
  "handoff_settled",
  "handoff_exception",
]);
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

function firstDefined(...values) {
  return values.find((value) => value != null && value !== "");
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

function handoffMarketplaceLabel(marketplace) {
  return marketplace === "comc" ? "COMC" : "Consignment";
}

function handoffSubmissionUrl(metadata = {}) {
  return firstDefined(
    metadata.handoffSubmissionUrl,
    metadata.handoff_submission_url,
    metadata.submissionUrl,
    metadata.submission_url,
  );
}

function assertHandoffSubmissionConfigured(marketplace, channel, connection) {
  const metadata = parseJsonObject(connection?.metadata);
  if (connection && handoffSubmissionUrl(metadata)) return;
  const error = new Error(`${handoffMarketplaceLabel(marketplace)} handoff submission is not configured. Add a Handoff Submission URL in Settings > Marketplace Connections before submitting live handoffs.`);
  error.code = "HANDOFF_SUBMISSION_NOT_CONFIGURED";
  error.listingId = channel.listing_id;
  throw error;
}

// Preserve the existing overrides.handoff sub-object (submissionReference,
// exportId, etc. set by the handoff-specific update paths) instead of
// wholesale-replacing overrides with whatever this call's payload carries —
// a plain adapter publish/revise payload for a handoff marketplace only
// ever knows the boilerplate "ready" shape, not what the partner side has
// since recorded.
function mergeChannelOverrides(existingOverrides, payload) {
  const nextPayload = payload || {};
  const mergedHandoff = { ...(existingOverrides.handoff || {}), ...(nextPayload.handoff || {}) };
  return {
    ...nextPayload,
    ...(Object.keys(mergedHandoff).length ? { handoff: mergedHandoff } : {}),
  };
}

function upsertChannel({ listingId, marketplace, connectionId, externalListingId, status, payload, publishError }) {
  const existing = get(
    `SELECT * FROM listing_channels WHERE listing_id = ? AND marketplace = ?`,
    [listingId, marketplace],
  );

  if (existing) {
    const nextOverrides = mergeChannelOverrides(parseJsonObject(existing.overrides), payload);
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
        JSON.stringify(nextOverrides),
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

function assertHandoffNotLocked(marketplace, channel, action) {
  if (!channel || !HANDOFF_MARKETPLACES.has(marketplace)) return;
  if (!LOCKED_HANDOFF_STATUSES.has(channel.status)) return;
  const error = new Error(
    `Cannot ${action} this ${handoffMarketplaceLabel(marketplace)} listing — it already has an external handoff in progress (${channel.status}). Use the handoff status tools instead.`,
  );
  error.code = "HANDOFF_LOCKED";
  error.listingId = channel.listing_id;
  throw error;
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

// Handoff submit/sync resolve their partner endpoint and token exclusively
// through the channel's connection_id. A publish without an explicit
// connectionId (scan flow, SalesFlow, crosspost) must associate the best
// available connection, or every handoff created that way would later fail
// submission as "not configured" despite a configured connection existing.
function defaultConnectionIdFor(marketplace) {
  if (!HANDOFF_MARKETPLACES.has(marketplace)) return null;
  const row = get(
    `SELECT id FROM marketplace_connections
     WHERE marketplace = ?
     ORDER BY CASE auth_status WHEN 'connected' THEN 0 WHEN 'configured' THEN 1 ELSE 2 END,
       updated_at DESC, created_at DESC
     LIMIT 1`,
    [marketplace],
  );
  return row?.id || null;
}

export async function publishListingToMarketplace(listingId, marketplace, options = {}) {
  const listing = get(`SELECT * FROM listings WHERE id = ?`, [listingId]);
  if (!listing) throw new Error("Listing not found");

  const existingChannel = get(
    `SELECT * FROM listing_channels WHERE listing_id = ? AND marketplace = ?`,
    [listingId, marketplace],
  );
  assertHandoffNotLocked(marketplace, existingChannel, "publish");

  const adapter = getMarketplaceAdapter(marketplace);
  const existingRealEbayId = marketplace === "ebay" && existingChannel?.external_listing_id
    && existingChannel.external_listing_id !== `${marketplace}-${listingId.slice(0, 12)}`;
  if (existingRealEbayId && ["active", "revised", "sold", "ended"].includes(existingChannel.status)) return existingChannel;
  const liveEbay = marketplace === "ebay" && adapter.isConnected();
  if (marketplace === "ebay" && !liveEbay && ["publishing", "publish_unknown"].includes(existingChannel?.status)) {
    throw new Error("Reconnect eBay and review the previous publish outcome before retrying. An unknown result must not be replaced by a draft.");
  }
  if (liveEbay) {
    const claim = runInImmediateTransaction(() => {
      const current = get(`SELECT * FROM listing_channels WHERE listing_id = ? AND marketplace = ?`, [listingId, marketplace]);
      const realId = current?.external_listing_id && current.external_listing_id !== `${marketplace}-${listingId.slice(0, 12)}`;
      if (realId && ["active", "revised", "sold", "ended"].includes(current.status)) return current;
      if (["sold", "ended"].includes(listing.status)) throw new Error("Cannot publish a sold or ended listing; review its existing marketplace listing");
      const startedAt = current?.updated_at ? Date.parse(current.updated_at.replace(" ", "T") + (current.updated_at.endsWith("Z") ? "" : "Z")) : NaN;
      if (current?.status === "publishing" && (!Number.isFinite(startedAt) || Date.now() - startedAt < 120_000)) {
        throw new Error("A publish attempt is still in progress. Review its result before retrying.");
      }
      if (current && ["publishing", "publish_unknown"].includes(current.status) && options.confirmNotPublished !== true) {
        throw new Error("Publish outcome needs review. Check eBay Seller Hub before confirming a retry; do not create a second listing.");
      }
      upsertChannel({ listingId, marketplace, status: "publishing", payload: {}, connectionId: options.connectionId });
      run(`UPDATE listings SET publish_status = 'publishing', publish_error = NULL WHERE id = ?`, [listingId]);
      return null;
    });
    if (claim) return claim;
  }
  let result;
  try {
    result = await adapter.publish(listing, options);
    if (liveEbay && !result?.externalListingId) throw new Error("eBay returned no confirmed listing ID");
  } catch (error) {
    if (liveEbay) {
      const status = error.notSent ? "draft" : error.code === "EBAY_REJECTED" ? "rejected" : "publish_unknown";
      const message = status === "publish_unknown" ? `${error.message}. Check eBay before retrying; the publish outcome may be unknown.` : error.message;
      const channelId = upsertChannel({ listingId, marketplace, status, publishError: message, payload: {} });
      addChannelEvent(channelId, "publish", status, { error: message });
      run(`UPDATE listings SET publish_status = ?, publish_error = ? WHERE id = ?`, [status, message, listingId]);
    }
    throw error;
  }
  // A disconnected adapter may only prepare a draft, never claim it is live.
  if (marketplace === "ebay" && !liveEbay) result = { ...result, status: "draft" };
  const channelId = upsertChannel({
    listingId,
    marketplace,
    connectionId: options.connectionId || defaultConnectionIdFor(marketplace),
    externalListingId: result.externalListingId,
    status: result.status,
    payload: result.payload,
  });
  addChannelEvent(channelId, "publish", result.status, result);
  refreshListingAggregateState(listingId, { syncedAt: result.syncedAt });

  return get(`SELECT * FROM listing_channels WHERE id = ?`, [channelId]);
}

export async function reviseListingOnMarketplace(listingId, marketplace, overrides = {}) {
  const { listing, channel } = getListingForMarketplace(listingId, marketplace);
  assertHandoffNotLocked(marketplace, channel, "revise");

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

    assertHandoffSubmissionConfigured(normalizedMarketplace, channel, connection);
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
