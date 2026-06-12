const DEFAULT_LABEL_PURCHASE_TIMEOUT_MS = 10000;
const PROVIDER_ERROR_TEXT_LIMIT = 200;

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

function providerClientKey(metadata = {}, rate = {}) {
  const url = labelPurchaseUrl(metadata, rate);
  return String(firstDefined(
    rate.providerClient,
    rate.provider_client,
    metadata.providerClient,
    metadata.provider_client,
    rate.client,
    metadata.client,
    url ? "generic_http" : null,
  ) || "").trim().toLowerCase();
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

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
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
      postalCode: shipment.destinationPostalCode || null,
    },
  };
}

async function purchaseLabelViaHttp({ connection, metadata, rate, service, shipment }) {
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
  if (connection.api_key) {
    const headerName = String(firstDefined(rate.apiKeyHeader, rate.api_key_header, metadata.apiKeyHeader, metadata.api_key_header, "Authorization"));
    const rawPrefix = rate.apiKeyPrefix ?? rate.api_key_prefix ?? metadata.apiKeyPrefix ?? metadata.api_key_prefix;
    const headerPrefix = rawPrefix != null ? String(rawPrefix) : "Bearer ";
    headers[headerName] = `${headerPrefix}${connection.api_key}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), labelPurchaseTimeoutMs(metadata, rate));

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(purchasePayload({ connection, service, shipment })),
      signal: controller.signal,
    });
    const payload = await readJson(response);
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

const builtinClients = new Map([
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

export function resolveShippingProviderClient(_connection, metadata = {}, rate = {}) {
  const key = providerClientKey(metadata, rate);
  return key ? providerClients.get(key) || null : null;
}
