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
  return externalId === `${marketplace}-${String(listingId).slice(0, 12)}`;
}

// Translate a raw listing_channels row (snake_case) into a { type, message }
// toast summary, mirroring salesViewState's summarize* helpers.
export function summarizePublishOutcome(channel, { marketplace, label, listingId }) {
  if (!channel?.status) {
    return { type: "error", message: `No publish result returned from ${label}` };
  }
  const status = String(channel.status).toLowerCase();
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
    return {
      type: "success",
      message: `Published to ${label}${externalId ? ` (#${externalId})` : ""}`,
    };
  }
  return { type: "info", message: `${label} publish status: ${channel.status}` };
}

// Same optimistic channel-field spread SalesFlow applies after publish.
export function applyChannelToListing(listing, channel) {
  return {
    ...listing,
    publishStatus: channel.status,
    externalListingId: channel.externalListingId || channel.external_listing_id,
    lastSyncAt: channel.lastSyncAt || channel.last_sync_at,
  };
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
