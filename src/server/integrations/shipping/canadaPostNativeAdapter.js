const SHIPMENT_NAMESPACE = "http://www.canadapost.ca/ws/shipment-v8";
const MANIFEST_NAMESPACE = "http://www.canadapost.ca/ws/manifest-v8";
const OZ_TO_KG = 0.028349523125;

function firstDefined(...values) {
  return values.find((value) => value != null && value !== "");
}

function field(metadata = {}, camelKey, snakeKey = null) {
  return firstDefined(metadata[camelKey], snakeKey ? metadata[snakeKey] : undefined);
}

function normalizePostalCode(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, "");
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(name, value, indent = "      ") {
  return `${indent}<${name}>${escapeXml(value)}</${name}>`;
}

function packageDimensions(metadata = {}, rate = {}, shipment = {}) {
  const dimensions = firstDefined(
    shipment.packageDimensionsCm,
    shipment.package_dimensions_cm,
    rate.packageDimensionsCm,
    rate.package_dimensions_cm,
    metadata.packageDimensionsCm,
    metadata.package_dimensions_cm,
  ) || {};
  const length = Number(firstDefined(dimensions.length, dimensions.lengthCm, dimensions.length_cm));
  const width = Number(firstDefined(dimensions.width, dimensions.widthCm, dimensions.width_cm));
  const height = Number(firstDefined(dimensions.height, dimensions.heightCm, dimensions.height_cm));
  return { length, width, height };
}

function shipFrom(metadata = {}) {
  const value = firstDefined(metadata.shipFrom, metadata.ship_from, metadata.originAddress, metadata.origin_address);
  return value && typeof value === "object" ? value : {};
}

function destinationAddress(shipment = {}) {
  const value = firstDefined(shipment.destination, shipment.destinationAddress, shipment.destination_address);
  return value && typeof value === "object" ? value : {};
}

function serviceCodeFrom(rate = {}, service = {}) {
  return firstDefined(
    service.serviceCode,
    service.service_code,
    rate.serviceCode,
    rate.service_code,
    rate.code,
  );
}

function missingLabel(key) {
  return {
    customerNumber: "customer number",
    contractId: "contract ID",
    originPostalCode: "origin postal code",
    destinationPostalCode: "destination postal code",
    serviceCode: "service code",
    originAddress: "origin address",
    packageDimensions: "package dimensions",
    weightOz: "package weight",
  }[key] || key;
}

export function validateCanadaPostShipmentReadiness({ metadata = {}, rate = {}, service = {}, shipment = {} } = {}) {
  const dimensions = packageDimensions(metadata, rate, shipment);
  const missing = [];
  if (!field(metadata, "customerNumber", "customer_number")) missing.push("customerNumber");
  if (!field(metadata, "contractId", "contract_id")) missing.push("contractId");
  if (!field(metadata, "originPostalCode", "origin_postal_code")) missing.push("originPostalCode");
  const origin = shipFrom(metadata);
  if (
    !firstDefined(origin.addressLine1, origin.address_line_1)
    || !origin.city
    || !firstDefined(origin.province, origin.provState, origin.prov_state)
  ) {
    missing.push("originAddress");
  }
  if (!firstDefined(shipment.destinationPostalCode, shipment.destination_postal_code, destinationAddress(shipment).postalCode)) {
    missing.push("destinationPostalCode");
  }
  if (!serviceCodeFrom(rate, service)) missing.push("serviceCode");
  if (![dimensions.length, dimensions.width, dimensions.height].every((value) => Number.isFinite(value) && value > 0)) {
    missing.push("packageDimensions");
  }
  if (!(Number(shipment.weightOz) > 0)) missing.push("weightOz");

  return {
    ok: missing.length === 0,
    missing,
    message: missing.length
      ? `Canada Post shipment preflight blocked: missing ${missing.map(missingLabel).join(", ")}`
      : "Canada Post shipment preflight ready",
  };
}

