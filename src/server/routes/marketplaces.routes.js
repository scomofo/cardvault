import { all, get, run } from "../database.js";
import { requireProtectedConfigWrite } from "../auth.js";
import { MARKETPLACE_CONNECTION_FIELD_MAP } from "../mappers/fieldMaps.js";
import { toCamel, toCamelArray } from "../mappers/recordMappers.js";
import { requireJsonBody } from "../validation/common.js";
import { uid } from "./shared.js";
import { getMarketplaceAdapter, listSupportedMarketplaces } from "../integrations/marketplaces/marketplaceRegistry.js";
import {
  publishListingToMarketplace,
  reviseListingOnMarketplace,
  endListingOnMarketplace,
  updateMarketplaceHandoffStatus,
  submitMarketplaceHandoffs,
} from "../services/marketplaces/publishService.js";
import { crosspostListing, getListingChannelState } from "../services/marketplaces/crosspostService.js";
import { syncMarketplaceListings } from "../services/marketplaces/syncService.js";
import { exportListingsForMarketplace } from "../services/exports/marketplaceCsvExporter.js";

function firstDefined(...values) {
  return values.find((value) => value != null && value !== "");
}

const HANDOFF_MARKETPLACES = new Set(["comc", "consignment"]);

function normalizeOptionalSecret(value, fieldName) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 4000) {
    throw new Error(`${fieldName} is too long`);
  }
  return trimmed;
}

function normalizeMarketplace(value) {
  return String(value || "").trim().toLowerCase();
}

