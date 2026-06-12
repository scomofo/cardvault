import { requireJsonBody } from "../validation/common.js";
import { requireProtectedConfigWrite } from "../auth.js";
import { all, get, run, runInImmediateTransaction } from "../database.js";
import { transmitCanadaPostManifest } from "../integrations/shipping/providerClientRegistry.js";
import { automateActionQueue } from "../services/automation/actionQueueAutomation.js";
import { runAcquisitionDecisionAutomation } from "../services/automation/acquisitionDecisionAutomation.js";
import { runAgingRepricingAutomation } from "../services/automation/agingRepricingAutomation.js";
import { runBundleLotAutomation } from "../services/automation/bundleLotAutomation.js";
import { runCashflowInventoryAutomation } from "../services/automation/cashflowInventoryAutomation.js";
import { detectDuplicateInventory } from "../services/automation/duplicateDetectionAutomation.js";
import { runGradingAutomation } from "../services/automation/gradingAutomation.js";
import { automateIdentificationAndPricing } from "../services/automation/identificationPricingAutomation.js";
import { refreshPricingForAllOwned } from "../services/pricing/batchRefresh.js";
import { automateListingGeneration } from "../services/automation/listingGenerationAutomation.js";
import { runMarketTrendAutomation } from "../services/automation/marketTrendAutomation.js";
import { addItemToBatch, createIntakeBatch, finalizeIntakeBatch, processBatchItem } from "../services/automation/scanIntakeBulkAutomation.js";
import { automateShipment } from "../services/automation/shippingAutomation.js";
import { uid } from "./shared.js";

const MANIFEST_ARTIFACT_STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function findCanadaPostConnection(connectionId) {
  if (connectionId) {
    return get("SELECT * FROM shipping_provider_connections WHERE id = ?", [connectionId]);
  }
  return get(
    `SELECT *
     FROM shipping_provider_connections
     WHERE lower(provider) = 'canada post'
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 1`,
  );
}

function jsonArray(value) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

