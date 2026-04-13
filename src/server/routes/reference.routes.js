import { all, get, run } from "../database.js";
import { json } from "../mappers/recordMappers.js";
import { requireJsonBody } from "../validation/common.js";
import { registerRef } from "./shared.js";

export function registerReferenceRoutes(app) {
  registerRef(app, "leagues", ["name", "sport_type"]);
  registerRef(app, "manufacturers", ["name", "licensing_status"]);

  app.get("/api/ref/teams", (req, res) => {
    try {
      let sql =
        "SELECT t.*, l.name as league_name FROM teams t LEFT JOIN leagues l ON t.league_id = l.id";
      const params = [];
      if (req.query.league_id) {
        sql += " WHERE t.league_id = ?";
        params.push(req.query.league_id);
      }
      res.json(all(sql, params));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ref/teams", requireJsonBody, (req, res) => {
    try {
      const body = req.body;
      if (!body.name) return res.status(400).json({ error: "name required" });
      run(
        "INSERT INTO teams (name, league_id, city, abbreviation) VALUES (?,?,?,?)",
        [body.name, body.league_id, body.city, body.abbreviation],
      );
      res.status(201).json({ id: get("SELECT last_insert_rowid() as id").id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ref/sets", (req, res) => {
    try {
      let sql =
        "SELECT cs.*, m.name as manufacturer_name FROM card_sets cs LEFT JOIN manufacturers m ON cs.manufacturer_id = m.id WHERE 1=1";
      const params = [];
      if (req.query.year) {
        sql += " AND cs.year = ?";
        params.push(req.query.year);
      }
      if (req.query.mfg) {
        sql += " AND cs.manufacturer_id = ?";
        params.push(req.query.mfg);
      }
      res.json(all(sql, params));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ref/sets", requireJsonBody, (req, res) => {
    try {
      const body = req.body;
      if (!body.set_name || !body.year) {
        return res.status(400).json({ error: "set_name and year required" });
      }
      run(
        "INSERT INTO card_sets (manufacturer_id, year, set_name, parent_set_id, sport_type, release_date) VALUES (?,?,?,?,?,?)",
        [
          body.manufacturer_id,
          body.year,
          body.set_name,
          body.parent_set_id,
          body.sport_type,
          body.release_date,
        ],
      );
      res.status(201).json({ id: get("SELECT last_insert_rowid() as id").id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ref/players", (req, res) => {
    try {
      let sql =
        "SELECT p.*, t.name as team_name FROM players p LEFT JOIN teams t ON p.team_id = t.id WHERE 1=1";
      const params = [];
      if (req.query.team) {
        sql += " AND p.team_id = ?";
        params.push(req.query.team);
      }
      if (req.query.search) {
        sql += " AND (p.first_name LIKE ? OR p.last_name LIKE ?)";
        params.push(`%${req.query.search}%`, `%${req.query.search}%`);
      }
      res.json(all(sql, params));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ref/players", requireJsonBody, (req, res) => {
    try {
      const body = req.body;
      if (!body.first_name || !body.last_name) {
        return res.status(400).json({ error: "first_name and last_name required" });
      }
      run(
        "INSERT INTO players (first_name, last_name, team_id, is_rookie, position) VALUES (?,?,?,?,?)",
        [body.first_name, body.last_name, body.team_id, body.is_rookie || 0, body.position],
      );
      res.status(201).json({ id: get("SELECT last_insert_rowid() as id").id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ref/cards", (req, res) => {
    try {
      let sql =
        "SELECT c.*, p.first_name, p.last_name FROM cards c LEFT JOIN players p ON c.player_id = p.id WHERE 1=1";
      const params = [];
      if (req.query.set_id) {
        sql += " AND c.set_id = ?";
        params.push(req.query.set_id);
      }
      res.json(all(sql, params));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ref/cards", requireJsonBody, (req, res) => {
    try {
      const body = req.body;
      if (!body.set_id || !body.card_number) return res.status(400).json({ error: "set_id and card_number required" });
      run(
        `INSERT INTO cards (set_id, player_id, card_number, is_base, is_rookie,
         has_autograph, is_memorabilia, is_short_print, error_type, attributes)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          body.set_id,
          body.player_id,
          body.card_number,
          body.is_base ?? 1,
          body.is_rookie || 0,
          body.has_autograph || 0,
          body.is_memorabilia || 0,
          body.is_short_print || 0,
          body.error_type,
          json(body.attributes),
        ],
      );
      res.status(201).json({ id: get("SELECT last_insert_rowid() as id").id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ref/parallels", (req, res) => {
    try {
      let sql = "SELECT * FROM parallels WHERE 1=1";
      const params = [];
      if (req.query.card_id) {
        sql += " AND card_id = ?";
        params.push(req.query.card_id);
      }
      res.json(all(sql, params));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ref/parallels", requireJsonBody, (req, res) => {
    try {
      const body = req.body;
      if (!body.variation_name) {
        return res.status(400).json({ error: "variation_name required" });
      }
      run(
        "INSERT INTO parallels (card_id, variation_name, color, print_run, is_1of1, tier) VALUES (?,?,?,?,?,?)",
        [
          body.card_id,
          body.variation_name,
          body.color,
          body.print_run,
          body.is_1of1 || 0,
          body.tier,
        ],
      );
      res.status(201).json({ id: get("SELECT last_insert_rowid() as id").id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
