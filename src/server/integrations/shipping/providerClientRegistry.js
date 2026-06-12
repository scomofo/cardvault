import {
  buildCanadaPostCreateShipmentPayload,
  parseCanadaPostCreateShipmentResponse,
} from "./canadaPostNativeAdapter.js";

const DEFAULT_LABEL_PURCHASE_TIMEOUT_MS = 10000;
const PROVIDER_ERROR_TEXT_LIMIT = 200;
const CANADA_POST_CLIENT_KEY = "canada_post";
const CANADA_POST_LABEL_URL_TEMPLATE = "labels/canada-post/{trackingNumber}/{shipmentId}.pdf";
const CANADA_POST_HTTP_DEFAULTS = {
  apiKeyHeader: "Authorization",
  apiKeyPrefix: "Basic ",
};

function firstDefined(...values) {
  return values.find((value) => value != null && value !== "");
}

function labelPurchaseUrl(metadata = {}, rate = {}) {
  return firstDefined(
    rate.labelPurchaseUrl,
    rate.label_purchase_url,
    metadata.labelPurchaseUrl,
    metadata.label_purchase_url,
  );
}

function providerAuthHeaders(connection, metadata = {}, rate = {}, fallbackPrefix = "Bearer ") {
  if (!connection.api_key) return {};
  const headerName = String(firstDefined(rate.apiKeyHeader, rate.api_key_header, metadata.apiKeyHeader, metadata.api_key_header, "Authorization"));
  const rawPrefix = rate.apiKeyPrefix ?? rate.api_key_prefix ?? metadata.apiKeyPrefix ?? metadata.api_key_prefix;
  const headerPrefix = rawPrefix != null ? String(rawPrefix) : fallbackPrefix;
  return { [headerName]: `${headerPrefix}${connection.api_key}` };
}

function normalizeClientKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeProviderKey(value) {
  return normalizeClientKey(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function providerClientKey(connection = {}, metadata = {}, rate = {}) {
  const url = labelPurchaseUrl(metadata, rate);
  const configuredClient = firstDefined(
    rate.providerClient,
    rate.provider_client,
    metadata.providerClient,
    metadata.provider_client,
    rate.client,
    metadata.client,
  );
  if (configuredClient) return normalizeClientKey(configuredClient);
  if (!url) return "";
  return normalizeProviderKey(connection.provider) === CANADA_POST_CLIENT_KEY
    ? CANADA_POST_CLIENT_KEY
    : "generic_http";
}

function mergeDefaults(defaults, value = {}) {
  const merged = { ...defaults };
  for (const [key, entry] of Object.entries(value || {})) {
    if (entry !== undefined && entry !== null) merged[key] = entry;
  }
  return merged;
}

function failedPurchase(error) {
  return {
    labelStatus: "failed",
    error: String(error || "Provider label purchase failed"),
  };
}

function truncateProviderError(text) {
  return text.length > PROVIDER_ERROR_TEXT_LIMIT
    ? `${text.slice(0, PROVIDER_ERROR_TEXT_LIMIT)}...`
    : text;
}

async function readProviderPayload(response, { parseCanadaPostXml = false } = {}) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    if (parseCanadaPostXml) {
      const parsed = parseCanadaPostCreateShipmentResponse(text);
      if (parsed.shipmentId || parsed.trackingNumber || parsed.labelUrl) {
        return {
          labelStatus: "purchased",
          shipmentStatus: "shipped",
          trackingNumber: parsed.trackingNumber,
          labelUrl: parsed.labelUrl,
          providerShipmentId: parsed.shipmentId,
        };
      }
    }
    return { error: truncateProviderError(text) };
  }
}

function labelPurchaseTimeoutMs(metadata = {}, rate = {}) {
  const configuredTimeout = firstDefined(
    rate.labelPurchaseTimeoutMs,
    rate.label_purchase_timeout_ms,
    metadata.labelPurchaseTimeoutMs,
    metadata.label_purchase_timeout_ms,
  );
  const timeoutMs = Number(configuredTimeout);
  return Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_LABEL_PURCHASE_TIMEOUT_MS;
}

