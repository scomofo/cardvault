import { all, get, run } from "../database.js";
import { toCamel, toCamelArray } from "../mappers/recordMappers.js";
import { requireJsonBody } from "../validation/common.js";

export function registerAlertsRoutes(app) {
  app.get("/api/alerts", (req, res) => {
    try {
      const status = req.query.status || "open";
      const rows = all(
        `SELECT
           a.id, a.item_id, a.listing_id, a.alert_type, a.severity,
           a.explanation, a.suggested_action, a.status,
           a.created_at, a.updated_at,
           ui.name AS item_name,
           ui.suggested_listing_price,
           ui.market_price,
           ui.listing_status
         FROM market_alerts a
         LEFT JOIN user_items ui ON ui.id = a.item_id
         WHERE a.status = ?
         ORDER BY
           CASE a.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
           a.created_at DESC
         LIMIT 100`,
        [status],
      );
      res.json(toCamelArray(rows));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/alerts/:id", requireJsonBody, (req, res) => {
    try {
      const existing = get("SELECT id FROM market_alerts WHERE id = ?", [req.params.id]);
      if (!existing) return res.status(404).json({ error: "Alert not found" });
      const { status } = req.body;
      const allowed = ["open", "resolved", "snoozed"];
      if (!allowed.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${allowed.join(", ")}` });
      }
      run(
        "UPDATE market_alerts SET status = ?, updated_at = datetime('now') WHERE id = ?",
        [status, req.params.id],
      );
      res.json(toCamel(get("SELECT * FROM market_alerts WHERE id = ?", [req.params.id])));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Bulk dismiss all open alerts of a type
  app.post("/api/alerts/dismiss-all", requireJsonBody, (req, res) => {
    try {
      const { alertType } = req.body;
      const where = alertType ? "status = 'open' AND alert_type = ?" : "status = 'open'";
      const params = alertType ? [alertType] : [];
      const result = run(
        `UPDATE market_alerts SET status = 'resolved', updated_at = datetime('now') WHERE ${where}`,
        params,
      );
      res.json({ dismissed: result.changes });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
