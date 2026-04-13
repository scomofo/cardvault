import { requireJsonBody } from "../validation/common.js";
import { identifyCard } from "../services/identification/identificationService.js";
import { storeConfirmedScan } from "../services/identificationLearning/confirmationStore.js";
import { storeIdentificationCorrection } from "../services/identificationLearning/correctionStore.js";
import { buildIdentificationDataset } from "../services/identificationLearning/datasetBuilder.js";
import { mineHardCases } from "../services/identificationLearning/hardCaseMiner.js";
import { findSimilarExamples, updateSimilarityIndexForItem } from "../services/identificationLearning/similarityIndex.js";

export function registerIdentificationRoutes(app) {
  app.post("/api/identification/identify", requireJsonBody, (req, res) => {
    try {
      const { itemId, batchItemId, ocrText } = req.body;
      if (!itemId) return res.status(400).json({ error: "itemId required" });
      res.json(identifyCard({ itemId, batchItemId, ocrText }));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/identification/confirm", requireJsonBody, (req, res) => {
    try {
      const { itemId, identificationResultId } = req.body;
      if (!itemId || !identificationResultId) return res.status(400).json({ error: "itemId and identificationResultId required" });
      res.json(storeConfirmedScan(req.body));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/identification/correct", requireJsonBody, (req, res) => {
    try {
      const { identificationResultId, correctedCatalogCardId } = req.body;
      if (!identificationResultId || !correctedCatalogCardId) return res.status(400).json({ error: "identificationResultId and correctedCatalogCardId required" });
      res.json(storeIdentificationCorrection(req.body));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/identification/similarity/:itemId", (req, res) => {
    try {
      res.json(updateSimilarityIndexForItem(req.params.itemId));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/identification/similarity/:itemId", (req, res) => {
    try {
      res.json(findSimilarExamples(req.params.itemId));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/identification/dataset", (_req, res) => {
    try {
      res.json(buildIdentificationDataset());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/identification/hard-cases", (_req, res) => {
    try {
      res.json(mineHardCases());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