function parseJsonArray(value) {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function truncateError(value) {
  const text = String(value || "Canada Post manifest failed");
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

function canadaPostManifestArtifactUrl(runId, artifactId) {
  return `/api/automation/shipping/canada-post/manifests/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}`;
}

function createCanadaPostManifestRun({ connectionId, groupIds }) {
  const id = uid();
  run(
    `INSERT INTO canada_post_manifest_runs
     (id, connection_id, status, group_ids, created_at, updated_at)
     VALUES (?, ?, 'running', ?, datetime('now'), datetime('now'))`,
    [id, connectionId || null, jsonArray(groupIds)],
  );
  return id;
}

function markCanadaPostManifestRunFailed(runId, error) {
  run(
    `UPDATE canada_post_manifest_runs
     SET status = 'failed', error = ?, completed_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`,
    [truncateError(error?.message || error), runId],
  );
}

function artifactBuffer(artifact) {
  if (Buffer.isBuffer(artifact?.content)) return artifact.content;
  if (artifact?.base64) return Buffer.from(String(artifact.base64), "base64");
  return Buffer.alloc(0);
}

function persistCanadaPostManifestResult({ runId, result }) {
  return runInImmediateTransaction((db) => {
    db.prepare(
      `UPDATE canada_post_manifest_runs
       SET status = 'completed',
           manifest_urls = ?,
           artifact_urls = ?,
           po_numbers = ?,
           error = NULL,
           completed_at = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      jsonArray(result.manifestUrls),
      jsonArray(result.artifactUrls),
      jsonArray(result.poNumbers),
      runId,
    );

    const insertArtifact = db.prepare(
      `INSERT INTO canada_post_manifest_artifacts
       (id, manifest_run_id, source_url, content_type, byte_size, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    );
    const artifacts = (Array.isArray(result.artifacts) ? result.artifacts : []).map((artifact) => {
      const content = artifactBuffer(artifact);
      if (content.length > MANIFEST_ARTIFACT_STORAGE_LIMIT_BYTES) {
        throw new Error("Canada Post manifest artifact exceeds the 5 MB storage limit");
      }
      const id = uid();
      const contentType = artifact.contentType || artifact.content_type || "application/pdf";
      insertArtifact.run(id, runId, artifact.url || null, contentType, content.length, content);
      return {
        ...artifact,
        id,
        contentType,
        bytes: content.length,
        downloadUrl: canadaPostManifestArtifactUrl(runId, id),
      };
    });

    return {
      ...result,
      id: runId,
      artifacts,
    };
  });
}

function publicManifestArtifact(row, runId) {
  return {
    id: row.id,
    sourceUrl: row.source_url,
    contentType: row.content_type || "application/pdf",
    bytes: Number(row.byte_size) || 0,
    createdAt: row.created_at,
    downloadUrl: canadaPostManifestArtifactUrl(runId, row.id),
  };
}

function publicManifestRun(row, artifacts) {
  const metadata = parseJson(row.metadata);
  return {
    id: row.id,
    connectionId: row.connection_id,
    provider: row.provider || "Canada Post",
    accountLabel: metadata.accountLabel || metadata.account_label || null,
    status: row.status,
    groupIds: parseJsonArray(row.group_ids),
    manifestUrls: parseJsonArray(row.manifest_urls),
    artifactUrls: parseJsonArray(row.artifact_urls),
    poNumbers: parseJsonArray(row.po_numbers),
    error: row.error,
    artifactCount: artifacts.length,
    artifacts,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

function listCanadaPostManifestRuns() {
  const rows = all(
    `SELECT r.*, c.provider, c.metadata
     FROM canada_post_manifest_runs r
     LEFT JOIN shipping_provider_connections c ON c.id = r.connection_id
     ORDER BY r.created_at DESC
     LIMIT 20`,
  );
  return rows.map((row) => {
    const artifacts = all(
      `SELECT id, source_url, content_type, byte_size, created_at
       FROM canada_post_manifest_artifacts
       WHERE manifest_run_id = ?
       ORDER BY created_at ASC`,
      [row.id],
    ).map((artifact) => publicManifestArtifact(artifact, row.id));
    return publicManifestRun(row, artifacts);
  });
}

function manifestArtifactFilename(row) {
  const poNumber = parseJsonArray(row.po_numbers)[0] || row.manifest_run_id;
  const safeId = String(poNumber || "manifest").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "manifest";
  return `canada-post-manifest-${safeId}.pdf`;
}

export function registerAutomationRoutes(app) {
  app.post("/api/automation/identify-price/:itemId", requireJsonBody, async (req, res) => {
    try {
      if (!req.params.itemId) return res.status(400).json({ error: "itemId required" });
      res.json(await automateIdentificationAndPricing(req.params.itemId, req.body));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/automation/pricing/refresh-all", requireJsonBody, async (req, res) => {
    try {
      const body = req.body || {};
      const limit = Number(body.limit) > 0 ? Number(body.limit) : undefined;
      const delayMs = Number(body.delayMs) >= 0 ? Number(body.delayMs) : undefined;
      const source = typeof body.source === "string" ? body.source : undefined;
      const forceRefresh = body.forceRefresh === true;
      res.json(await refreshPricingForAllOwned({ limit, delayMs, source, forceRefresh }));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/automation/listings/generate", requireJsonBody, (req, res) => {
    try {
      res.json(automateListingGeneration(req.body));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/automation/aging-repricing", requireJsonBody, (req, res) => {
    try {
      res.json(runAgingRepricingAutomation(req.body));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/automation/shipping/canada-post/manifest", requireProtectedConfigWrite, requireJsonBody, async (req, res) => {
    let runId = null;
    try {
      const groupIds = Array.isArray(req.body.groupIds)
        ? req.body.groupIds.map((entry) => String(entry).trim()).filter(Boolean)
        : [];
      if (groupIds.length === 0) return res.status(400).json({ error: "groupIds required" });

      const connection = findCanadaPostConnection(req.body.connectionId || req.body.connection_id || null);
      if (!connection) return res.status(404).json({ error: "Canada Post shipping provider connection not found" });

      runId = createCanadaPostManifestRun({ connectionId: connection.id, groupIds });
      const metadata = parseJson(connection.metadata);
      const result = await transmitCanadaPostManifest({ connection, metadata, groupIds });
      res.json(persistCanadaPostManifestResult({ runId, result }));
    } catch (error) {
      if (runId) markCanadaPostManifestRunFailed(runId, error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/automation/shipping/canada-post/manifests", requireProtectedConfigWrite, (_req, res) => {
    try {
      res.json(listCanadaPostManifestRuns());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/automation/shipping/canada-post/manifests/:runId/artifacts/:artifactId", requireProtectedConfigWrite, (req, res) => {
    try {
      const artifact = get(
        `SELECT a.*, r.po_numbers
         FROM canada_post_manifest_artifacts a
         JOIN canada_post_manifest_runs r ON r.id = a.manifest_run_id
         WHERE a.id = ? AND a.manifest_run_id = ?`,
        [req.params.artifactId, req.params.runId],
      );
      if (!artifact) return res.status(404).json({ error: "Canada Post manifest artifact not found" });

      res.setHeader("Content-Type", artifact.content_type || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${manifestArtifactFilename(artifact)}"`);
      res.send(Buffer.from(artifact.content));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/automation/shipping/:orderId", requireJsonBody, async (req, res) => {
    try {
      if (!req.params.orderId) return res.status(400).json({ error: "orderId required" });
      res.json(await automateShipment(req.params.orderId, req.body));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/automation/action-queue", (_req, res) => {
    try {
      res.json(automateActionQueue());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/automation/duplicates", (req, res) => {
    try {
      res.json(detectDuplicateInventory({ itemId: req.query.itemId || null }));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/automation/market-trends", (_req, res) => {
    try {
      res.json(runMarketTrendAutomation());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/automation/acquisition-decision", requireJsonBody, (req, res) => {
    try {
      res.json(runAcquisitionDecisionAutomation(req.body));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/automation/bundles", (_req, res) => {
    try {
      res.json(runBundleLotAutomation());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/automation/grading", (req, res) => {
    try {
      res.json(runGradingAutomation({ itemId: req.query.itemId || null }));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/automation/cashflow", (_req, res) => {
    try {
      res.json(runCashflowInventoryAutomation());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/automation/intake/batches", requireJsonBody, (req, res) => {
    try {
      res.status(201).json(createIntakeBatch(req.body));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/automation/intake/batches/:batchId/items", requireJsonBody, (req, res) => {
    try {
      if (!req.params.batchId) return res.status(400).json({ error: "batchId required" });
      if (!req.body.itemId) return res.status(400).json({ error: "itemId required" });
      res.status(201).json(addItemToBatch(req.params.batchId, req.body));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/automation/intake/batch-items/:batchItemId/process", requireJsonBody, async (req, res) => {
    try {
      if (!req.params.batchItemId) return res.status(400).json({ error: "batchItemId required" });
      res.json(await processBatchItem(req.params.batchItemId, req.body));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/automation/intake/batches/:batchId/finalize", requireJsonBody, (req, res) => {
    try {
      if (!req.params.batchId) return res.status(400).json({ error: "batchId required" });
      res.json(finalizeIntakeBatch(req.params.batchId, req.body));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
