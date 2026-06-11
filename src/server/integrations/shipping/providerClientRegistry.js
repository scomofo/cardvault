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

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
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
    const headerName = String(firstDefined(rate.apiKeyHeader, metadata.apiKeyHeader, "Authorization"));
    const headerPrefix = String(firstDefined(rate.apiKeyPrefix, metadata.apiKeyPrefix, "Bearer "));
    headers[headerName] = `${headerPrefix}${connection.api_key}`;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(purchasePayload({ connection, service, shipment })),
    });
    const payload = await readJson(response);
    if (!response.ok) {
      return failedPurchase(firstDefined(payload.error, payload.message, `Provider label purchase failed (${response.status})`));
    }
    return payload;
  } catch (error) {
    return failedPurchase(error.message);
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