export function buildCanadaPostCreateShipmentPayload({ metadata = {}, rate = {}, service = {}, shipment = {} } = {}) {
  const preflight = validateCanadaPostShipmentReadiness({ metadata, rate, service, shipment });
  if (!preflight.ok) return { preflight, xml: null, endpointPath: null };

  const customerNumber = String(field(metadata, "customerNumber", "customer_number"));
  const mailedBy = String(firstDefined(field(metadata, "mailedBy", "mailed_by"), customerNumber));
  const contractId = field(metadata, "contractId", "contract_id");
  const paymentMethod = firstDefined(field(metadata, "paymentMethod", "payment_method"), "Account");
  const serviceCode = serviceCodeFrom(rate, service);
  const originPostalCode = normalizePostalCode(field(metadata, "originPostalCode", "origin_postal_code"));
  const destination = destinationAddress(shipment);
  const destinationPostalCode = normalizePostalCode(firstDefined(
    shipment.destinationPostalCode,
    shipment.destination_postal_code,
    destination.postalCode,
  ));
  const origin = shipFrom(metadata);
  const dimensions = packageDimensions(metadata, rate, shipment);
  const weightKg = (Number(shipment.weightOz) * OZ_TO_KG).toFixed(3);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<shipment xmlns="${SHIPMENT_NAMESPACE}">
  <customer-request-id>${escapeXml(shipment.shipmentId || "")}</customer-request-id>
  <delivery-spec>
    <service-code>${escapeXml(serviceCode)}</service-code>
    <sender>
${tag("company", origin.name || origin.company || "CardVault")}
${tag("contact-phone", origin.phone || "0000000000")}
      <address-details>
${tag("address-line-1", origin.addressLine1 || origin.address_line_1 || "")}
${tag("city", origin.city || "")}
${tag("prov-state", origin.province || origin.provState || origin.prov_state || "")}
${tag("postal-zip-code", normalizePostalCode(origin.postalCode || origin.postal_code || originPostalCode))}
      </address-details>
    </sender>
    <destination>
${tag("name", destination.name || "CardVault Buyer")}
      <address-details>
${tag("address-line-1", destination.addressLine1 || destination.address_line_1 || "")}
${tag("city", destination.city || "")}
${tag("prov-state", destination.province || destination.provState || destination.prov_state || "")}
${tag("country-code", shipment.country || destination.country || "CA")}
${tag("postal-code", destinationPostalCode)}
      </address-details>
    </destination>
    <parcel-characteristics>
${tag("weight", weightKg)}
      <dimensions>
${tag("length", dimensions.length.toFixed(1), "        ")}
${tag("width", dimensions.width.toFixed(1), "        ")}
${tag("height", dimensions.height.toFixed(1), "        ")}
      </dimensions>
    </parcel-characteristics>
    <preferences>
${tag("show-packing-instructions", "true")}
    </preferences>
    <settlement-info>
${tag("contract-id", contractId)}
${tag("intended-method-of-payment", paymentMethod)}
    </settlement-info>
    <references>
${tag("cost-centre", shipment.shipmentId || "")}
    </references>
    <notification>
${tag("email", origin.email || "noreply@example.com")}
${tag("on-shipment", "true")}
${tag("on-exception", "true")}
${tag("on-delivery", "true")}
    </notification>
    <requested-shipping-point>${escapeXml(originPostalCode)}</requested-shipping-point>
  </delivery-spec>
</shipment>`;

  return {
    preflight,
    xml,
    endpointPath: `/rs/${encodeURIComponent(customerNumber)}/${encodeURIComponent(mailedBy)}/shipment`,
  };
}

function extractTag(xml, tagName) {
  const match = String(xml || "").match(new RegExp(`<[^:>/]*:?${tagName}[^>]*>([^<]*)</[^:>/]*:?${tagName}>`, "i"));
  return match ? match[1].trim() : null;
}

function extractLink(xml, rel) {
  return extractLinks(xml, rel)[0] || null;
}

function extractLinks(xml, rel) {
  const links = [];
  const linkPattern = /<[^:>/]*:?link\b([^>]*)\/?>/gi;
  let match;
  while ((match = linkPattern.exec(String(xml || ""))) !== null) {
    const attrs = match[1];
    if (new RegExp(`\\brel=["']${rel}["']`, "i").test(attrs)) {
      const href = attrs.match(/\bhref=["']([^"']+)["']/i);
      if (href) links.push(href[1]);
    }
  }
  return links;
}

