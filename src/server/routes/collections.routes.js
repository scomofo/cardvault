import { all, get, run } from "../database.js";
import {
  GRADING_FIELD_MAP,
  PURCHASE_FIELD_MAP,
  TRADE_FIELD_MAP,
  WATCHLIST_FIELD_MAP,
} from "../mappers/fieldMaps.js";
import { json } from "../mappers/recordMappers.js";
import { toCamel, toCamelArray } from "../mappers/recordMappers.js";
import { requireJsonBody } from "../validation/common.js";
import { registerCRUD, uid } from "./shared.js";

export function registerCollectionRoutes(app) {
  registerCRUD(app, "trades", "partner", {
    columns: "id, partner, gave, received, gave_value, received_value, date, notes",
    fieldMap: TRADE_FIELD_MAP,
    insert: (body, id) => [
      id,
      body.partner,
      body.gave,
      body.received,
      body.gave_value || 0,
      body.received_value || 0,
      body.date,
      body.notes,
    ],
    update: (body) => [
      body.partner,
      body.gave,
      body.received,
      body.gave_value,
      body.received_value,
      body.date,
      body.notes,
    ],
  });

  registerCRUD(app, "watchlist", "name", {
    columns: "id, name, card_set, card_number, target_price, current_price, price_history",
    fieldMap: WATCHLIST_FIELD_MAP,
    insert: (body, id) => [
      id,
      body.name,
      body.card_set,
      body.card_number,
      body.target_price || 0,
      body.current_price,
      json(body.price_history),
    ],
    update: (body) => [
      body.name,
      body.card_set,
      body.card_number,
      body.target_price,
      body.current_price,
      json(body.price_history),
    ],
  });

  registerCRUD(app, "gradings", "card_name", {
    columns:
      "id, card_name, card_set, card_number, company, service, cost, date_sent, pre_value, status, grade, cert_number, post_value",
    fieldMap: GRADING_FIELD_MAP,
    insert: (body, id) => [
      id,
      body.card_name,
      body.card_set,
      body.card_number,
      body.company || "PSA",
      body.service || "Economy",
      body.cost || 0,
      body.date_sent,
      body.pre_value || 0,
      body.status || "sent",
      body.grade,
      body.cert_number,
      body.post_value || 0,
    ],
    update: (body) => [
      body.card_name,
      body.card_set,
      body.card_number,
      body.company,
      body.service,
      body.cost,
      body.date_sent,
      body.pre_value,
      body.status,
      body.grade,
      body.cert_number,
      body.post_value,
    ],
  });

  app.get("/api/purchases", (_req, res) => {
    try {
      res.json(toCamelArray(all("SELECT * FROM purchases ORDER BY date DESC"), PURCHASE_FIELD_MAP));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/purchases", requireJsonBody, (req, res) => {
    try {
      const body = req.body;
      if (!body.name || body.price == null || isNaN(Number(body.price))) {
        return res.status(400).json({ error: "name and price required" });
      }
      if (body.shipping != null && isNaN(Number(body.shipping))) {
        return res.status(400).json({ error: "shipping must be numeric" });
      }
      if (body.total_cost != null && isNaN(Number(body.total_cost))) {
        return res.status(400).json({ error: "total_cost must be numeric" });
      }
      const id = body.id || uid();
      run(
        `INSERT INTO purchases (id, name, card_set, platform, seller, price, shipping, total_cost, date, notes)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          body.name,
          body.card_set,
          body.platform,
          body.seller,
          body.price,
          body.shipping || 0,
          body.total_cost || 0,
          body.date,
          body.notes,
        ],
      );
      res.status(201).json(toCamel(get("SELECT * FROM purchases WHERE id = ?", [id]), PURCHASE_FIELD_MAP));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/purchases/:id", requireJsonBody, (req, res) => {
    try {
      const existing = get("SELECT * FROM purchases WHERE id = ?", [req.params.id]);
      if (!existing) return res.status(404).json({ error: "Purchase not found" });

      const body = { ...existing, ...req.body };
      if (!body.name || body.price == null || isNaN(Number(body.price))) {
        return res.status(400).json({ error: "name and price required" });
      }
      if (body.shipping != null && isNaN(Number(body.shipping))) {
        return res.status(400).json({ error: "shipping must be numeric" });
      }
      if ((body.totalCost ?? body.total_cost) != null && isNaN(Number(body.totalCost ?? body.total_cost))) {
        return res.status(400).json({ error: "total_cost must be numeric" });
      }

      run(
        `UPDATE purchases SET
          name=?, card_set=?, platform=?, seller=?, price=?, shipping=?, total_cost=?, date=?, notes=?
         WHERE id=?`,
        [
          body.name,
          body.cardSet ?? body.card_set,
          body.platform,
          body.seller,
          body.price,
          body.shipping ?? 0,
          body.totalCost ?? body.total_cost ?? 0,
          body.date,
          body.notes,
          req.params.id,
        ],
      );
      res.json(toCamel(get("SELECT * FROM purchases WHERE id = ?", [req.params.id]), PURCHASE_FIELD_MAP));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/purchases/:id", (req, res) => {
    try {
      const result = run("DELETE FROM purchases WHERE id = ?", [req.params.id]);
      if (result.changes === 0) return res.status(404).json({ error: "Purchase not found" });
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
