import { evaluateSubject } from "../services/decisions/decisionEngine.js";
import { addDecisionFeedback, listDecisions } from "../services/decisions/decisionStore.js";

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

  app.post("/api/decisions/evaluate", (req, res) => {
    try {
      const { subjectType, subjectId, persist } = req.body;
      if (!subjectType || !subjectId) {
        return res.status(400).json({ error: "subjectType and subjectId required" });
      }
      res.json(evaluateSubject(subjectType, subjectId, { persist: persist !== false }));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/decisions/:id/feedback", (req, res) => {
    try {
      res.json(addDecisionFeedback(req.params.id, req.body || {}));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
