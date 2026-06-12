import { all, get, run } from "../database.js";
import { requireProtectedConfigWrite } from "../auth.js";
import { testConfiguredProviderService } from "../integrations/shipping/configuredProviderAdapter.js";
import { requireJsonBody } from "../validation/common.js";
import { uid } from "./shared.js";

const SENSITIVE_METADATA_KEYS = /api[_-]?key|token|secret|password|authorization|auth[_-]?header|bearer/i;
const CANADA_POST_LABEL_URL_TEMPLATE = "labels/canada-post/{trackingNumber}/{shipmentId}.pdf";
const CANADA_POST_ENDPOINTS = {
  sandbox: "https://ct.soa-gw.canadapost.ca",
  production: "https://soa-gw.canadapost.ca",
};

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

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function providerKey(value) {
  return String(value || "").trim().toLowerCase();
}

function isCanadaPost(provider) {
  return providerKey(provider) === "canada post";
}

function metadataLabelPurchaseUrl(metadata = {}) {
  if (!metadata || typeof metadata !== "object") return undefined;
  return firstDefined(metadata.labelPurchaseUrl, metadata.label_purchase_url);
}

function validateLabelPurchaseUrl(metadata = {}) {
  const url = metadataLabelPurchaseUrl(metadata);
  if (!url) return;

  let endpoint;
  try {
    endpoint = new URL(url);
  } catch {
    throw badRequest("labelPurchaseUrl must be a valid URL");
  }

  if (!["http:", "https:"].includes(endpoint.protocol)) {
    throw badRequest("labelPurchaseUrl must use http or https");
  }
}

function normalizeProviderMetadata(provider, value) {
  const metadata = value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
  validateLabelPurchaseUrl(metadata);

  if (!isCanadaPost(provider)) return metadata;

  const environment = metadata.environment === "production" ? "production" : "sandbox";
  return {
    ...metadata,
    providerClient: firstDefined(metadata.providerClient, metadata.provider_client, "canada_post"),
    environment,
    apiBaseUrl: firstDefined(metadata.apiBaseUrl, metadata.api_base_url, CANADA_POST_ENDPOINTS[environment]),
    apiKeyHeader: firstDefined(metadata.apiKeyHeader, metadata.api_key_header, "Authorization"),
    apiKeyPrefix: metadata.apiKeyPrefix ?? metadata.api_key_prefix ?? "Basic ",
    labelUrlTemplate: firstDefined(metadata.labelUrlTemplate, metadata.label_url_template, CANADA_POST_LABEL_URL_TEMPLATE),
  };
}

function endpointHost(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function connectionDiagnostics(metadata = {}) {
  if (!metadata || typeof metadata !== "object") {
    return {
      providerClient: null,
      environment: null,
      endpointConfigured: false,
      endpointHost: null,
    };
  }
  const url = metadataLabelPurchaseUrl(metadata);
  return {
    providerClient: firstDefined(metadata.providerClient, metadata.provider_client, null),
    environment: firstDefined(metadata.environment, null),
    endpointConfigured: Boolean(url),
    endpointHost: endpointHost(url),
  };
}

function sanitizeMetadata(value) {
  if (Array.isArray(value)) return value.map(sanitizeMetadata);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_METADATA_KEYS.test(key))
      .map(([key, entry]) => [key, sanitizeMetadata(entry)]),
  );
}

