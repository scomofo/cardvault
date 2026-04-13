import { requireJsonBody } from "../validation/common.js";
import { evaluateSubject } from "../services/decisions/decisionEngine.js";
import { addDecisionFeedback, listDecisions } from "../services/decisions/decisionStore.js";
import { getCalibratedConfidence } from "../services/decisions/confidenceCalibration.js";
import { DECISION_TYPES } from "../services/decisions/decisionTypes.js";

export function registerDecisionRoutes(app) {
  app.get("/api/decisions", (req, res) => {
    try {
      res.json(
        listDecisions({
          subjectType: req.query.subjectType,
          subjectId: req.query.subjectId,
          status: req.query.status,
        }),
      );
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/decisions/evaluate", requireJsonBody, (req, res) => {
    try {
      const { subjectType, subjectId, persist } = req.body;
      if (!subjectType || !subjectId) {
        return res.status(400).json({ error: "subjectType and subjectId required" });
      }
      if (typeof subjectType !== "string" || typeof subjectId !== "string") {
        return res.status(400).json({ error: "subjectType and subjectId must be strings" });
      }
      res.json(evaluateSubject(subjectType, subjectId, { persist: persist !== false }));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/decisions/calibration", (_req, res) => {
    try {
      const report = {};
      for (const decisionType of Object.values(DECISION_TYPES)) {
        report[decisionType] = getCalibratedConfidence(decisionType) || { confidence: null, sampleSize: 0, accepted: 0 };
      }
      res.json(report);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/decisions/:id/feedback", requireJsonBody, (req, res) => {
    try {
      if (!req.params.id) return res.status(400).json({ error: "decision id required" });
      const fb = req.body;
      if (fb.accepted == null && fb.rejected == null && !fb.notes) {
        return res.status(400).json({ error: "feedback content required" });
      }
      res.json(addDecisionFeedback(req.params.id, fb));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