export function registerMarketplaceRoutes(app) {
  const connectionSelect = `
    SELECT
      id,
      marketplace,
      account_label,
      auth_status,
      token_expires_at,
      metadata,
      created_at,
      updated_at
    FROM marketplace_connections
  `;

  app.get("/api/marketplaces", (_req, res) => {
    res.json({ marketplaces: listSupportedMarketplaces() });
  });

  app.get("/api/marketplace-connections", (_req, res) => {
    try {
      res.json(
        toCamelArray(
          all(`${connectionSelect} ORDER BY updated_at DESC, created_at DESC`),
          MARKETPLACE_CONNECTION_FIELD_MAP,
        ),
      );
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/marketplace-connections", requireProtectedConfigWrite, requireJsonBody, (req, res) => {
    try {
      const { marketplace, accountLabel, metadata, shopName } = req.body;
      if (!marketplace) return res.status(400).json({ error: "marketplace required" });
      const accessToken = normalizeOptionalSecret(firstDefined(req.body.accessToken, req.body.access_token), "accessToken");
      const refreshToken = normalizeOptionalSecret(firstDefined(req.body.refreshToken, req.body.refresh_token), "refreshToken");
      const tokenExpiresAt = normalizeOptionalSecret(firstDefined(req.body.tokenExpiresAt, req.body.token_expires_at), "tokenExpiresAt");
      const resolvedAccountLabel = accountLabel || shopName || marketplace;
      const authStatus = accessToken ? "connected" : "configured";
      const id = uid();
      run(
        `INSERT INTO marketplace_connections
         (id, marketplace, account_label, auth_status, access_token, refresh_token, token_expires_at, metadata, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
        [id, marketplace, resolvedAccountLabel, authStatus, accessToken, refreshToken, tokenExpiresAt, JSON.stringify(metadata || {})],
      );
      res.status(201).json(
        toCamel(get(`${connectionSelect} WHERE id = ?`, [id]), MARKETPLACE_CONNECTION_FIELD_MAP),
      );
    } catch (error) {
      if (error.message?.includes("must be") || error.message?.includes("too long")) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/marketplace-connections/:id/test", requireProtectedConfigWrite, requireJsonBody, async (req, res) => {
    try {
      const connection = get("SELECT * FROM marketplace_connections WHERE id = ?", [req.params.id]);
      if (!connection) return res.status(404).json({ error: "Marketplace connection not found" });

      const marketplace = normalizeMarketplace(connection.marketplace);
      if (!HANDOFF_MARKETPLACES.has(marketplace)) {
        return res.status(400).json({ error: "Marketplace connection tests are available for COMC and consignment handoff partners" });
      }

      const adapter = getMarketplaceAdapter(marketplace);
      const validation = await adapter.testHandoffConnection({
        connection,
        listingId: req.body.listingId || req.body.listing_id || "connection-test",
        submissionReference: req.body.submissionReference || req.body.submission_reference || "connection-test",
      });

      const attemptedEndpoints = Object.values(validation.endpointValidation || {})
        .filter((entry) => entry?.attempted);
      if (attemptedEndpoints.length === 0) {
        return res.status(400).json({
          ...validation,
          error: "Configure a handoff status or submission URL before testing this marketplace connection",
          authStatus: connection.auth_status,
        });
      }
      if (!validation.ok) {
        return res.status(400).json({
          ...validation,
          error: "Marketplace partner validation failed",
          authStatus: connection.auth_status,
        });
      }

      run(
        "UPDATE marketplace_connections SET auth_status = ?, updated_at = datetime('now') WHERE id = ?",
        ["connected", req.params.id],
      );

      res.json({
        ...validation,
        authStatus: "connected",
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/marketplaces/publish", requireProtectedConfigWrite, requireJsonBody, async (req, res) => {
    try {
      const { listingId, marketplace, connectionId } = req.body;
      if (!listingId || !marketplace) {
        return res.status(400).json({ error: "listingId and marketplace required" });
      }
      res.json(await publishListingToMarketplace(listingId, marketplace, { connectionId, confirmNotPublished: req.body.confirmNotPublished === true }));
    } catch (error) {
      if (error.code === "HANDOFF_LOCKED") {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/marketplaces/revise", requireProtectedConfigWrite, requireJsonBody, async (req, res) => {
    try {
      const { listingId, marketplace, overrides } = req.body;
      if (!listingId || !marketplace) {
        return res.status(400).json({ error: "listingId and marketplace required" });
      }
      res.json(await reviseListingOnMarketplace(listingId, marketplace, overrides || {}));
    } catch (error) {
      if (error.code === "HANDOFF_LOCKED") {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/marketplaces/end", requireProtectedConfigWrite, requireJsonBody, async (req, res) => {
    try {
      const { listingId, marketplace } = req.body;
      if (!listingId || !marketplace) {
        return res.status(400).json({ error: "listingId and marketplace required" });
      }
      res.json(await endListingOnMarketplace(listingId, marketplace));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/marketplaces/handoff/status", requireProtectedConfigWrite, requireJsonBody, (req, res) => {
    try {
      const { listingId, marketplace, status, submissionReference, note } = req.body;
      res.json(updateMarketplaceHandoffStatus({ listingId, marketplace, status, submissionReference, note }));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/marketplaces/handoff/submit", requireProtectedConfigWrite, requireJsonBody, async (req, res) => {
    try {
      const { marketplace, listingIds } = req.body;
      if (!marketplace) return res.status(400).json({ error: "marketplace required" });
      res.json(await submitMarketplaceHandoffs({ marketplace, listingIds: listingIds || [] }));
    } catch (error) {
      if (error.code === "HANDOFF_SUBMISSION_NOT_CONFIGURED") {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/marketplaces/crosspost", requireProtectedConfigWrite, requireJsonBody, async (req, res) => {
    try {
      const { listingId, marketplaces } = req.body;
      if (!listingId) return res.status(400).json({ error: "listingId required" });
      res.json(await crosspostListing(listingId, marketplaces || []));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/marketplaces/sync", requireProtectedConfigWrite, requireJsonBody, async (req, res) => {
    try {
      const { marketplace, listingId } = req.body;
      if (!marketplace) return res.status(400).json({ error: "marketplace required" });
      res.json(await syncMarketplaceListings(marketplace, listingId || null));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/marketplaces/listings/:id/channels", (req, res) => {
    try {
      res.json(getListingChannelState(req.params.id));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/marketplaces/export", requireJsonBody, (req, res) => {
    try {
      const { marketplace, listingIds, exportType } = req.body;
      if (!marketplace) return res.status(400).json({ error: "marketplace required" });
      res.json(exportListingsForMarketplace({ marketplace, listingIds: listingIds || [], exportType: exportType || "csv" }));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
