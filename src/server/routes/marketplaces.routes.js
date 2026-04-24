import { all, get, run } from "../database.js";
import { MARKETPLACE_CONNECTION_FIELD_MAP } from "../mappers/fieldMaps.js";
import { toCamel, toCamelArray } from "../mappers/recordMappers.js";
import { requireJsonBody } from "../validation/common.js";
import { uid } from "./shared.js";
import { listSupportedMarketplaces } from "../integrations/marketplaces/marketplaceRegistry.js";
import {
  publishListingToMarketplace,
  reviseListingOnMarketplace,
  endListingOnMarketplace,
} from "../services/marketplaces/publishService.js";
import { crosspostListing, getListingChannelState } from "../services/marketplaces/crosspostService.js";
import { syncMarketplaceListings } from "../services/marketplaces/syncService.js";
import { exportListingsForMarketplace } from "../services/exports/marketplaceCsvExporter.js";

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

  app.post("/api/marketplace-connections", requireJsonBody, (req, res) => {
    try {
      const { marketplace, accountLabel, authStatus = "connected", metadata, shopName } = req.body;
      if (!marketplace) return res.status(400).json({ error: "marketplace required" });
      const resolvedAccountLabel = accountLabel || shopName || marketplace;
      const id = uid();
      run(
        `INSERT INTO marketplace_connections
         (id, marketplace, account_label, auth_status, metadata, created_at, updated_at)
         VALUES (?,?,?,?,?,datetime('now'),datetime('now'))`,
        [id, marketplace, resolvedAccountLabel, authStatus, JSON.stringify(metadata || {})],
      );
      res.status(201).json(
        toCamel(get(`${connectionSelect} WHERE id = ?`, [id]), MARKETPLACE_CONNECTION_FIELD_MAP),
      );
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/marketplaces/publish", requireJsonBody, async (req, res) => {
    try {
      const { listingId, marketplace, connectionId } = req.body;
      if (!listingId || !marketplace) {
        return res.status(400).json({ error: "listingId and marketplace required" });
      }
      res.json(await publishListingToMarketplace(listingId, marketplace, { connectionId }));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/marketplaces/revise", requireJsonBody, async (req, res) => {
    try {
      const { listingId, marketplace, overrides } = req.body;
      if (!listingId || !marketplace) {
        return res.status(400).json({ error: "listingId and marketplace required" });
      }
      res.json(await reviseListingOnMarketplace(listingId, marketplace, overrides || {}));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/marketplaces/end", requireJsonBody, async (req, res) => {
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

  app.post("/api/marketplaces/crosspost", requireJsonBody, async (req, res) => {
    try {
      const { listingId, marketplaces } = req.body;
      if (!listingId) return res.status(400).json({ error: "listingId required" });
      res.json(await crosspostListing(listingId, marketplaces || []));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/marketplaces/sync", requireJsonBody, async (req, res) => {
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
