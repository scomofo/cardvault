// Glue between the scan workflow and the marketplace publish pipeline.
// Pure/DI-style so it can be unit tested without a DOM or a running server.

const MARKETPLACE_LABELS = {
  ebay: "eBay",
  comc: "COMC",
  consignment: "Consignment",
};

const HANDOFF_MARKETPLACES = new Set(["comc", "consignment"]);

// Decide whether "Save + List" should hit the real marketplace pipeline.
// eBay is the only live-API path and only worth offering when connected —
// the server silently falls back to a local stub otherwise. COMC/consignment
// publishes create a real handoff channel, so they're always worth queueing
// in server mode. Everything else stays a locally tracked listing.
export function getPublishTarget(platform, { useServer = false, ebayConnected = false } = {}) {
  if (!useServer) return null;
  if (platform === "ebay") {
    return ebayConnected
      ? { marketplace: "ebay", label: MARKETPLACE_LABELS.ebay, mode: "live" }
      : null;
  }
  if (HANDOFF_MARKETPLACES.has(platform)) {
    return { marketplace: platform, label: MARKETPLACE_LABELS[platform], mode: "handoff" };
  }
  return null;
}

// The server's stub adapters mint external ids as `${marketplace}-${listingId.slice(0, 12)}`.
// A matching id means the adapter fell back to the stub and nothing reached the marketplace.
export function isStubChannel(channel, { marketplace, listingId }) {
  const externalId = channel?.externalListingId || channel?.external_listing_id;
  return Boolean(channel?.stub || channel?.payload?.stub)
    || externalId === `${marketplace}-${String(listingId).slice(0, 12)}`;
}

// Translate a raw listing_channels row (snake_case) into a { type, message }
// toast summary, mirroring salesViewState's summarize* helpers.
export function summarizePublishOutcome(channel, { marketplace, label, listingId }) {
  if (!channel?.status) {
    return { type: "error", message: `No publish result returned from ${label}` };
  }
  const status = String(channel.status).toLowerCase();
  if (isStubChannel(channel, { marketplace, listingId })) return { type: "warning", message: `Listing saved, but ${label} isn't connected — nothing was pushed live. Connect ${label} in Settings, then publish from Sales.` };
  if (["publish_unknown", "needs_review", "publishing", "failed", "handoff_exception"].includes(status)) {
    return { type: "warning", message: `${label}: ${status.replace(/_/g, " ")} — review the marketplace before retrying.` };
  }
  if (status.startsWith("handoff")) {
    return {
      type: "success",
      message: `Queued for ${label} handoff — review and submit it from the Sales tab`,
    };
  }
  if (status === "active" || status === "revised") {
    if (isStubChannel(channel, { marketplace, listingId })) {
      return {
        type: "warning",
        message: `Listing saved, but ${label} isn't connected — nothing was pushed live. Connect ${label} in Settings, then publish from Sales.`,
      };
    }
    const externalId = channel.externalListingId || channel.external_listing_id;
    if (!externalId) return { type: "warning", message: `${label} did not return a listing ID — publication is unconfirmed. Review before retrying.` };
    return { type: "success", message: `Published to ${label} (#${externalId})` };
  }
  return { type: "info", message: `${label} publish status: ${channel.status}` };
}

export function listingLifecycle(listing) {
  const status = String(listing.publishStatus || listing.publish_status || "").toLowerCase();
  const externalId = listing.externalListingId || listing.external_listing_id;
  const stub = isStubChannel(listing, { marketplace: listing.platform || listing.marketplace, listingId: listing.id || listing.listing_id });
  if (["sold", "ended"].includes(listing.status)) return listing.status;
  if (["publish_unknown", "needs_review", "failed", "handoff_exception"].includes(status)) return "needs_review";
  if (status === "publishing") return "publishing";
  if (status.startsWith("handoff")) return "handoff";
  if (externalId && !stub && ["active", "revised"].includes(status)) return "live";
  return "draft";
}

// A local draft only becomes active after a real, non-stub ID is returned.
export function applyChannelToListing(listing, channel) {
  const updated = {
    ...listing,
    publishStatus: channel.status,
    publishError: channel.publishError || channel.publish_error || null,
    externalListingId: channel.externalListingId || channel.external_listing_id || null,
    lastSyncAt: channel.lastSyncAt || channel.last_sync_at,
  };
  const lifecycle = listingLifecycle(updated);
  if (["sold", "ended"].includes(channel.status)) updated.status = channel.status;
  else if (!["sold", "ended"].includes(listing.status)) updated.status = ["live", "handoff"].includes(lifecycle) ? "active" : "draft";
  return updated;
}

// Publish a freshly scanned card: the item must exist server-side before the
// listing (POST /api/listings 404s on a missing card_id), and the listing must
// exist before publish. Both creates are idempotent upserts, so the sync
// engine's later debounced creates for the same records are harmless.
export async function publishScanListing({
  itemsAPI,
  listingsAPI,
  marketplacesAPI,
  item,
  listingRecord,
  marketplace,
}) {
  if (item) {
    await itemsAPI.create(item);
  }
  await listingsAPI.create(listingRecord);
  return marketplacesAPI.publish({ listingId: listingRecord.id, marketplace });
}
