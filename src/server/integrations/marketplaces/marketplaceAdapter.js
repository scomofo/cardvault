const DEFAULT_HANDOFF_STATUS_TIMEOUT_MS = 10000;
const HANDOFF_ERROR_TEXT_LIMIT = 200;
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
  ["rejected", "handoff_exception"],
  ["declined", "handoff_exception"],
]);

function firstDefined(...values) {
  return values.find((value) => value != null && value !== "");
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function truncateText(value) {
  const text = String(value || "");
  return text.length > HANDOFF_ERROR_TEXT_LIMIT
    ? `${text.slice(0, HANDOFF_ERROR_TEXT_LIMIT)}...`
    : text;
}

function handoffStatusUrl(metadata = {}) {
  return firstDefined(
    metadata.handoffStatusUrl,
    metadata.handoff_status_url,
    metadata.statusUrl,
    metadata.status_url,
  );
}

function handoffStatusTimeoutMs(metadata = {}) {
  const timeoutMs = Number(firstDefined(
    metadata.handoffStatusTimeoutMs,
    metadata.handoff_status_timeout_ms,
    metadata.statusTimeoutMs,
    metadata.status_timeout_ms,
  ));
  return Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_HANDOFF_STATUS_TIMEOUT_MS;
}

function renderTemplate(template, values) {
  return String(template || "").replace(/\{([A-Za-z0-9_]+)\}/g, (_match, key) => {
    const value = values[key] == null ? "" : String(values[key]);
    return encodeURIComponent(value);
  });
}

function handoffAuthHeaders(connection = {}, metadata = {}) {
  const token = firstDefined(connection.access_token, connection.accessToken);
  if (!token) return {};
  const headerName = String(firstDefined(
    metadata.apiKeyHeader,
    metadata.api_key_header,
    metadata.authHeader,
    metadata.auth_header,
    "Authorization",
  ));
  const rawPrefix = metadata.apiKeyPrefix ?? metadata.api_key_prefix;
  const headerPrefix = rawPrefix != null ? String(rawPrefix) : "Bearer ";
  return { [headerName]: `${headerPrefix}${token}` };
}

function normalizeHandoffStatus(status, fallbackStatus) {
  const normalized = String(firstDefined(status, fallbackStatus, "")).trim().toLowerCase();
  const withoutPrefix = normalized.startsWith("handoff_") ? normalized.slice("handoff_".length) : normalized;
  return HANDOFF_STATUS_MAP.get(withoutPrefix) || normalized || "handoff_ready";
}

function handoffSubmissionStatus(channelStatus) {
  return String(channelStatus || "").replace(/^handoff_/, "");
}

async function readHandoffPayload(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: truncateText(text) };
  }
}

export class MarketplaceAdapter {
  constructor(marketplace) {
    this.marketplace = marketplace;
  }

  buildExternalId(listingId) {
    return `${this.marketplace}-${listingId.slice(0, 12)}`;
  }

  async publish(listing) {
    return {
      marketplace: this.marketplace,
      externalListingId: this.buildExternalId(listing.id),
      status: "active",
      payload: listing,
      syncedAt: new Date().toISOString(),
    };
  }

  async revise(listing, overrides = {}) {
    return {
      marketplace: this.marketplace,
      externalListingId: listing.external_listing_id || this.buildExternalId(listing.id),
      status: "revised",
      payload: { ...listing, ...overrides },
      syncedAt: new Date().toISOString(),
    };
  }

  async end(listing) {
    return {
      marketplace: this.marketplace,
      externalListingId: listing.external_listing_id || this.buildExternalId(listing.id),
      status: "ended",
      payload: listing,
      syncedAt: new Date().toISOString(),
    };
  }

