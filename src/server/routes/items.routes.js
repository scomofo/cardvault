import { all, get, run } from "../database.js";
import { ITEM_FIELD_MAP } from "../mappers/fieldMaps.js";
import {
  json,
  toCamel,
  toCamelArray,
  toSnake,
} from "../mappers/recordMappers.js";
import { validateItemPayload } from "../validation/writeValidators.js";
import { uid } from "./shared.js";

export function registerItemRoutes(app) {
  app.get("/api/items", (req, res) => {
    try {
      const { status, binder, search, sort } = req.query;
      let sql = "SELECT * FROM user_items WHERE 1=1";
      const params = [];

      if (status) {
        sql += " AND status = ?";
        params.push(status);
      }
      if (binder) {
        sql += " AND binder = ?";
        params.push(binder);
      }
      if (search) {
        sql += " AND (name LIKE ? OR card_set LIKE ? OR card_number LIKE ?)";
        const term = `%${search}%`;
        params.push(term, term, term);
      }

      const sortMap = {
        name: "name ASC",
        newest: "created_at DESC",
        oldest: "created_at ASC",
        value: "cost_basis DESC",
      };
      sql += ` ORDER BY ${sortMap[sort] || "created_at DESC"}`;

      res.json(toCamelArray(all(sql, params), ITEM_FIELD_MAP));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/items/:id", (req, res) => {
    try {
      const row = get("SELECT * FROM user_items WHERE id = ?", [req.params.id]);
      if (!row) return res.status(404).json({ error: "Item not found" });
      res.json(toCamel(row, ITEM_FIELD_MAP));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/items", validateItemPayload, (req, res) => {
    try {
      const body = toSnake(req.body);
      const id = body.id || uid();
      run(
        `INSERT INTO user_items
         (id, parallel_id, name, card_set, year, card_number, type, rarity,
          condition, parallel, binder, cost_basis, status, listed_on,
          front_img_id, back_img_id, price_estimate, price_history, notes,
          centering, corners, edges, surface, projected_grade, vault_status,
          condition_report, cv_centering_lr, cv_centering_tb, cv_centering_score, cv_processed)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          body.parallel_id || null,
          body.name,
          body.card_set,
          body.year,
          body.card_number,
          body.type || "sports",
          body.rarity,
          body.condition || "near_mint",
          body.parallel,
          body.binder,
          body.cost_basis ?? 0,
          body.status || "inventory",
          json(body.listed_on),
          body.front_img_id,
          body.back_img_id,
          json(body.price_estimate),
          json(body.price_history),
          body.notes,
          body.centering || null,
          body.corners || null,
          body.edges || null,
          body.surface || null,
          body.projected_grade || null,
          body.vault_status || null,
          body.condition_report || null,
          body.cv_centering_lr || null,
          body.cv_centering_tb || null,
          body.cv_centering_score || null,
          body.cv_processed || 0,
        ],
      );
      res
        .status(201)
        .json(toCamel(get("SELECT * FROM user_items WHERE id = ?", [id]), ITEM_FIELD_MAP));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/items/:id", validateItemPayload, (req, res) => {
    try {
      const existing = get("SELECT * FROM user_items WHERE id = ?", [req.params.id]);
      if (!existing) return res.status(404).json({ error: "Item not found" });

      const body = { ...existing, ...toSnake(req.body) };
      run(
        `UPDATE user_items SET
          parallel_id=?, name=?, card_set=?, year=?, card_number=?, type=?,
          rarity=?, condition=?, parallel=?, binder=?, cost_basis=?, status=?,
          listed_on=?, front_img_id=?, back_img_id=?, price_estimate=?,
          price_history=?, notes=?,
          centering=?, corners=?, edges=?, surface=?, projected_grade=?,
          vault_status=?, condition_report=?,
          cv_centering_lr=?, cv_centering_tb=?, cv_centering_score=?, cv_processed=?,
          updated_at=datetime('now')
         WHERE id=?`,
        [
          body.parallel_id,
          body.name,
          body.card_set,
          body.year,
          body.card_number,
          body.type,
          body.rarity,
          body.condition,
          body.parallel,
          body.binder,
          body.cost_basis ?? 0,
          body.status,
          json(body.listed_on),
          body.front_img_id,
          body.back_img_id,
          json(body.price_estimate),
          json(body.price_history),
          body.notes,
          body.centering,
          body.corners,
          body.edges,
          body.surface,
          body.projected_grade,
          body.vault_status,
          body.condition_report,
          body.cv_centering_lr,
          body.cv_centering_tb,
          body.cv_centering_score,
          body.cv_processed,
          req.params.id,
        ],
      );
      res.json(
        toCamel(get("SELECT * FROM user_items WHERE id = ?", [req.params.id]), ITEM_FIELD_MAP),
      );
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/items/:id", (req, res) => {
    try {
      const result = run("DELETE FROM user_items WHERE id = ?", [req.params.id]);
      if (result.changes === 0) return res.status(404).json({ error: "Item not found" });
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
