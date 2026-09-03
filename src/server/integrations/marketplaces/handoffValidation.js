import { assertPublicOutboundUrl, fetchPublic } from "../../outboundUrlGuard.js";

const DEFAULT_HANDOFF_STATUS_TIMEOUT_MS = 10000;
const DEFAULT_HANDOFF_SUBMISSION_TIMEOUT_MS = 10000;
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

function handoffSubmissionUrl(metadata = {}) {
  return firstDefined(
    metadata.handoffSubmissionUrl,
    metadata.handoff_submission_url,
    metadata.submissionUrl,
    metadata.submission_url,
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

function handoffSubmissionTimeoutMs(metadata = {}) {
  const timeoutMs = Number(firstDefined(
    metadata.handoffSubmissionTimeoutMs,
    metadata.handoff_submission_timeout_ms,
    metadata.submissionTimeoutMs,
    metadata.submission_timeout_ms,
  ));
  return Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_HANDOFF_SUBMISSION_TIMEOUT_MS;
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

function handoffResultSummary(payload = {}, fallbackStatus = "submitted") {
  const status = normalizeHandoffStatus(
    firstDefined(payload.status, payload.handoffStatus, payload.handoff_status, payload.submissionStatus, payload.submission_status),
    fallbackStatus,
  );
  return {
    status,
    submissionStatus: handoffSubmissionStatus(status),
    submissionReference: firstDefined(
      payload.submissionReference,
      payload.submission_reference,
      payload.reference,
      payload.ref,
      payload.id,
      null,
    ),
    note: firstDefined(payload.note, payload.message, payload.error, null),
  };
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

async function handoffEndpoint(template, values, label) {
  return assertPublicOutboundUrl(renderTemplate(template, values), label);
}

async function endpointHost(template, values) {
  if (!template) return null;
  try {
    return (await handoffEndpoint(template, values, "handoff validation")).hostname;
  } catch {
    return null;
  }
}

async function testHandoffStatusEndpoint({ marketplace, connection, metadata, template, values }) {
  if (!template) return { attempted: false, ok: false, error: "Handoff status URL is not configured" };

  let endpoint;
  try {
    endpoint = await handoffEndpoint(template, values, `${marketplace} handoff status`);
  } catch (error) {
    return { attempted: true, ok: false, error: error.message };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), handoffStatusTimeoutMs(metadata));
  try {
    const response = await fetchPublic(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...handoffAuthHeaders(connection, metadata),
      },
      signal: controller.signal,
    }, `${marketplace} handoff status`);
    const payload = await readHandoffPayload(response);
    if (!response.ok) {
      return {
        attempted: true,
        ok: false,
        statusCode: response.status,
        error: firstDefined(payload.error, payload.message, `${marketplace} handoff status validation failed (${response.status})`),
      };
    }

    return {
      attempted: true,
      ok: true,
      statusCode: response.status,
      ...handoffResultSummary(payload, "submitted"),
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      error: error?.name === "AbortError"
        ? `${marketplace} handoff status validation timed out`
        : error.message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function validationSubmissionPayload(adapter, values) {
  const mapped = adapter.mapForExport({
    id: values.listingId,
    listing_title: "CardVault connection test",
    listing_description: "Dry-run partner handoff validation",
    start_price: 1,
    buy_now_price: 1,
    quantity: 1,
    item_specifics: {},
    handoff: { submissionStatus: "validation" },
  });
  return {
    dryRun: true,
    listingId: values.listingId,
    marketplace: adapter.marketplace,
    externalListingId: values.externalListingId || null,
    card: {
      title: firstDefined(mapped.Card, mapped.title, "CardVault connection test"),
      description: firstDefined(mapped.Notes, mapped.description, "Dry-run partner handoff validation"),
      price: firstDefined(mapped.AskPrice, mapped.DeclaredValue, mapped.ReservePrice, mapped.price, 1),
      quantity: firstDefined(mapped.Quantity, mapped.quantity, 1),
    },
    export: mapped,
    handoff: {
      submissionStatus: "validation",
      submissionReference: values.submissionReference,
    },
  };
}

async function testHandoffSubmissionEndpoint({ adapter, connection, metadata, template, values }) {
  if (!template) return { attempted: false, ok: false, error: "Handoff submission URL is not configured" };

  let endpoint;
  try {
    endpoint = await handoffEndpoint(template, values, `${adapter.marketplace} handoff submission`);
  } catch (error) {
    return { attempted: true, ok: false, error: error.message };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), handoffSubmissionTimeoutMs(metadata));
  try {
    const response = await fetchPublic(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...handoffAuthHeaders(connection, metadata),
      },
      body: JSON.stringify(validationSubmissionPayload(adapter, values)),
      signal: controller.signal,
    }, `${adapter.marketplace} handoff submission`);
    const payload = await readHandoffPayload(response);
    if (!response.ok) {
      return {
        attempted: true,
        ok: false,
        statusCode: response.status,
        error: firstDefined(payload.error, payload.message, `${adapter.marketplace} handoff submission validation failed (${response.status})`),
      };
    }

    return {
      attempted: true,
      ok: true,
      statusCode: response.status,
      ...handoffResultSummary(payload, "submitted"),
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      error: error?.name === "AbortError"
        ? `${adapter.marketplace} handoff submission validation timed out`
        : error.message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function testHandoffConnection(adapter, options = {}) {
  const connection = options.connection || {};
  const metadata = parseJsonObject(connection.metadata);
  const listingId = String(firstDefined(options.listingId, options.listing_id, "connection-test"));
  const submissionReference = String(firstDefined(options.submissionReference, options.submission_reference, "connection-test"));
  const values = {
    listingId,
    marketplace: adapter.marketplace,
    externalListingId: String(firstDefined(options.externalListingId, options.external_listing_id, "")),
    submissionReference,
    channelId: String(firstDefined(options.channelId, options.channel_id, "")),
  };
  const statusTemplate = handoffStatusUrl(metadata);
  const submissionTemplate = handoffSubmissionUrl(metadata);
  const endpointValidation = {
    status: await testHandoffStatusEndpoint({ marketplace: adapter.marketplace, connection, metadata, template: statusTemplate, values }),
    submission: await testHandoffSubmissionEndpoint({ adapter, connection, metadata, template: submissionTemplate, values }),
  };
  const attempted = Object.values(endpointValidation).filter((entry) => entry.attempted);

  return {
    ok: attempted.length > 0 && attempted.every((entry) => entry.ok),
    marketplace: adapter.marketplace,
    diagnostics: {
      statusEndpointConfigured: Boolean(statusTemplate),
      statusEndpointHost: await endpointHost(statusTemplate, values),
      submissionEndpointConfigured: Boolean(submissionTemplate),
      submissionEndpointHost: await endpointHost(submissionTemplate, values),
    },
    endpointValidation,
  };
}
