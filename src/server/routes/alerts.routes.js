import { all, get, run } from "../database.js";
import { toCamel, toCamelArray } from "../mappers/recordMappers.js";
import { requireJsonBody } from "../validation/common.js";

const ALERT_FIELD_MAP = {
  item_id: "itemId",
  listing_id: "listingId",
  alert_type: "alertType",
  suggested_action: "suggestedAction",
  created_at: "createdAt",
  updated_at: "updatedAt",
  item_name: "itemName",
  suggested_listing_price: "suggestedListingPrice",
  market_price: "marketPrice",
  listing_status: "listingStatus",
};

const ALLOWED_STATUSES = ["open", "resolved", "snoozed"];

function normalizeStatus(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "open";
}

export function registerAlertsRoutes(app) {
  app.get("/api/alerts", (req, res) => {
    try {
      const status = normalizeStatus(req.query.status);
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
      res.json(toCamelArray(rows, ALERT_FIELD_MAP));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/alerts/:id", requireJsonBody, (req, res) => {
    try {
      const existing = get("SELECT id FROM market_alerts WHERE id = ?", [req.params.id]);
      if (!existing) return res.status(404).json({ error: "Alert not found" });

      const status = normalizeStatus(req.body.status);
      if (!ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${ALLOWED_STATUSES.join(", ")}` });
      }

      run(
        "UPDATE market_alerts SET status = ?, updated_at = datetime('now') WHERE id = ?",
        [status, req.params.id],
      );
      res.json(toCamel(get("SELECT * FROM market_alerts WHERE id = ?", [req.params.id]), ALERT_FIELD_MAP));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/alerts/dismiss-all", requireJsonBody, (req, res) => {
    try {
      const alertType = typeof req.body.alertType === "string" && req.body.alertType.trim()
        ? req.body.alertType.trim()
        : null;
      const where = alertType ? "status = 'open' AND alert_type = ?" : "status = 'open'";
      const params = alertType ? [alertType] : [];
      const result = run(
        `UPDATE market_alerts SET status = 'resolved', updated_at = datetime('now') WHERE ${where}`,
        params,
      );
      res.json({ dismissed: result.changes });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
