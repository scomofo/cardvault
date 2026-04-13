/**
 * Reference catalog and identification learning tables.
 * @param {import("better-sqlite3").Database} db
 */
export function createReferenceTables(db) {
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


    CREATE TABLE IF NOT EXISTS catalog_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_set_id INTEGER REFERENCES card_sets(id),
      player_id INTEGER REFERENCES players(id),
      player_name TEXT,
      manufacturer_name TEXT,
      set_name TEXT,
      year TEXT,
      card_number TEXT,
      parallel_name TEXT,
      team_name TEXT,
      rookie_flag INTEGER DEFAULT 0,
      autograph_flag INTEGER DEFAULT 0,
      memorabilia_flag INTEGER DEFAULT 0,
      normalized_player_name TEXT,
      normalized_set_name TEXT,
      normalized_parallel_name TEXT,
      external_reference_key TEXT,
      source_confidence REAL DEFAULT 0.8,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS card_variations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      catalog_card_id INTEGER REFERENCES catalog_cards(id) ON DELETE CASCADE,
      variation_name TEXT NOT NULL,
      normalized_variation_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS set_checklists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_set_id INTEGER REFERENCES card_sets(id) ON DELETE CASCADE,
      catalog_card_id INTEGER REFERENCES catalog_cards(id) ON DELETE CASCADE,
      card_number_text TEXT,
      external_reference_key TEXT,
      source_confidence REAL DEFAULT 0.8,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ocr_results (
      id TEXT PRIMARY KEY,
      item_id TEXT REFERENCES user_items(id) ON DELETE CASCADE,
      batch_item_id TEXT REFERENCES intake_batch_items(id) ON DELETE CASCADE,
      ocr_text TEXT,
      parsed_json TEXT,
      source_confidence REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS identification_candidates (
      id TEXT PRIMARY KEY,
      item_id TEXT REFERENCES user_items(id) ON DELETE CASCADE,
      batch_item_id TEXT REFERENCES intake_batch_items(id) ON DELETE CASCADE,
      catalog_card_id INTEGER REFERENCES catalog_cards(id) ON DELETE CASCADE,
      rank_order INTEGER DEFAULT 0,
      candidate_score REAL DEFAULT 0,
      explanation TEXT,
      candidate_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS identification_results (
      id TEXT PRIMARY KEY,
      item_id TEXT REFERENCES user_items(id) ON DELETE CASCADE,
      batch_item_id TEXT REFERENCES intake_batch_items(id) ON DELETE CASCADE,
      final_catalog_card_id INTEGER REFERENCES catalog_cards(id) ON DELETE SET NULL,
      recommendation TEXT NOT NULL,
      confidence REAL DEFAULT 0,
      explanation TEXT,
      accepted_by_rule_or_user TEXT DEFAULT 'rule',
      correction_flag INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS confirmed_scan_examples (
      id TEXT PRIMARY KEY,
      item_id TEXT REFERENCES user_items(id) ON DELETE CASCADE,
      identification_result_id TEXT REFERENCES identification_results(id) ON DELETE CASCADE,
      front_image_path TEXT,
      back_image_path TEXT,
      final_catalog_card_id INTEGER REFERENCES catalog_cards(id) ON DELETE SET NULL,
      accepted_by_rule_or_user TEXT DEFAULT 'rule',
      correction_flag INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scan_corrections (
      id TEXT PRIMARY KEY,
      identification_result_id TEXT REFERENCES identification_results(id) ON DELETE CASCADE,
      corrected_catalog_card_id INTEGER REFERENCES catalog_cards(id) ON DELETE SET NULL,
      reason TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS image_similarity_index (
      id TEXT PRIMARY KEY,
      example_item_id TEXT REFERENCES user_items(id) ON DELETE CASCADE,
      catalog_card_id INTEGER REFERENCES catalog_cards(id) ON DELETE CASCADE,
      signature TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hard_case_clusters (
      id TEXT PRIMARY KEY,
      cluster_key TEXT NOT NULL,
      failure_count INTEGER DEFAULT 0,
      example_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS identification_feedback (
      id TEXT PRIMARY KEY,
      identification_result_id TEXT REFERENCES identification_results(id) ON DELETE CASCADE,
      accepted INTEGER DEFAULT 0,
      corrected INTEGER DEFAULT 0,
      corrected_catalog_card_id INTEGER REFERENCES catalog_cards(id) ON DELETE SET NULL,
      reason TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE VIEW IF NOT EXISTS inventory_items AS
    SELECT * FROM user_items;

    CREATE VIEW IF NOT EXISTS inventory_profit_view AS
    SELECT
      ui.id AS item_id,
      ui.name,
      ui.player_name,
      ui.card_set,
      ui.year,
      ui.card_number,
      ui.cost_basis,
      COALESCE(ui.market_price, 0) AS market_price,
      COALESCE(SUM(si.sale_price), 0) AS gross_sales,
      COALESCE(SUM(si.allocated_fees), 0) AS allocated_fees,
      COALESCE(SUM(si.allocated_shipping), 0) AS allocated_shipping,
      COALESCE(SUM(sf.amount), 0) AS additional_fees,
      COALESCE(MAX(s.net_profit), 0) AS realized_profit,
      CASE
        WHEN COALESCE(ui.cost_basis, 0) > 0
          THEN ROUND((COALESCE(MAX(s.net_profit), 0) / ui.cost_basis) * 100, 2)
        ELSE NULL
      END AS roi_percent
    FROM user_items ui
    LEFT JOIN sale_items si ON si.item_id = ui.id
    LEFT JOIN sales s ON s.id = si.sale_id
    LEFT JOIN sale_fees sf ON sf.sale_id = s.id
    GROUP BY ui.id;

    CREATE VIEW IF NOT EXISTS aging_inventory_view AS
    SELECT
      ui.id AS item_id,
      ui.name,
      ui.player_name,
      ui.card_set,
      ui.status,
      ui.listing_status,
      ui.sale_status,
      ui.market_price,
      ui.suggested_listing_price,
      ui.grading_candidate,
      COALESCE(ui.acquisition_date, ui.created_at) AS age_anchor,
      CAST(julianday('now') - julianday(COALESCE(ui.acquisition_date, ui.created_at)) AS INTEGER) AS age_days
    FROM user_items ui
    WHERE ui.sale_status != 'sold';
  `);
}