  async sync(listing) {
    const channelStatus = String(listing.channel_status || listing.channelStatus || "").toLowerCase();
    const isPrimaryMarketplace = this.marketplace === String(listing.platform || "").toLowerCase();
    const status = isPrimaryMarketplace && listing.sold_price
      ? "sold"
      : (channelStatus || "active");

    return {
      marketplace: this.marketplace,
      externalListingId: listing.external_listing_id || this.buildExternalId(listing.id),
      status,
      payload: listing,
      syncedAt: new Date().toISOString(),
    };
  }

  async syncHandoffStatus(listing, options = {}) {
    const connection = options.connection || {};
    const metadata = parseJsonObject(connection.metadata);
    const template = handoffStatusUrl(metadata);
    if (!template) return null;

    const overrides = parseJsonObject(listing.overrides);
    const currentHandoff = overrides.handoff || {};
    let endpoint;
    try {
      endpoint = new URL(renderTemplate(template, {
        listingId: listing.id,
        marketplace: this.marketplace,
        externalListingId: listing.external_listing_id || listing.externalListingId || "",
        submissionReference: currentHandoff.submissionReference || "",
        channelId: listing.channel_id || listing.channelId || "",
      }));
    } catch {
      throw new Error(`${this.marketplace} handoff status URL is invalid`);
    }

    if (!["http:", "https:"].includes(endpoint.protocol)) {
      throw new Error(`${this.marketplace} handoff status URL must use http or https`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), handoffStatusTimeoutMs(metadata));
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...handoffAuthHeaders(connection, metadata),
        },
        signal: controller.signal,
      });
      const payload = await readHandoffPayload(response);
      if (!response.ok) {
        throw new Error(firstDefined(payload.error, payload.message, `${this.marketplace} handoff status sync failed (${response.status})`));
      }

      const status = normalizeHandoffStatus(
        firstDefined(payload.status, payload.handoffStatus, payload.handoff_status, payload.submissionStatus, payload.submission_status),
        listing.channel_status || listing.channelStatus,
      );
      const syncedAt = firstDefined(payload.syncedAt, payload.synced_at, payload.updatedAt, payload.updated_at, new Date().toISOString());
      const submissionReference = firstDefined(
        payload.submissionReference,
        payload.submission_reference,
        payload.reference,
        payload.ref,
        payload.id,
        currentHandoff.submissionReference,
      );
      const note = firstDefined(payload.note, payload.message, payload.error, currentHandoff.note);
      const handoff = {
        ...currentHandoff,
        submissionStatus: handoffSubmissionStatus(status),
        updatedAt: syncedAt,
      };
      if (submissionReference) handoff.submissionReference = String(submissionReference);
      if (note) handoff.note = String(note);

      return {
        marketplace: this.marketplace,
        externalListingId: firstDefined(payload.externalListingId, payload.external_listing_id, listing.external_listing_id, listing.externalListingId),
        status,
        payload: { ...payload, handoff },
        remoteUpdatedAt: firstDefined(payload.remoteUpdatedAt, payload.remote_updated_at, payload.updatedAt, payload.updated_at, syncedAt),
        syncedAt,
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`${this.marketplace} handoff status sync timed out`, { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  getShippingProfile(country = "CA") {
    return {
      originCountry: country,
      shippingService: country === "CA" ? "Canada Post Tracked Packet" : "USPS Ground Advantage",
      shippingCost: country === "CA" ? 4.99 : 3.99,
      dispatchDays: 2,
    };
  }

  mapForExport(listing) {
    const specifics = typeof listing.item_specifics === "string"
      ? JSON.parse(listing.item_specifics || "{}")
      : listing.item_specifics || {};

    return {
      title: listing.listing_title || listing.card_name,
      description: listing.listing_description || "",
      price: listing.buy_now_price || listing.start_price || 0,
      category: listing.category_path || "",
      condition: specifics.Condition || "",
      quantity: listing.quantity || 1,
      shippingService: this.getShippingProfile().shippingService,
      shippingCost: listing.shipping || this.getShippingProfile().shippingCost,
      marketplace: this.marketplace,
    };
  }
}
