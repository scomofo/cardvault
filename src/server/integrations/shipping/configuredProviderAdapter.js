function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function firstDefined(...values) {
  return values.find((value) => value != null && value !== "");
}

function normalizeCountry(country) {
  return String(country || "").trim().toUpperCase();
}

function slug(value) {
  return String(value || "provider")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "provider";
}

function renderTemplate(template, values) {
  return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => values[key] ?? "");
}

function buildTracking(service, prefixOverride) {
  const prefix = prefixOverride || (service.includes("Lettermail") ? "LT" : "TRK");
  return `${prefix}${Date.now().toString().slice(-10)}`;
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

function normalizeLabelPurchase(value, { shipmentId, trackingNumber, labelTemplate, provider, serviceCode }) {
  const purchase = parseJson(value, null);
  if (!purchase || typeof purchase !== "object") return null;

  const rawStatus = String(firstDefined(purchase.labelStatus, purchase.label_status, purchase.status, "purchased")).toLowerCase();
  if (rawStatus === "failed" || purchase.error) {
    return {
      labelStatus: "failed",
      shipmentStatus: "exception",
      trackingNumber: null,
      labelUrl: null,
      error: String(purchase.error || "Shipping label purchase failed"),
    };
  }

  const resolvedTrackingNumber = firstDefined(purchase.trackingNumber, purchase.tracking_number, trackingNumber);
  const labelUrlTemplate = firstDefined(purchase.labelUrl, purchase.label_url, labelTemplate);
  return {
    labelStatus: firstDefined(purchase.labelStatus, purchase.label_status, "purchased"),
    shipmentStatus: firstDefined(purchase.shipmentStatus, purchase.shipment_status, "shipped"),
    trackingNumber: resolvedTrackingNumber,
    labelUrl: renderTemplate(labelUrlTemplate, {
      provider,
      serviceCode,
      shipmentId,
      trackingNumber: resolvedTrackingNumber || "",
    }),
  };
}

function normalizeProviderRate(connection, metadata, rate, shipmentId) {
  const cost = Number(firstDefined(rate.cost, rate.rate, rate.amount));
  if (!Number.isFinite(cost)) return null;

  const service = firstDefined(
    rate.service,
    rate.serviceName,
    rate.service_name,
    rate.name,
    metadata.defaultService,
    metadata.default_service,
    `${connection.provider} Shipping`,
  );
  const serviceCode = firstDefined(rate.serviceCode, rate.service_code, rate.code, "");
  const trackingPrefix = firstDefined(rate.trackingPrefix, rate.tracking_prefix, metadata.trackingPrefix, metadata.tracking_prefix);
  const tracking = rate.tracking !== false;
  const trackingNumber = tracking
    ? firstDefined(rate.trackingNumber, rate.tracking_number, buildTracking(service, trackingPrefix))
    : null;
  const labelTemplate = firstDefined(
    rate.labelUrlTemplate,
    rate.label_url_template,
    metadata.labelUrlTemplate,
    metadata.label_url_template,
    "labels/{shipmentId}.pdf",
  );
  const labelPurchase = normalizeLabelPurchase(
    firstDefined(rate.labelPurchase, rate.label_purchase, metadata.labelPurchase, metadata.label_purchase),
    {
      shipmentId,
      trackingNumber,
      labelTemplate,
      provider: slug(connection.provider),
      serviceCode: slug(serviceCode || service),
    },
  );

  return {
    carrier: firstDefined(rate.carrier, metadata.carrier, connection.provider),
    service,
    serviceCode,
    cost: labelPurchase?.labelStatus === "failed" ? 0 : cost,
    tracking,
    trackingNumber: labelPurchase?.labelStatus === "failed"
      ? null
      : firstDefined(labelPurchase?.trackingNumber, trackingNumber),
    labelUrl: labelPurchase?.labelStatus === "failed"
      ? null
      : firstDefined(labelPurchase?.labelUrl, renderTemplate(labelTemplate, {
        provider: slug(connection.provider),
        serviceCode: slug(serviceCode || service),
        shipmentId,
        trackingNumber: trackingNumber || "",
      })),
    labelStatus: labelPurchase?.labelStatus || "created",
    shipmentStatus: labelPurchase?.shipmentStatus || "shipped",
    purchaseError: labelPurchase?.error || null,
    source: "provider_connection",
  };
}

export function selectConfiguredProviderService(connection, { country, salePrice, weightOz, shipmentId }) {
  if (!connection) return null;

  const metadata = parseJson(connection.metadata);
  const rates = Array.isArray(metadata.rates) ? metadata.rates : [];
  const candidates = rates
    .filter((rate) => rate && typeof rate === "object" && rateMatches(rate, { country, salePrice, weightOz }))
    .map((rate) => normalizeProviderRate(connection, metadata, rate, shipmentId))
    .filter(Boolean)
    .sort((a, b) => a.cost - b.cost);

  return candidates[0] || null;
}