function sanitizeConnection(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    authStatus: row.auth_status,
    hasApiKey: Boolean(row.api_key),
    metadata: sanitizeMetadata(parseJson(row.metadata)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeMetadata(value, provider) {
  return JSON.stringify(normalizeProviderMetadata(provider, value));
}

function serviceSummaries(metadata) {
  const rates = metadata && Array.isArray(metadata.rates) ? metadata.rates : [];
  return rates
    .filter((rate) => rate && typeof rate === "object")
    .map((rate) => ({
      service: rate.service || rate.serviceName || rate.service_name || rate.name || "",
      serviceCode: rate.serviceCode || rate.service_code || rate.code || "",
      countries: Array.isArray(rate.countries) ? rate.countries : [],
      cost: Number(rate.cost ?? rate.rate ?? rate.amount ?? 0),
      tracking: rate.tracking !== false,
    }));
}

function sendConnection(res, id) {
  res.json(sanitizeConnection(get("SELECT * FROM shipping_provider_connections WHERE id = ?", [id])));
}

export function registerShippingProviderConnectionRoutes(app) {
  app.get("/api/shipping-provider-connections", (_req, res) => {
    try {
      res.json(
        all("SELECT * FROM shipping_provider_connections ORDER BY updated_at DESC, created_at DESC")
          .map(sanitizeConnection),
      );
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/shipping-provider-connections", requireProtectedConfigWrite, requireJsonBody, (req, res) => {
    try {
      const provider = typeof req.body.provider === "string" ? req.body.provider.trim() : "";
      if (!provider) return res.status(400).json({ error: "provider required" });

      const id = uid();
      run(
        `INSERT INTO shipping_provider_connections
         (id, provider, auth_status, api_key, metadata, created_at, updated_at)
         VALUES (?,?,?,?,?,datetime('now'),datetime('now'))`,
        [
          id,
          provider,
          req.body.authStatus || req.body.auth_status || "configured",
          req.body.apiKey || req.body.api_key || null,
          normalizeMetadata(req.body.metadata, provider),
        ],
      );
      res.status(201);
      sendConnection(res, id);
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  app.put("/api/shipping-provider-connections/:id", requireProtectedConfigWrite, requireJsonBody, (req, res) => {
    try {
      const existing = get("SELECT * FROM shipping_provider_connections WHERE id = ?", [req.params.id]);
      if (!existing) return res.status(404).json({ error: "Shipping provider connection not found" });

      const provider = typeof req.body.provider === "string" && req.body.provider.trim()
        ? req.body.provider.trim()
        : existing.provider;
      const authStatus = req.body.authStatus || req.body.auth_status || existing.auth_status || "configured";
      const apiKey = Object.hasOwn(req.body, "apiKey") || Object.hasOwn(req.body, "api_key")
        ? (req.body.apiKey || req.body.api_key || null)
        : existing.api_key;
      const metadata = Object.hasOwn(req.body, "metadata")
        ? normalizeMetadata(req.body.metadata, provider)
        : existing.metadata;

      run(
        `UPDATE shipping_provider_connections
         SET provider = ?, auth_status = ?, api_key = ?, metadata = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [provider, authStatus, apiKey, metadata, req.params.id],
      );
      sendConnection(res, req.params.id);
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  app.post("/api/shipping-provider-connections/:id/test", requireProtectedConfigWrite, requireJsonBody, async (req, res) => {
    try {
      const connection = get("SELECT * FROM shipping_provider_connections WHERE id = ?", [req.params.id]);
      if (!connection) return res.status(404).json({ error: "Shipping provider connection not found" });

      const metadata = parseJson(connection.metadata);
      const diagnostics = connectionDiagnostics(metadata);
      const services = serviceSummaries(metadata).filter((service) => service.service);
      if (services.length === 0) {
        return res.status(400).json({ error: "At least one provider rate is required to test the connection" });
      }

      const validation = await testConfiguredProviderService(connection, {
        country: req.body.country || "CA",
        salePrice: Number(req.body.salePrice ?? req.body.sale_price ?? 100),
        weightOz: Number(req.body.weightOz ?? req.body.weight_oz ?? 3),
        shipmentId: "connection-test",
      });
      if (!validation) {
        return res.status(400).json({ error: "No provider rate matched the test shipment" });
      }
      if (!validation.endpointValidation.ok) {
        return res.status(400).json({
          error: `Provider label endpoint test failed: ${validation.endpointValidation.error || "unknown error"}`,
          provider: connection.provider,
          serviceCount: services.length,
          selectedService: validation.service.service,
          endpointValidation: validation.endpointValidation,
          diagnostics,
          services,
        });
      }

      run(
        "UPDATE shipping_provider_connections SET auth_status = ?, updated_at = datetime('now') WHERE id = ?",
        ["connected", req.params.id],
      );

      res.json({
        ok: true,
        provider: connection.provider,
        authStatus: "connected",
        serviceCount: services.length,
        selectedService: validation.service.service,
        endpointValidation: validation.endpointValidation,
        diagnostics,
        services,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