export function parseCanadaPostCreateShipmentResponse(xml) {
  return {
    shipmentId: extractTag(xml, "shipment-id"),
    trackingNumber: extractTag(xml, "tracking-pin"),
    labelUrl: extractLink(xml, "label"),
    selfUrl: extractLink(xml, "self"),
  };
}

export function buildCanadaPostTransmitShipmentsPayload({ metadata = {}, groupIds = [] } = {}) {
  const customerNumber = field(metadata, "customerNumber", "customer_number");
  const mailedBy = firstDefined(field(metadata, "mailedBy", "mailed_by"), customerNumber);
  const originPostalCode = normalizePostalCode(field(metadata, "originPostalCode", "origin_postal_code"));
  const origin = shipFrom(metadata);
  const groups = Array.isArray(groupIds) ? groupIds.filter(Boolean) : [];
  const missing = [];

  if (!customerNumber) missing.push("customerNumber");
  if (!originPostalCode) missing.push("originPostalCode");
  if (!groups.length) missing.push("groupIds");
  if (
    !firstDefined(origin.addressLine1, origin.address_line_1)
    || !origin.city
    || !firstDefined(origin.province, origin.provState, origin.prov_state)
  ) {
    missing.push("originAddress");
  }

  const preflight = {
    ok: missing.length === 0,
    missing,
    message: missing.length
      ? `Canada Post manifest preflight blocked: missing ${missing.map(missingLabel).join(", ")}`
      : "Canada Post manifest preflight ready",
  };
  if (!preflight.ok) return { preflight, xml: null, endpointPath: null };

  const paymentMethod = firstDefined(field(metadata, "paymentMethod", "payment_method"), "Account");
  const detailedManifests = firstDefined(field(metadata, "detailedManifests", "detailed_manifests"), true);
  const groupXml = groups.map((groupId) => tag("group-id", groupId, "      ")).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<transmit-set xmlns="${MANIFEST_NAMESPACE}">
  <group-ids>
${groupXml}
  </group-ids>
  <requested-shipping-point>${escapeXml(originPostalCode)}</requested-shipping-point>
  <method-of-payment>${escapeXml(paymentMethod)}</method-of-payment>
  <manifest-address>
${tag("manifest-company", origin.company || origin.name || "CardVault", "    ")}
${tag("phone-number", origin.phone || "0000000000", "    ")}
    <address-details>
${tag("address-line-1", origin.addressLine1 || origin.address_line_1 || "", "      ")}
${tag("city", origin.city || "", "      ")}
${tag("prov-state", origin.province || origin.provState || origin.prov_state || "", "      ")}
${tag("postal-zip-code", normalizePostalCode(origin.postalCode || origin.postal_code || originPostalCode), "      ")}
    </address-details>
  </manifest-address>
${tag("detailed-manifests", detailedManifests ? "true" : "false", "  ")}
</transmit-set>`;

  return {
    preflight,
    xml,
    endpointPath: `/rs/${encodeURIComponent(String(customerNumber))}/${encodeURIComponent(String(mailedBy))}/manifest`,
  };
}

export function parseCanadaPostManifestLinks(xml) {
  return {
    poNumber: extractTag(xml, "po-number"),
    manifestUrls: extractLinks(xml, "manifest"),
    artifactUrls: extractLinks(xml, "artifact"),
    detailsUrls: extractLinks(xml, "details"),
    selfUrls: extractLinks(xml, "self"),
  };
}