function purchasePayload({ connection, service, shipment }) {
  const postalCode = shipment.destinationPostalCode
    ? String(shipment.destinationPostalCode).toUpperCase().replace(/\s+/g, "")
    : null;
  return {
    shipmentId: shipment.shipmentId,
    provider: connection.provider,
    carrier: service.carrier,
    service: service.service,
    serviceCode: service.serviceCode,
    packageType: shipment.packageType,
    salePrice: shipment.salePrice,
    weightOz: shipment.weightOz,
    ...(shipment.dryRun === true ? { dryRun: true } : {}),
    destination: {
      country: shipment.country,
      postalCode,
    },
    ...(shipment.canadaPostCreateShipmentXml ? {
      canadaPost: {
        endpointPath: shipment.canadaPostEndpointPath,
        createShipmentXml: shipment.canadaPostCreateShipmentXml,
      },
    } : {}),
  };
}

async function purchaseLabelViaHttp({ connection, metadata, rate, service, shipment, parseCanadaPostXml = false }) {
  const url = labelPurchaseUrl(metadata, rate);
  if (!url) return null;

  let endpoint;
  try {
    endpoint = new URL(url);
  } catch {
    return failedPurchase("Invalid provider label purchase URL");
  }

  if (!["http:", "https:"].includes(endpoint.protocol)) {
    return failedPurchase("Provider label purchase URL must use http or https");
  }

  const headers = { "Content-Type": "application/json" };
  Object.assign(headers, providerAuthHeaders(connection, metadata, rate));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), labelPurchaseTimeoutMs(metadata, rate));

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(purchasePayload({ connection, service, shipment })),
      signal: controller.signal,
    });
    const payload = await readProviderPayload(response, { parseCanadaPostXml });
    if (!response.ok) {
      return failedPurchase(firstDefined(payload.error, payload.message, `Provider label purchase failed (${response.status})`));
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      return failedPurchase("Provider label purchase timed out");
    }
    return failedPurchase(error?.message);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function purchaseLabelViaCanadaPost(input) {
  const url = labelPurchaseUrl(input.metadata, input.rate);
  if (!url && input.shipment?.dryRun === true) return null;

  const nativePayload = buildCanadaPostCreateShipmentPayload(input);
  if (!nativePayload.preflight.ok) {
    return failedPurchase(nativePayload.preflight.message);
  }

  if (!url) {
    return failedPurchase("Canada Post native Create Shipment payload ready; configure a certified Canada Post label endpoint before purchasing labels");
  }

  const purchase = await purchaseLabelViaHttp({
    ...input,
    metadata: mergeDefaults(CANADA_POST_HTTP_DEFAULTS, input.metadata),
    shipment: {
      ...input.shipment,
      canadaPostCreateShipmentXml: nativePayload.xml,
      canadaPostEndpointPath: nativePayload.endpointPath,
    },
    parseCanadaPostXml: true,
  });
  if (!purchase || purchase.error) return purchase;

  const status = String(firstDefined(purchase.labelStatus, purchase.label_status, purchase.status, "")).toLowerCase();
  if (status === "failed" || firstDefined(purchase.labelUrl, purchase.label_url)) return purchase;

  return {
    ...purchase,
    labelUrl: CANADA_POST_LABEL_URL_TEMPLATE,
  };
}

const builtinClients = new Map([
  [CANADA_POST_CLIENT_KEY, { purchaseLabel: purchaseLabelViaCanadaPost }],
  ["generic_http", { purchaseLabel: purchaseLabelViaHttp }],
]);
const providerClients = new Map(builtinClients);

export function registerShippingProviderClient(key, client) {
  const normalizedKey = String(key || "").trim().toLowerCase();
  if (!normalizedKey) throw new Error("provider client key required");
  if (!client || typeof client.purchaseLabel !== "function") {
    throw new Error("provider client must expose purchaseLabel");
  }
  providerClients.set(normalizedKey, client);
}

export function resetShippingProviderClientsForTests() {
  providerClients.clear();
  for (const [key, client] of builtinClients) {
    providerClients.set(key, client);
  }
}

export function resolveShippingProviderClient(connection, metadata = {}, rate = {}) {
  const key = providerClientKey(connection, metadata, rate);
  return key ? providerClients.get(key) || null : null;
}
