import { run, get, all } from "./database.js";
import crypto from "crypto";

const uid = () => crypto.randomUUID();

// ─── Field name conversion (snake_case DB ↔ camelCase React) ────────────
const ITEM_FIELD_MAP = {
  card_set: "set", card_number: "number", cost_basis: "costBasis",
  listed_on: "listedOn", front_img_id: "frontImgId", back_img_id: "backImgId",
  price_estimate: "priceEstimate", price_history: "priceHistory",
  parallel_id: "parallelId", created_at: "createdAt", updated_at: "updatedAt",
  projected_grade: "projected_grade", vault_status: "vault_status",
  condition_report: "condition_report",
  cv_centering_lr: "cv_centering_lr", cv_centering_tb: "cv_centering_tb",
  cv_centering_score: "cv_centering_score", cv_processed: "cv_processed",
  ebay_centering: "ebay_centering", ebay_corner_sharpness: "ebay_corner_sharpness",
  ebay_edge_chipping: "ebay_edge_chipping",
};

const SALE_FIELD_MAP = {
  card_id: "cardId", card_name: "cardName", card_set: "cardSet",
  sale_price: "salePrice", cost_basis: "costBasis", shipping_cost: "shippingCost",
  net_profit: "netProfit", listing_id: "listingId",
};

const LISTING_FIELD_MAP = {
  card_id: "cardId", card_name: "cardName", card_set: "cardSet",
  card_number: "cardNumber", start_price: "startPrice", buy_now_price: "buyNowPrice",
  auction_end_date: "auctionEndDate", current_bid: "currentBid",
  sold_price: "soldPrice", sold_date: "soldDate", created_at: "createdAt",
};

function toCamel(row, map) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const camelKey = map[k] || k;
    // Parse JSON strings for array/object fields
    if ((camelKey === "listedOn" || camelKey === "priceEstimate" || camelKey === "priceHistory") && typeof v === "string") {
      try { out[camelKey] = JSON.parse(v); } catch { out[camelKey] = v; }
    } else {
      out[camelKey] = v;
    }
  }
  return out;
}

/** Convert camelCase body fields to snake_case for DB merge. */
function toSnake(body) {
  if (!body) return body;
  const out = { ...body };
  // Map camelCase → snake_case so they override existing DB values
  if ("cardSet" in out) { out.card_set = out.cardSet; delete out.cardSet; }
  if ("cardNumber" in out) { out.card_number = out.cardNumber; delete out.cardNumber; }
  if ("costBasis" in out) { out.cost_basis = out.costBasis; delete out.costBasis; }
  if ("listedOn" in out) { out.listed_on = out.listedOn; delete out.listedOn; }
  if ("frontImgId" in out) { out.front_img_id = out.frontImgId; delete out.frontImgId; }
  if ("backImgId" in out) { out.back_img_id = out.backImgId; delete out.backImgId; }
  if ("priceEstimate" in out) { out.price_estimate = out.priceEstimate; delete out.priceEstimate; }
  if ("priceHistory" in out) { out.price_history = out.priceHistory; delete out.priceHistory; }
  if ("parallelId" in out) { out.parallel_id = out.parallelId; delete out.parallelId; }
  // Listing-specific fields
  if ("cardId" in out) { out.card_id = out.cardId; delete out.cardId; }
  if ("cardName" in out) { out.card_name = out.cardName; delete out.cardName; }
  if ("startPrice" in out) { out.start_price = out.startPrice; delete out.startPrice; }
  if ("buyNowPrice" in out) { out.buy_now_price = out.buyNowPrice; delete out.buyNowPrice; }
  if ("auctionEndDate" in out) { out.auction_end_date = out.auctionEndDate; delete out.auctionEndDate; }
  if ("currentBid" in out) { out.current_bid = out.currentBid; delete out.currentBid; }
  if ("soldPrice" in out) { out.sold_price = out.soldPrice; delete out.soldPrice; }
  if ("soldDate" in out) { out.sold_date = out.soldDate; delete out.soldDate; }
  // Sale-specific fields
  if ("salePrice" in out) { out.sale_price = out.salePrice; delete out.salePrice; }
  if ("shippingCost" in out) { out.shipping_cost = out.shippingCost; delete out.shippingCost; }
  if ("netProfit" in out) { out.net_profit = out.netProfit; delete out.netProfit; }
  if ("listingId" in out) { out.listing_id = out.listingId; delete out.listingId; }
  return out;
}

