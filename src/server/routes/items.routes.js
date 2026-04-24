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
         (id, parallel_id, intake_batch_id, purchase_id, name, player_name,
         manufacturer, sport, team, card_set, year, card_number, type, rarity,
          condition, parallel, binder, storage_location, cost_basis, acquisition_date,
          acquisition_source, status, listing_status, sale_status, listed_on,
          front_img_id, back_img_id, front_img_phash, price_estimate, price_history, market_price,
          suggested_listing_price, min_acceptable_price, last_comp_price,
          average_comp_price, psa9_price, psa10_price, profit_realized, sold_at,
          notes, centering, corners, edges, surface, projected_grade,
          grading_candidate, vault_status, condition_report, cv_centering_lr,
          cv_centering_tb, cv_centering_score, cv_processed, ebay_centering,
          ebay_corner_sharpness, ebay_edge_chipping)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          body.parallel_id || null,
          body.intake_batch_id || null,
          body.purchase_id || null,
          body.name,
          body.player_name,
          body.manufacturer,
          body.sport,
          body.team,
          body.card_set,
          body.year,
          body.card_number,
          body.type || "sports",
          body.rarity,
          body.condition || "near_mint",
          body.parallel,
          body.binder,
          body.storage_location,
          body.cost_basis ?? 0,
          body.acquisition_date,
          body.acquisition_source,
          body.status || "inventory",
          body.listing_status || "not_listed",
          body.sale_status || "available",
          json(body.listed_on),
          body.front_img_id,
          body.back_img_id,
          body.front_img_phash,
          json(body.price_estimate),
          json(body.price_history),
          body.market_price ?? 0,
          body.suggested_listing_price ?? 0,
          body.min_acceptable_price ?? 0,
          body.last_comp_price ?? 0,
          body.average_comp_price ?? 0,
          body.psa9_price ?? 0,
          body.psa10_price ?? 0,
          body.profit_realized ?? 0,
          body.sold_at || null,
          body.notes,
          body.centering || null,
          body.corners || null,
          body.edges || null,
          body.surface || null,
          body.projected_grade || null,
          body.grading_candidate || 0,
          body.vault_status || null,
          body.condition_report || null,
          body.cv_centering_lr || null,
          body.cv_centering_tb || null,
          body.cv_centering_score || null,
          body.cv_processed || 0,
          body.ebay_centering || null,
          body.ebay_corner_sharpness || null,
          body.ebay_edge_chipping || null,
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
          parallel_id=?, intake_batch_id=?, purchase_id=?, name=?, player_name=?,
          manufacturer=?, sport=?, team=?, card_set=?, year=?, card_number=?, type=?,
          rarity=?, condition=?, parallel=?, binder=?, storage_location=?,
          cost_basis=?, acquisition_date=?, acquisition_source=?, status=?,
          listing_status=?, sale_status=?, listed_on=?, front_img_id=?, back_img_id=?,
          front_img_phash=?, price_estimate=?, price_history=?, market_price=?, suggested_listing_price=?,
          min_acceptable_price=?, last_comp_price=?, average_comp_price=?,
          psa9_price=?, psa10_price=?, profit_realized=?, sold_at=?, notes=?,
          centering=?, corners=?, edges=?, surface=?, projected_grade=?,
          grading_candidate=?, vault_status=?, condition_report=?,
          cv_centering_lr=?, cv_centering_tb=?, cv_centering_score=?, cv_processed=?,
          ebay_centering=?, ebay_corner_sharpness=?, ebay_edge_chipping=?,
          updated_at=datetime('now')
         WHERE id=?`,
        [
          body.parallel_id,
          body.intake_batch_id,
          body.purchase_id,
          body.name,
          body.player_name,
          body.manufacturer,
          body.sport,
          body.team,
          body.card_set,
          body.year,
          body.card_number,
          body.type,
          body.rarity,
          body.condition,
          body.parallel,
          body.binder,
          body.storage_location,
          body.cost_basis ?? 0,
          body.acquisition_date,
          body.acquisition_source,
          body.status,
          body.listing_status,
          body.sale_status,
          json(body.listed_on),
          body.front_img_id,
          body.back_img_id,
          body.front_img_phash,
          json(body.price_estimate),
          json(body.price_history),
          body.market_price,
          body.suggested_listing_price,
          body.min_acceptable_price,
          body.last_comp_price,
          body.average_comp_price,
          body.psa9_price,
          body.psa10_price,
          body.profit_realized,
          body.sold_at,
          body.notes,
          body.centering,
          body.corners,
          body.edges,
          body.surface,
          body.projected_grade,
          body.grading_candidate,
          body.vault_status,
          body.condition_report,
          body.cv_centering_lr,
          body.cv_centering_tb,
          body.cv_centering_score,
          body.cv_processed,
          body.ebay_centering,
          body.ebay_corner_sharpness,
          body.ebay_edge_chipping,
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
