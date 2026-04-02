import { automateActionQueue } from "../services/automation/actionQueueAutomation.js";
import { runAcquisitionDecisionAutomation } from "../services/automation/acquisitionDecisionAutomation.js";
import { runAgingRepricingAutomation } from "../services/automation/agingRepricingAutomation.js";
import { runBundleLotAutomation } from "../services/automation/bundleLotAutomation.js";
import { runCashflowInventoryAutomation } from "../services/automation/cashflowInventoryAutomation.js";
import { detectDuplicateInventory } from "../services/automation/duplicateDetectionAutomation.js";
import { runGradingAutomation } from "../services/automation/gradingAutomation.js";
import { automateIdentificationAndPricing } from "../services/automation/identificationPricingAutomation.js";
import { automateListingGeneration } from "../services/automation/listingGenerationAutomation.js";
import { runMarketTrendAutomation } from "../services/automation/marketTrendAutomation.js";
import { addItemToBatch, createIntakeBatch, finalizeIntakeBatch, processBatchItem } from "../services/automation/scanIntakeBulkAutomation.js";
import { automateShipment } from "../services/automation/shippingAutomation.js";

export function registerAutomationRoutes(app) {
  app.post("/api/automation/identify-price/:itemId", async (req, res) => {
    try {
      res.json(await automateIdentificationAndPricing(req.params.itemId, req.body || {}));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/automation/listings/generate", (req, res) => {
    try {
      res.json(automateListingGeneration(req.body || {}));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/automation/aging-repricing", (req, res) => {
    try {
      res.json(runAgingRepricingAutomation(req.body || {}));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/automation/shipping/:orderId", (req, res) => {
    try {
      res.json(automateShipment(req.params.orderId, req.body || {}));
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

  app.post("/api/automation/acquisition-decision", (req, res) => {
    try {
      res.json(runAcquisitionDecisionAutomation(req.body || {}));
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

  app.post("/api/automation/intake/batches", (req, res) => {
    try {
      res.status(201).json(createIntakeBatch(req.body || {}));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/automation/intake/batches/:batchId/items", (req, res) => {
    try {
      res.status(201).json(addItemToBatch(req.params.batchId, req.body || {}));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/automation/intake/batch-items/:batchItemId/process", async (req, res) => {
    try {
      res.json(await processBatchItem(req.params.batchItemId, req.body || {}));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/automation/intake/batches/:batchId/finalize", (req, res) => {
    try {
      res.json(finalizeIntakeBatch(req.params.batchId, req.body || {}));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
