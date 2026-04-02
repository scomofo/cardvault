import { all, get, run } from "../database.js";
import { json } from "../mappers/recordMappers.js";
import { registerCRUD, uid } from "./shared.js";

export function registerCollectionRoutes(app) {
  registerCRUD(app, "trades", "partner", {
    columns: "id, partner, gave, received, gave_value, received_value, date, notes",
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
      res.json(all("SELECT * FROM purchases ORDER BY date DESC"));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/purchases", (req, res) => {
    try {
      const body = req.body;
      if (!body.name || body.price == null) {
        return res.status(400).json({ error: "name and price required" });
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
      res.status(201).json(get("SELECT * FROM purchases WHERE id = ?", [id]));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