function toCamelArray(rows, map) {
  return (rows || []).map((r) => toCamel(r, map));
}

export function registerRoutes(app) {
  // ─── User Items (catalog) ───────────────────────────────────────────
  app.get("/api/items", (req, res) => {
    try {
      const { status, binder, search, sort } = req.query;
      let sql = "SELECT * FROM user_items WHERE 1=1";
      const params = [];

      if (status) { sql += " AND status = ?"; params.push(status); }
      if (binder) { sql += " AND binder = ?"; params.push(binder); }
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
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/items/:id", (req, res) => {
    try {
      const row = get("SELECT * FROM user_items WHERE id = ?", [req.params.id]);
      if (!row) return res.status(404).json({ error: "Item not found" });
      res.json(toCamel(row, ITEM_FIELD_MAP));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/items", (req, res) => {
    try {
      const b = toSnake(req.body);
      const id = b.id || uid();
      run(
        `INSERT INTO user_items
         (id, parallel_id, name, card_set, year, card_number, type, rarity,
          condition, parallel, binder, cost_basis, status, listed_on,
          front_img_id, back_img_id, price_estimate, price_history, notes,
          centering, corners, edges, surface, projected_grade, vault_status,
          condition_report, cv_centering_lr, cv_centering_tb, cv_centering_score, cv_processed)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, b.parallel_id || null, b.name, b.card_set, b.year, b.card_number,
         b.type || "sports", b.rarity, b.condition || "near_mint", b.parallel,
         b.binder, b.cost_basis ?? 0, b.status || "inventory",
         json(b.listed_on), b.front_img_id, b.back_img_id,
         json(b.price_estimate), json(b.price_history), b.notes,
         b.centering || null, b.corners || null, b.edges || null, b.surface || null,
         b.projected_grade || null, b.vault_status || null, b.condition_report || null,
         b.cv_centering_lr || null, b.cv_centering_tb || null, b.cv_centering_score || null,
         b.cv_processed || 0]
      );
      res.status(201).json(toCamel(get("SELECT * FROM user_items WHERE id = ?", [id]), ITEM_FIELD_MAP));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/items/:id", (req, res) => {
    try {
      const existing = get("SELECT * FROM user_items WHERE id = ?", [req.params.id]);
      if (!existing) return res.status(404).json({ error: "Item not found" });

      const b = { ...existing, ...toSnake(req.body) };
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
        [b.parallel_id, b.name, b.card_set, b.year, b.card_number, b.type,
         b.rarity, b.condition, b.parallel, b.binder, b.cost_basis ?? 0, b.status,
         json(b.listed_on), b.front_img_id, b.back_img_id,
         json(b.price_estimate), json(b.price_history), b.notes,
         b.centering, b.corners, b.edges, b.surface, b.projected_grade,
         b.vault_status, b.condition_report,
         b.cv_centering_lr, b.cv_centering_tb, b.cv_centering_score, b.cv_processed,
         req.params.id]
      );
      res.json(toCamel(get("SELECT * FROM user_items WHERE id = ?", [req.params.id]), ITEM_FIELD_MAP));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/items/:id", (req, res) => {
    try {
      const result = run("DELETE FROM user_items WHERE id = ?", [req.params.id]);
      if (result.changes === 0) return res.status(404).json({ error: "Item not found" });
      res.json({ deleted: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Sales ──────────────────────────────────────────────────────────
  app.get("/api/sales", (_req, res) => {
    try { res.json(toCamelArray(all("SELECT * FROM sales ORDER BY date DESC"), SALE_FIELD_MAP)); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/sales", (req, res) => {
    try {
      const b = toSnake(req.body);
      if (!b.sale_price) return res.status(400).json({ error: "sale_price required" });
      const id = b.id || uid();
      run(
        `INSERT INTO sales (id, card_id, card_name, card_set, sale_price,
         cost_basis, platform, fees, shipping_cost, net_profit, listing_id, date)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, b.card_id, b.card_name, b.card_set, b.sale_price,
         b.cost_basis || 0, b.platform, b.fees || 0, b.shipping_cost || 0,
         b.net_profit || 0, b.listing_id, b.date || new Date().toISOString()]
      );
      if (b.card_id) {
        run("UPDATE user_items SET status = 'sold', updated_at = datetime('now') WHERE id = ?", [b.card_id]);
      }
      res.status(201).json(toCamel(get("SELECT * FROM sales WHERE id = ?", [id]), SALE_FIELD_MAP));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Listings ───────────────────────────────────────────────────────
  app.get("/api/listings", (req, res) => {
    try {
      const { status } = req.query;
      let sql = "SELECT * FROM listings";
      const params = [];
      if (status) { sql += " WHERE status = ?"; params.push(status); }
      sql += " ORDER BY created_at DESC";
      res.json(toCamelArray(all(sql, params), LISTING_FIELD_MAP));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/listings", (req, res) => {
    try {
      const b = toSnake(req.body);
      if (!b.platform) return res.status(400).json({ error: "platform required" });
      const id = b.id || uid();
      run(
        `INSERT INTO listings (id, card_id, card_name, card_set, card_number,
         platform, format, start_price, buy_now_price, auction_end_date,
         shipping, current_bid, status, notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, b.card_id, b.card_name, b.card_set, b.card_number,
         b.platform, b.format || "fixed", b.start_price, b.buy_now_price,
         b.auction_end_date, b.shipping || 0, b.current_bid,
         b.status || "active", b.notes]
      );
      if (b.card_id) {
        run("UPDATE user_items SET status = 'listed', updated_at = datetime('now') WHERE id = ?", [b.card_id]);
      }
      res.status(201).json(toCamel(get("SELECT * FROM listings WHERE id = ?", [id]), LISTING_FIELD_MAP));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/listings/:id", (req, res) => {
    try {
      const existing = get("SELECT * FROM listings WHERE id = ?", [req.params.id]);
      if (!existing) return res.status(404).json({ error: "Listing not found" });
      const b = { ...existing, ...toSnake(req.body) };
      run(
        `UPDATE listings SET card_id=?, card_name=?, card_set=?, card_number=?,
         platform=?, format=?, start_price=?, buy_now_price=?, auction_end_date=?,
         shipping=?, current_bid=?, status=?, sold_price=?, sold_date=?, notes=?
         WHERE id=?`,
        [b.card_id, b.card_name, b.card_set, b.card_number, b.platform,
         b.format, b.start_price, b.buy_now_price, b.auction_end_date,
         b.shipping, b.current_bid, b.status, b.sold_price, b.sold_date,
         b.notes, req.params.id]
      );
      res.json(toCamel(get("SELECT * FROM listings WHERE id = ?", [req.params.id]), LISTING_FIELD_MAP));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/listings/:id", (req, res) => {
    try {
      const result = run("DELETE FROM listings WHERE id = ?", [req.params.id]);
      if (result.changes === 0) return res.status(404).json({ error: "Listing not found" });
      res.json({ deleted: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Trades ─────────────────────────────────────────────────────────
  registerCRUD(app, "trades", "partner", {
    columns: "id, partner, gave, received, gave_value, received_value, date, notes",
    insert: (b, id) => [id, b.partner, b.gave, b.received,
      b.gave_value || 0, b.received_value || 0, b.date, b.notes],
    update: (b) => [b.partner, b.gave, b.received,
      b.gave_value, b.received_value, b.date, b.notes],
  });

  // ─── Watchlist ──────────────────────────────────────────────────────
  registerCRUD(app, "watchlist", "name", {
    columns: "id, name, card_set, card_number, target_price, current_price, price_history",
    insert: (b, id) => [id, b.name, b.card_set, b.card_number,
      b.target_price || 0, b.current_price, json(b.price_history)],
    update: (b) => [b.name, b.card_set, b.card_number,
      b.target_price, b.current_price, json(b.price_history)],
  });

  // ─── Gradings ───────────────────────────────────────────────────────
  registerCRUD(app, "gradings", "card_name", {
    columns: "id, card_name, card_set, card_number, company, service, cost, date_sent, pre_value, status, grade, cert_number, post_value",
    insert: (b, id) => [id, b.card_name, b.card_set, b.card_number,
      b.company || "PSA", b.service || "Economy", b.cost || 0, b.date_sent,
      b.pre_value || 0, b.status || "sent", b.grade, b.cert_number, b.post_value || 0],
    update: (b) => [b.card_name, b.card_set, b.card_number, b.company,
      b.service, b.cost, b.date_sent, b.pre_value, b.status, b.grade,
      b.cert_number, b.post_value],
  });

  // ─── Purchases ──────────────────────────────────────────────────────
  app.get("/api/purchases", (_req, res) => {
    try { res.json(all("SELECT * FROM purchases ORDER BY date DESC")); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/purchases", (req, res) => {
    try {
      const b = req.body;
      if (!b.name || b.price == null) return res.status(400).json({ error: "name and price required" });
      const id = b.id || uid();
      run(
        `INSERT INTO purchases (id, name, card_set, platform, seller, price, shipping, total_cost, date, notes)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [id, b.name, b.card_set, b.platform, b.seller, b.price,
         b.shipping || 0, b.total_cost || 0, b.date, b.notes]
      );
      res.status(201).json(get("SELECT * FROM purchases WHERE id = ?", [id]));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Settings ───────────────────────────────────────────────────────
  app.get("/api/settings", (_req, res) => {
    try {
      const rows = all("SELECT * FROM settings");
      const obj = {};
      for (const r of rows) obj[r.key] = r.value;
      res.json(obj);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/settings", (req, res) => {
    try {
      const stmt = run;
      for (const [key, value] of Object.entries(req.body)) {
        run(
          "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          [key, typeof value === "string" ? value : JSON.stringify(value)]
        );
      }
      res.json({ saved: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Reference Data ─────────────────────────────────────────────────
  registerRef(app, "leagues", ["name", "sport_type"]);
  registerRef(app, "manufacturers", ["name", "licensing_status"]);

  app.get("/api/ref/teams", (req, res) => {
    try {
      let sql = "SELECT t.*, l.name as league_name FROM teams t LEFT JOIN leagues l ON t.league_id = l.id";
      const params = [];
      if (req.query.league_id) { sql += " WHERE t.league_id = ?"; params.push(req.query.league_id); }
      res.json(all(sql, params));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/ref/teams", (req, res) => {
    try {
      const b = req.body;
      if (!b.name) return res.status(400).json({ error: "name required" });
      run("INSERT INTO teams (name, league_id, city, abbreviation) VALUES (?,?,?,?)",
        [b.name, b.league_id, b.city, b.abbreviation]);
      res.status(201).json({ id: get("SELECT last_insert_rowid() as id").id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/ref/sets", (req, res) => {
    try {
      let sql = "SELECT cs.*, m.name as manufacturer_name FROM card_sets cs LEFT JOIN manufacturers m ON cs.manufacturer_id = m.id WHERE 1=1";
      const params = [];
      if (req.query.year) { sql += " AND cs.year = ?"; params.push(req.query.year); }
      if (req.query.mfg) { sql += " AND cs.manufacturer_id = ?"; params.push(req.query.mfg); }
      res.json(all(sql, params));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/ref/sets", (req, res) => {
    try {
      const b = req.body;
      if (!b.set_name || !b.year) return res.status(400).json({ error: "set_name and year required" });
      run("INSERT INTO card_sets (manufacturer_id, year, set_name, parent_set_id, sport_type, release_date) VALUES (?,?,?,?,?,?)",
        [b.manufacturer_id, b.year, b.set_name, b.parent_set_id, b.sport_type, b.release_date]);
      res.status(201).json({ id: get("SELECT last_insert_rowid() as id").id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/ref/players", (req, res) => {
    try {
      let sql = "SELECT p.*, t.name as team_name FROM players p LEFT JOIN teams t ON p.team_id = t.id WHERE 1=1";
      const params = [];
      if (req.query.team) { sql += " AND p.team_id = ?"; params.push(req.query.team); }
      if (req.query.search) {
        sql += " AND (p.first_name LIKE ? OR p.last_name LIKE ?)";
        params.push(`%${req.query.search}%`, `%${req.query.search}%`);
      }
      res.json(all(sql, params));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/ref/players", (req, res) => {
    try {
      const b = req.body;
      if (!b.first_name || !b.last_name) return res.status(400).json({ error: "first_name and last_name required" });
      run("INSERT INTO players (first_name, last_name, team_id, is_rookie, position) VALUES (?,?,?,?,?)",
        [b.first_name, b.last_name, b.team_id, b.is_rookie || 0, b.position]);
      res.status(201).json({ id: get("SELECT last_insert_rowid() as id").id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/ref/cards", (req, res) => {
    try {
      let sql = "SELECT c.*, p.first_name, p.last_name FROM cards c LEFT JOIN players p ON c.player_id = p.id WHERE 1=1";
      const params = [];
      if (req.query.set_id) { sql += " AND c.set_id = ?"; params.push(req.query.set_id); }
      res.json(all(sql, params));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/ref/cards", (req, res) => {
    try {
      const b = req.body;
      run(
        `INSERT INTO cards (set_id, player_id, card_number, is_base, is_rookie,
         has_autograph, is_memorabilia, is_short_print, error_type, attributes)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [b.set_id, b.player_id, b.card_number, b.is_base ?? 1, b.is_rookie || 0,
         b.has_autograph || 0, b.is_memorabilia || 0, b.is_short_print || 0,
         b.error_type, json(b.attributes)]
      );
      res.status(201).json({ id: get("SELECT last_insert_rowid() as id").id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/ref/parallels", (req, res) => {
    try {
      let sql = "SELECT * FROM parallels WHERE 1=1";
      const params = [];
      if (req.query.card_id) { sql += " AND card_id = ?"; params.push(req.query.card_id); }
      res.json(all(sql, params));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/ref/parallels", (req, res) => {
    try {
      const b = req.body;
      if (!b.variation_name) return res.status(400).json({ error: "variation_name required" });
      run("INSERT INTO parallels (card_id, variation_name, color, print_run, is_1of1, tier) VALUES (?,?,?,?,?,?)",
        [b.card_id, b.variation_name, b.color, b.print_run, b.is_1of1 || 0, b.tier]);
      res.status(201).json({ id: get("SELECT last_insert_rowid() as id").id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── Migration (localStorage import) ───────────────────────────────
  app.post("/api/migrate", (req, res) => {
    try {
      const data = req.body;
      let imported = { items: 0, sales: 0, listings: 0, trades: 0, watchlist: 0, gradings: 0, purchases: 0 };

      if (Array.isArray(data.items)) {
        for (const item of data.items) {
          try {
            run(
              `INSERT OR IGNORE INTO user_items
               (id, name, card_set, year, card_number, type, rarity, condition,
                parallel, binder, cost_basis, status, listed_on, front_img_id,
                back_img_id, price_estimate, price_history, notes, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [item.id, item.name, item.set || item.card_set, item.year, item.number || item.card_number,
               item.type || "sports", item.rarity, item.condition || "near_mint",
               item.parallel, item.binder, item.costBasis || item.cost_basis || 0,
               item.status || "inventory", json(item.listedOn || item.listed_on),
               item.frontImgId || item.front_img_id, item.backImgId || item.back_img_id,
               json(item.priceEstimate || item.price_estimate),
               json(item.priceHistory || item.price_history),
               item.notes, item.createdAt || item.created_at, item.updatedAt || item.updated_at]
            );
            imported.items++;
          } catch (_) { /* skip duplicates */ }
        }
      }

      const simpleTables = [
        { key: "sales", table: "sales", cols: "id,card_id,card_name,card_set,sale_price,cost_basis,platform,fees,shipping_cost,net_profit,listing_id,date",
          vals: (s) => [s.id, s.cardId||s.card_id, s.cardName||s.card_name, s.cardSet||s.card_set,
            s.salePrice||s.sale_price, s.costBasis||s.cost_basis||0, s.platform,
            s.fees||0, s.shippingCost||s.shipping_cost||0, s.netProfit||s.net_profit||0,
            s.listingId||s.listing_id, s.date] },
        { key: "trades", table: "trades", cols: "id,partner,gave,received,gave_value,received_value,date,notes",
          vals: (t) => [t.id, t.partner, t.gave, t.received, t.gaveValue||t.gave_value||0,
            t.receivedValue||t.received_value||0, t.date, t.notes] },
        { key: "watchlist", table: "watchlist", cols: "id,name,card_set,card_number,target_price,current_price,price_history",
          vals: (w) => [w.id, w.name, w.cardSet||w.card_set, w.cardNumber||w.card_number,
            w.targetPrice||w.target_price||0, w.currentPrice||w.current_price,
            json(w.priceHistory||w.price_history)] },
        { key: "gradings", table: "gradings",
          cols: "id,card_name,card_set,card_number,company,service,cost,date_sent,pre_value,status,grade,cert_number,post_value",
          vals: (g) => [g.id, g.cardName||g.card_name, g.cardSet||g.card_set,
            g.cardNumber||g.card_number, g.company||"PSA", g.service||"Economy",
            g.cost||0, g.dateSent||g.date_sent, g.preValue||g.pre_value||0,
            g.status||"sent", g.grade, g.certNumber||g.cert_number, g.postValue||g.post_value||0] },
        { key: "purchases", table: "purchases", cols: "id,name,card_set,platform,seller,price,shipping,total_cost,date,notes",
          vals: (p) => [p.id, p.name, p.cardSet||p.card_set, p.platform, p.seller,
            p.price, p.shipping||0, p.totalCost||p.total_cost||0, p.date, p.notes] },
      ];

      for (const { key, table, cols, vals } of simpleTables) {
        if (Array.isArray(data[key])) {
          const placeholders = cols.split(",").map(() => "?").join(",");
          for (const row of data[key]) {
            try {
              run(`INSERT OR IGNORE INTO ${table} (${cols}) VALUES (${placeholders})`, vals(row));
              imported[key]++;
            } catch (_) { /* skip */ }
          }
        }
      }

      // Listings
      if (Array.isArray(data.listings)) {
        for (const l of data.listings) {
          try {
            run(
              `INSERT OR IGNORE INTO listings
               (id,card_id,card_name,card_set,card_number,platform,format,start_price,
                buy_now_price,auction_end_date,shipping,current_bid,status,sold_price,sold_date,notes)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [l.id, l.cardId||l.card_id, l.cardName||l.card_name, l.cardSet||l.card_set,
               l.cardNumber||l.card_number, l.platform, l.format||"fixed", l.startPrice||l.start_price,
               l.buyNowPrice||l.buy_now_price, l.auctionEndDate||l.auction_end_date,
               l.shipping||0, l.currentBid||l.current_bid, l.status||"active",
               l.soldPrice||l.sold_price, l.soldDate||l.sold_date, l.notes]
            );
            imported.listings++;
          } catch (_) { /* skip */ }
        }
      }

      // Settings
      if (data.settings && typeof data.settings === "object") {
        for (const [key, value] of Object.entries(data.settings)) {
          run(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            [key, typeof value === "string" ? value : JSON.stringify(value)]
          );
        }
      }

      res.json({ success: true, imported });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────

function json(val) {
  if (val == null) return null;
  if (typeof val === "string") return val;
  return JSON.stringify(val);
}

function registerCRUD(app, table, requiredField, { columns, insert, update }) {
  const colArr = columns.split(",").map((c) => c.trim());
  const updateCols = colArr.slice(1); // skip id

  app.get(`/api/${table}`, (_req, res) => {
    try { res.json(all(`SELECT * FROM ${table} ORDER BY created_at DESC`)); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post(`/api/${table}`, (req, res) => {
    try {
      const b = req.body;
      if (!b[requiredField]) return res.status(400).json({ error: `${requiredField} required` });
      const id = b.id || uid();
      const placeholders = colArr.map(() => "?").join(",");
      run(`INSERT INTO ${table} (${columns}) VALUES (${placeholders})`, insert(b, id));
      res.status(201).json(get(`SELECT * FROM ${table} WHERE id = ?`, [id]));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put(`/api/${table}/:id`, (req, res) => {
    try {
      const existing = get(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
      if (!existing) return res.status(404).json({ error: "Not found" });
      const b = { ...existing, ...req.body };
      const setClauses = updateCols.map((c) => `${c}=?`).join(",");
      run(`UPDATE ${table} SET ${setClauses} WHERE id=?`, [...update(b), req.params.id]);
      res.json(get(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete(`/api/${table}/:id`, (req, res) => {
    try {
      const result = run(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
      if (result.changes === 0) return res.status(404).json({ error: "Not found" });
      res.json({ deleted: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

function registerRef(app, table, requiredFields) {
  app.get(`/api/ref/${table}`, (_req, res) => {
    try { res.json(all(`SELECT * FROM ${table} ORDER BY name`)); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post(`/api/ref/${table}`, (req, res) => {
    try {
      const b = req.body;
      for (const f of requiredFields) {
        if (!b[f]) return res.status(400).json({ error: `${f} required` });
      }
      const cols = requiredFields.join(",");
      const placeholders = requiredFields.map(() => "?").join(",");
      run(`INSERT INTO ${table} (${cols}) VALUES (${placeholders})`,
        requiredFields.map((f) => b[f]));
      res.status(201).json({ id: get("SELECT last_insert_rowid() as id").id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}
