import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname, resolve } from "path";

let db = null;
let dbPath = null;

function getDbPath() {
  if (!dbPath) {
    dbPath = resolve(process.env.CARDVAULT_DB_PATH || "./data/cardvault.db");
  }
  return dbPath;
}

export function initDB() {
  if (db) {
    db.close();
  }

  const resolvedDbPath = getDbPath();
  mkdirSync(dirname(resolvedDbPath), { recursive: true });
  db = new Database(resolvedDbPath);

  // Performance pragmas
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  createTables();
  runMigrations();
  createIndexes();
  return db;
}

export function getDB() {
  if (!db) throw new Error("Database not initialized — call initDB() first");
  return db;
}

export function run(sql, params = []) {
  return getDB().prepare(sql).run(...(Array.isArray(params) ? params : [params]));
}

export function get(sql, params = []) {
  return getDB().prepare(sql).get(...(Array.isArray(params) ? params : [params]));
}

export function all(sql, params = []) {
  return getDB().prepare(sql).all(...(Array.isArray(params) ? params : [params]));
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leagues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sport_type TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS manufacturers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      licensing_status TEXT DEFAULT 'licensed',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      league_id INTEGER REFERENCES leagues(id),
      city TEXT,
      abbreviation TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS card_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manufacturer_id INTEGER REFERENCES manufacturers(id),
      year INTEGER NOT NULL,
      set_name TEXT NOT NULL,
      parent_set_id INTEGER REFERENCES card_sets(id),
      sport_type TEXT,
      release_date TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      team_id INTEGER REFERENCES teams(id),
      is_rookie INTEGER DEFAULT 0,
      position TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      set_id INTEGER REFERENCES card_sets(id),
      player_id INTEGER REFERENCES players(id),
      card_number TEXT,
      is_base INTEGER DEFAULT 1,
      is_rookie INTEGER DEFAULT 0,
      has_autograph INTEGER DEFAULT 0,
      is_memorabilia INTEGER DEFAULT 0,
      is_short_print INTEGER DEFAULT 0,
      error_type TEXT,
      attributes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS parallels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER REFERENCES cards(id),
      variation_name TEXT NOT NULL,
      color TEXT,
      print_run INTEGER,
      is_1of1 INTEGER DEFAULT 0,
      tier TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_items (
      id TEXT PRIMARY KEY,
      parallel_id INTEGER REFERENCES parallels(id),
      name TEXT,
      card_set TEXT,
      year TEXT,
      card_number TEXT,
      type TEXT DEFAULT 'sports',
      rarity TEXT,
      condition TEXT DEFAULT 'near_mint',
      parallel TEXT,
      binder TEXT,
      cost_basis REAL DEFAULT 0,
      status TEXT DEFAULT 'inventory',
      listed_on TEXT,
      front_img_id TEXT,
      back_img_id TEXT,
      price_estimate TEXT,
      price_history TEXT,
      notes TEXT,
      -- Grading sub-scores (1-10 scale, from Grading Integration Spec)
      centering INTEGER,
      corners INTEGER,
      edges INTEGER,
      surface INTEGER,
      projected_grade REAL,
      vault_status TEXT, -- GREEN (grading candidate), YELLOW (raw sale), RED (bulk)
      condition_report TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      card_id TEXT REFERENCES user_items(id),
      card_name TEXT,
      card_set TEXT,
      sale_price REAL NOT NULL,
      cost_basis REAL DEFAULT 0,
      platform TEXT,
      fees REAL DEFAULT 0,
      shipping_cost REAL DEFAULT 0,
      net_profit REAL DEFAULT 0,
      listing_id TEXT,
      date TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      card_id TEXT REFERENCES user_items(id),
      card_name TEXT,
      card_set TEXT,
      card_number TEXT,
      platform TEXT NOT NULL,
      format TEXT DEFAULT 'fixed',
      start_price REAL,
      buy_now_price REAL,
      auction_end_date TEXT,
      shipping REAL DEFAULT 0,
      current_bid REAL,
      status TEXT DEFAULT 'active',
      sold_price REAL,
      sold_date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      partner TEXT NOT NULL,
      gave TEXT,
      received TEXT,
      gave_value REAL DEFAULT 0,
      received_value REAL DEFAULT 0,
      date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      card_set TEXT,
      card_number TEXT,
      target_price REAL DEFAULT 0,
      current_price REAL,
      price_history TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gradings (
      id TEXT PRIMARY KEY,
      card_name TEXT NOT NULL,
      card_set TEXT,
      card_number TEXT,
      company TEXT DEFAULT 'PSA',
      service TEXT DEFAULT 'Economy',
      cost REAL DEFAULT 0,
      date_sent TEXT,
      pre_value REAL DEFAULT 0,
      status TEXT DEFAULT 'sent',
      grade TEXT,
      cert_number TEXT,
      post_value REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      card_set TEXT,
      platform TEXT,
      seller TEXT,
      price REAL NOT NULL,
      shipping REAL DEFAULT 0,
      total_cost REAL DEFAULT 0,
      date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

function runMigrations() {
  // Add grading columns to existing user_items tables
  const cols = db.prepare("PRAGMA table_info(user_items)").all().map((c) => c.name);
  const addCol = (name, type) => {
    if (!cols.includes(name)) db.exec(`ALTER TABLE user_items ADD COLUMN ${name} ${type}`);
  };
  addCol("centering", "INTEGER");
  addCol("corners", "INTEGER");
  addCol("edges", "INTEGER");
  addCol("surface", "INTEGER");
  addCol("projected_grade", "REAL");
  addCol("vault_status", "TEXT");
  addCol("condition_report", "TEXT");

  // CV pipeline columns
  addCol("cv_centering_lr", "TEXT");
  addCol("cv_centering_tb", "TEXT");
  addCol("cv_centering_score", "REAL");
  addCol("cv_processed", "INTEGER DEFAULT 0");

  // eBay 2026 condition descriptors
  addCol("ebay_centering", "TEXT");
  addCol("ebay_corner_sharpness", "TEXT");
  addCol("ebay_edge_chipping", "TEXT");

  // CV scans audit log
  db.exec(`
    CREATE TABLE IF NOT EXISTS cv_scans (
      id TEXT PRIMARY KEY,
      item_id TEXT REFERENCES user_items(id),
      centering_lr TEXT,
      centering_tb TEXT,
      centering_score REAL,
      detection_confidence REAL,
      warp_quality REAL,
      processing_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ebay_exports (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      currency TEXT NOT NULL,
      item_count INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function createIndexes() {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cards_set_id ON cards(set_id);
    CREATE INDEX IF NOT EXISTS idx_cards_player_id ON cards(player_id);
    CREATE INDEX IF NOT EXISTS idx_parallels_card_id ON parallels(card_id);
    CREATE INDEX IF NOT EXISTS idx_user_items_status ON user_items(status);
    CREATE INDEX IF NOT EXISTS idx_user_items_card_set ON user_items(card_set);
    CREATE INDEX IF NOT EXISTS idx_sales_card_id ON sales(card_id);
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
    CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
    CREATE INDEX IF NOT EXISTS idx_user_items_vault ON user_items(vault_status);
  `);
}
