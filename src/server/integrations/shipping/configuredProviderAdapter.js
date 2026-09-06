import { resolveShippingProviderClient } from "./providerClientRegistry.js";

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function firstDefined(...values) {
  return values.find((value) => value != null && value !== "");
}

function normalizeCountry(country) {
  return String(country || "").trim().toUpperCase();
}

function uncertainPurchase(error) {
  // A transport failure is not proof that the carrier did not charge us.
  return {
    labelStatus: "purchase_unknown",
    error: String(error?.message || error || "Check the provider before retrying this purchase"),
  };
}

function rateMatches(rate, { country, salePrice, weightOz }) {
  const countries = Array.isArray(rate.countries) ? rate.countries.map(normalizeCountry) : [];
  if (countries.length > 0 && !countries.includes(normalizeCountry(country))) return false;
  const minWeightOz = Number(rate.minWeightOz ?? rate.min_weight_oz ?? 0);
  const maxWeightOz = Number(rate.maxWeightOz ?? rate.max_weight_oz ?? Infinity);
  if (Number.isFinite(minWeightOz) && weightOz < minWeightOz) return false;
  if (Number.isFinite(maxWeightOz) && weightOz > maxWeightOz) return false;
  const minSalePrice = Number(rate.minSalePrice ?? rate.min_sale_price ?? 0);
  const maxSalePrice = Number(rate.maxSalePrice ?? rate.max_sale_price ?? Infinity);
  if (Number.isFinite(minSalePrice) && salePrice < minSalePrice) return false;
  if (Number.isFinite(maxSalePrice) && salePrice > maxSalePrice) return false;
  return true;
}

function normalizeLabelPurchase(value) {
  const purchase = parseJson(value, null);
  if (!purchase || typeof purchase !== "object" || Array.isArray(purchase)) {
    return uncertainPurchase("Provider returned no label confirmation — check its purchase history before retrying");
  }
  const rawStatus = String(firstDefined(purchase.labelStatus, purchase.label_status, purchase.status, "")).toLowerCase();
  if (rawStatus === "purchase_unknown") return uncertainPurchase(purchase.error);
  if (rawStatus === "failed" || purchase.error) {
    return { labelStatus: "failed", error: String(purchase.error || "Shipping label purchase failed") };
  }
  const labelUrl = firstDefined(purchase.labelUrl, purchase.label_url);
  // Only use artifacts returned by the purchase call. Rate metadata, example
  // labels and URL templates are not evidence of a real transaction.
  if (!labelUrl || typeof labelUrl !== "string") {
    return uncertainPurchase("Provider returned no label artifact — check its purchase history before retrying");
  }
  if (rawStatus && rawStatus !== "purchased") return { labelStatus: "pending" };
  return {
    labelStatus: "purchased",
    trackingNumber: firstDefined(purchase.trackingNumber, purchase.tracking_number) || null,
    labelUrl,
  };
}

function normalizeProviderRate(connection, metadata, rate, purchasedLabel, context = {}) {
  const cost = Number(firstDefined(rate.cost, rate.rate, rate.amount));
  if (!Number.isFinite(cost) || cost < 0) return null;
  const service = firstDefined(
    rate.service, rate.serviceName, rate.service_name, rate.name,
    metadata.defaultService, metadata.default_service, `${connection.provider} Shipping`,
  );
  const serviceCode = firstDefined(rate.serviceCode, rate.service_code, rate.code, "");
  // No client call means a quote only. Never promote metadata.labelPurchase
  // (often a setup example) into a purchased label.
  const purchase = purchasedLabel === undefined ? null : normalizeLabelPurchase(purchasedLabel);
  const purchased = purchase?.labelStatus === "purchased";
  return {
    carrier: firstDefined(rate.carrier, metadata.carrier, connection.provider),
    service, serviceCode, cost, tracking: rate.tracking !== false,
    trackingNumber: purchased ? purchase.trackingNumber : null,
    labelUrl: purchased ? purchase.labelUrl
      .replaceAll("{provider}", String(connection.provider).toLowerCase().replace(/\s+/g, "-"))
      .replaceAll("{trackingNumber}", purchase.trackingNumber || "")
      .replaceAll("{shipmentId}", context.shipmentId || "") : null,
    labelStatus: purchase?.labelStatus || "pending",
    shipmentStatus: purchase?.error ? "exception" : purchased ? "label_purchased" : "pending",
    purchaseError: purchase?.error || null,
    source: "provider_connection",
  };
}

function selectConfiguredProviderCandidate(connection, { country, salePrice, weightOz }) {
  if (!connection) return null;
  const metadata = parseJson(connection.metadata);
  const rates = Array.isArray(metadata.rates) ? metadata.rates : [];
  const candidates = rates
    .filter((rate) => rate && typeof rate === "object" && rateMatches(rate, { country, salePrice, weightOz }))
    .map((rate) => ({ metadata, rate, service: normalizeProviderRate(connection, metadata, rate) }))
    .filter((candidate) => candidate.service)
    .sort((a, b) => a.service.cost - b.service.cost);
  return candidates[0] || null;
}

export function selectConfiguredProviderService(connection, context) {
  return selectConfiguredProviderCandidate(connection, context)?.service || null;
}

export async function testConfiguredProviderService(connection, context) {
  const candidate = selectConfiguredProviderCandidate(connection, context);
  if (!candidate) return null;
  const client = resolveShippingProviderClient(connection, candidate.metadata, candidate.rate);
  if (!client) {
    return { service: candidate.service, endpointValidation: { attempted: false, ok: false } };
  }
  let purchasedLabel;
  try {
    purchasedLabel = await client.purchaseLabel({
      connection, metadata: candidate.metadata, rate: candidate.rate,
      service: candidate.service, shipment: { ...context, dryRun: true },
    });
  } catch (error) {
    purchasedLabel = uncertainPurchase(error);
  }
  if (purchasedLabel == null) return { service: candidate.service, endpointValidation: { attempted: false, ok: false } };
  const validated = ["validated", "validation_passed", "ready"].includes(String(purchasedLabel?.labelStatus || purchasedLabel?.status || "").toLowerCase());
  const service = validated ? { ...candidate.service, labelStatus: "validated" }
    : normalizeProviderRate(connection, candidate.metadata, candidate.rate, purchasedLabel, context) || candidate.service;
  const failed = !validated && (service.labelStatus !== "purchased" || Boolean(service.purchaseError));
  return {
    service,
    endpointValidation: {
      attempted: true, ok: !failed,
      labelStatus: service.labelStatus || null,
      trackingNumber: service.trackingNumber || null,
      labelUrl: service.labelUrl || null,
      error: failed ? service.purchaseError || "Provider did not confirm a label" : null,
    },
  };
}

export async function purchaseConfiguredProviderService(connection, context) {
  const candidate = selectConfiguredProviderCandidate(connection, context);
  if (!candidate) return null;
  const client = resolveShippingProviderClient(connection, candidate.metadata, candidate.rate);
  if (!client) return candidate.service;
  let purchasedLabel;
  try {
    purchasedLabel = await client.purchaseLabel({
      connection, metadata: candidate.metadata, rate: candidate.rate,
      service: candidate.service, shipment: context,
    });
  } catch (error) {
    purchasedLabel = uncertainPurchase(error);
  }
  return normalizeProviderRate(connection, candidate.metadata, candidate.rate, purchasedLabel, context) || candidate.service;
}
