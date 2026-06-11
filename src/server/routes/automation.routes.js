import { requireJsonBody } from "../validation/common.js";
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
