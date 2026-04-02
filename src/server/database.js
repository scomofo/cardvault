import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname, resolve } from "path";

let db = null;

function getDbPath() {
  return resolve(process.env.CARDVAULT_DB_PATH || "./data/cardvault.db");
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
      intake_batch_id TEXT,
      purchase_id TEXT,
      name TEXT,
      player_name TEXT,
      manufacturer TEXT,
      sport TEXT,
      team TEXT,
      card_set TEXT,
      year TEXT,
      card_number TEXT,
      type TEXT DEFAULT 'sports',
      rarity TEXT,
      condition TEXT DEFAULT 'near_mint',
      parallel TEXT,
      binder TEXT,
      storage_location TEXT,
      cost_basis REAL DEFAULT 0,
      acquisition_date TEXT,
      acquisition_source TEXT,
      status TEXT DEFAULT 'inventory',
      listing_status TEXT DEFAULT 'not_listed',
      sale_status TEXT DEFAULT 'available',
      listed_on TEXT,
      front_img_id TEXT,
      back_img_id TEXT,
      price_estimate TEXT,
      price_history TEXT,
      market_price REAL DEFAULT 0,
      suggested_listing_price REAL DEFAULT 0,
      min_acceptable_price REAL DEFAULT 0,
      last_comp_price REAL DEFAULT 0,
      average_comp_price REAL DEFAULT 0,
      psa9_price REAL DEFAULT 0,
      psa10_price REAL DEFAULT 0,
      profit_realized REAL DEFAULT 0,
      sold_at TEXT,
      notes TEXT,
      -- Grading sub-scores (1-10 scale, from Grading Integration Spec)
      centering INTEGER,
      corners INTEGER,
      edges INTEGER,
      surface INTEGER,
      projected_grade REAL,
      grading_candidate INTEGER DEFAULT 0,
      vault_status TEXT, -- GREEN (grading candidate), YELLOW (raw sale), RED (bulk)
      condition_report TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      card_id TEXT REFERENCES user_items(id),
      order_id TEXT,
      card_name TEXT,
      card_set TEXT,
      sale_price REAL NOT NULL,
      cost_basis REAL DEFAULT 0,
      platform TEXT,
      buyer_handle TEXT,
      fees REAL DEFAULT 0,
      shipping_cost REAL DEFAULT 0,
      packaging_cost REAL DEFAULT 0,
      grading_cost REAL DEFAULT 0,
      tax_collected REAL DEFAULT 0,
      payout_amount REAL DEFAULT 0,
      net_profit REAL DEFAULT 0,
      listing_id TEXT,
      date TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      card_id TEXT REFERENCES user_items(id),
      external_listing_id TEXT,
      card_name TEXT,
      card_set TEXT,
      card_number TEXT,
      platform TEXT NOT NULL,
      listing_title TEXT,
      listing_description TEXT,
      category_path TEXT,
      item_specifics TEXT,
      shipping_profile TEXT,
      image_count INTEGER DEFAULT 0,
      automation_state TEXT DEFAULT 'draft',
      pricing_strategy TEXT DEFAULT 'market',
      format TEXT DEFAULT 'fixed',
      start_price REAL,
      buy_now_price REAL,
      auction_end_date TEXT,
      shipping REAL DEFAULT 0,
      shipping_weight_oz REAL DEFAULT 0,
      export_batch_id TEXT,
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

    CREATE TABLE IF NOT EXISTS intake_batches (
      id TEXT PRIMARY KEY,
      source TEXT DEFAULT 'manual',
      status TEXT DEFAULT 'open',
      card_count INTEGER DEFAULT 0,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pricing_snapshots (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES user_items(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      strategy TEXT DEFAULT 'market',
      last_comp_price REAL DEFAULT 0,
      average_comp_price REAL DEFAULT 0,
      raw_price REAL DEFAULT 0,
      psa9_price REAL DEFAULT 0,
      psa10_price REAL DEFAULT 0,
      graded_spread REAL DEFAULT 0,
      suggested_listing_price REAL DEFAULT 0,
      min_acceptable_price REAL DEFAULT 0,
      price_history TEXT,
      observed_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS listing_batches (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      pricing_strategy TEXT DEFAULT 'market',
      item_count INTEGER DEFAULT 0,
      export_format TEXT DEFAULT 'csv',
      export_path TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      exported_at TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      sale_id TEXT REFERENCES sales(id),
      listing_id TEXT REFERENCES listings(id),
      item_id TEXT REFERENCES user_items(id),
      platform TEXT NOT NULL,
      external_order_id TEXT,
      buyer_handle TEXT,
      sale_price REAL DEFAULT 0,
      fees REAL DEFAULT 0,
      shipping_charge REAL DEFAULT 0,
      tax_collected REAL DEFAULT 0,
      destination_country TEXT DEFAULT 'CA',
      destination_postal_code TEXT,
      payment_status TEXT DEFAULT 'paid',
      fulfillment_status TEXT DEFAULT 'pending',
      sold_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      item_id TEXT REFERENCES user_items(id),
      carrier TEXT,
      service_level TEXT,
      package_type TEXT,
      label_status TEXT DEFAULT 'pending',
      tracking_number TEXT,
      shipping_cost REAL DEFAULT 0,
      packaging_cost REAL DEFAULT 0,
      weight_oz REAL DEFAULT 0,
      purchased_at TEXT,
      shipped_at TEXT,
      delivered_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profit_events (
      id TEXT PRIMARY KEY,
      item_id TEXT REFERENCES user_items(id) ON DELETE CASCADE,
      order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
      sale_id TEXT REFERENCES sales(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      amount REAL NOT NULL,
      memo TEXT,
      event_date TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS price_snapshots (
      id TEXT PRIMARY KEY,
      item_id TEXT REFERENCES user_items(id) ON DELETE CASCADE,
      catalog_card_id TEXT,
      source TEXT NOT NULL,
      observed_at TEXT DEFAULT (datetime('now')),
      condition_bucket TEXT DEFAULT 'raw',
      market_price_cents INTEGER DEFAULT 0,
      average_price_cents INTEGER DEFAULT 0,
      low_price_cents INTEGER DEFAULT 0,
      high_price_cents INTEGER DEFAULT 0,
      last_comp_price_cents INTEGER DEFAULT 0,
      sample_size INTEGER DEFAULT 0,
      raw_payload TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS price_comps (
      id TEXT PRIMARY KEY,
      snapshot_id TEXT REFERENCES price_snapshots(id) ON DELETE CASCADE,
      item_id TEXT REFERENCES user_items(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      comp_date TEXT,
      comp_price_cents INTEGER DEFAULT 0,
      title TEXT,
      url TEXT,
      grade TEXT,
      condition_bucket TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pricing_recommendations (
      id TEXT PRIMARY KEY,
      item_id TEXT REFERENCES user_items(id) ON DELETE CASCADE,
      snapshot_id TEXT REFERENCES price_snapshots(id) ON DELETE SET NULL,
      strategy TEXT NOT NULL,
      recommended_price_cents INTEGER DEFAULT 0,
      minimum_acceptable_price_cents INTEGER DEFAULT 0,
      confidence TEXT DEFAULT 'medium',
      explanation TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS listing_exports (
      id TEXT PRIMARY KEY,
      listing_batch_id TEXT,
      export_type TEXT NOT NULL,
      export_status TEXT DEFAULT 'completed',
      file_path TEXT,
      item_count INTEGER DEFAULT 0,
      exported_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      item_id TEXT REFERENCES user_items(id) ON DELETE SET NULL,
      listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
      quantity INTEGER DEFAULT 1,
      sale_price REAL DEFAULT 0,
      allocated_fees REAL DEFAULT 0,
      allocated_shipping REAL DEFAULT 0,
      allocated_tax REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sale_fees (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      fee_type TEXT NOT NULL,
      amount REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id TEXT PRIMARY KEY,
      purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      item_id TEXT REFERENCES user_items(id) ON DELETE SET NULL,
      quantity INTEGER DEFAULT 1,
      unit_cost REAL DEFAULT 0,
      allocated_shipping REAL DEFAULT 0,
      grading_cost REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS marketplace_connections (
      id TEXT PRIMARY KEY,
      marketplace TEXT NOT NULL,
      account_label TEXT,
      auth_status TEXT DEFAULT 'disconnected',
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS listing_channels (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      marketplace TEXT NOT NULL,
      connection_id TEXT REFERENCES marketplace_connections(id) ON DELETE SET NULL,
      external_listing_id TEXT,
      status TEXT DEFAULT 'draft',
      last_sync_at TEXT,
      publish_error TEXT,
      overrides TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS listing_channel_events (
      id TEXT PRIMARY KEY,
      listing_channel_id TEXT NOT NULL REFERENCES listing_channels(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      status TEXT,
      payload TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shipping_provider_connections (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      auth_status TEXT DEFAULT 'disconnected',
      api_key TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS market_alerts (
      id TEXT PRIMARY KEY,
      item_id TEXT REFERENCES user_items(id) ON DELETE CASCADE,
      listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
      alert_type TEXT NOT NULL,
      severity TEXT DEFAULT 'medium',
      explanation TEXT,
      suggested_action TEXT,
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS market_alert_events (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL REFERENCES market_alerts(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      decision_type TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      confidence REAL DEFAULT 0,
      explanation TEXT,
      suggested_action_type TEXT,
      suggested_action_payload TEXT,
      inputs_json TEXT,
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS decision_events (
      id TEXT PRIMARY KEY,
      decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS decision_feedback (
      id TEXT PRIMARY KEY,
      decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
      user_response TEXT,
      accepted INTEGER DEFAULT 0,
      overridden INTEGER DEFAULT 0,
      snoozed INTEGER DEFAULT 0,
      override_reason TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS intake_batch_items (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL REFERENCES intake_batches(id) ON DELETE CASCADE,
      inventory_item_id TEXT REFERENCES user_items(id) ON DELETE SET NULL,
      scan_capture_id TEXT,
      processing_status TEXT DEFAULT 'captured',
      identification_status TEXT DEFAULT 'pending',
      pricing_status TEXT DEFAULT 'pending',
      duplicate_status TEXT DEFAULT 'clear',
      exception_status TEXT DEFAULT 'none',
      routing_recommendation TEXT,
      finalized_status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scan_captures (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL REFERENCES intake_batches(id) ON DELETE CASCADE,
      inventory_item_id TEXT REFERENCES user_items(id) ON DELETE SET NULL,
      image_side TEXT DEFAULT 'front',
      image_ref TEXT,
      blur_score REAL DEFAULT 0,
      edge_score REAL DEFAULT 0,
      rotation_degrees REAL DEFAULT 0,
      capture_status TEXT DEFAULT 'captured',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scan_processing_results (
      id TEXT PRIMARY KEY,
      batch_item_id TEXT NOT NULL REFERENCES intake_batch_items(id) ON DELETE CASCADE,
      ocr_text TEXT,
      match_confidence REAL DEFAULT 0,
      matched_player TEXT,
      matched_set TEXT,
      matched_year TEXT,
      matched_card_number TEXT,
      parallel_detected TEXT,
      pricing_snapshot_id TEXT REFERENCES price_snapshots(id) ON DELETE SET NULL,
      result_status TEXT DEFAULT 'processed',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS intake_exceptions (
      id TEXT PRIMARY KEY,
      batch_item_id TEXT NOT NULL REFERENCES intake_batch_items(id) ON DELETE CASCADE,
      exception_type TEXT NOT NULL,
      severity TEXT DEFAULT 'medium',
      explanation TEXT,
      resolution_status TEXT DEFAULT 'open',
      resolved_at TEXT,
      resolved_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS batch_defaults (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL REFERENCES intake_batches(id) ON DELETE CASCADE,
      defaults_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
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

function runMigrations() {
  const getColumns = (tableName) =>
    db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);

  const addColumnIfMissing = (tableName, name, type) => {
    const columns = getColumns(tableName);
    if (!columns.includes(name)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${name} ${type}`);
    }
  };

  // Inventory and monetization fields
  addColumnIfMissing("user_items", "intake_batch_id", "TEXT");
  addColumnIfMissing("user_items", "purchase_id", "TEXT");
  addColumnIfMissing("user_items", "player_name", "TEXT");
  addColumnIfMissing("user_items", "manufacturer", "TEXT");
  addColumnIfMissing("user_items", "sport", "TEXT");
  addColumnIfMissing("user_items", "team", "TEXT");
  addColumnIfMissing("user_items", "storage_location", "TEXT");
  addColumnIfMissing("user_items", "acquisition_date", "TEXT");
  addColumnIfMissing("user_items", "acquisition_source", "TEXT");
  addColumnIfMissing("user_items", "listing_status", "TEXT DEFAULT 'not_listed'");
  addColumnIfMissing("user_items", "sale_status", "TEXT DEFAULT 'available'");
  addColumnIfMissing("user_items", "market_price", "REAL DEFAULT 0");
  addColumnIfMissing("user_items", "suggested_listing_price", "REAL DEFAULT 0");
  addColumnIfMissing("user_items", "min_acceptable_price", "REAL DEFAULT 0");
  addColumnIfMissing("user_items", "last_comp_price", "REAL DEFAULT 0");
  addColumnIfMissing("user_items", "average_comp_price", "REAL DEFAULT 0");
  addColumnIfMissing("user_items", "psa9_price", "REAL DEFAULT 0");
  addColumnIfMissing("user_items", "psa10_price", "REAL DEFAULT 0");
  addColumnIfMissing("user_items", "profit_realized", "REAL DEFAULT 0");
  addColumnIfMissing("user_items", "sold_at", "TEXT");
  addColumnIfMissing("user_items", "grading_candidate", "INTEGER DEFAULT 0");
  addColumnIfMissing("user_items", "grading_decision", "TEXT");

  // Existing grading fields
  addColumnIfMissing("user_items", "centering", "INTEGER");
  addColumnIfMissing("user_items", "corners", "INTEGER");
  addColumnIfMissing("user_items", "edges", "INTEGER");
  addColumnIfMissing("user_items", "surface", "INTEGER");
  addColumnIfMissing("user_items", "projected_grade", "REAL");
  addColumnIfMissing("user_items", "vault_status", "TEXT");
  addColumnIfMissing("user_items", "condition_report", "TEXT");

  // CV pipeline columns
  addColumnIfMissing("user_items", "cv_centering_lr", "TEXT");
  addColumnIfMissing("user_items", "cv_centering_tb", "TEXT");
  addColumnIfMissing("user_items", "cv_centering_score", "REAL");
  addColumnIfMissing("user_items", "cv_processed", "INTEGER DEFAULT 0");

  // eBay 2026 condition descriptors
  addColumnIfMissing("user_items", "ebay_centering", "TEXT");
  addColumnIfMissing("user_items", "ebay_corner_sharpness", "TEXT");
  addColumnIfMissing("user_items", "ebay_edge_chipping", "TEXT");

  // Listing workflow fields
  addColumnIfMissing("listings", "external_listing_id", "TEXT");
  addColumnIfMissing("listings", "listing_title", "TEXT");
  addColumnIfMissing("listings", "listing_description", "TEXT");
  addColumnIfMissing("listings", "category_path", "TEXT");
  addColumnIfMissing("listings", "item_specifics", "TEXT");
  addColumnIfMissing("listings", "shipping_profile", "TEXT");
  addColumnIfMissing("listings", "image_count", "INTEGER DEFAULT 0");
  addColumnIfMissing("listings", "automation_state", "TEXT DEFAULT 'draft'");
  addColumnIfMissing("listings", "pricing_strategy", "TEXT DEFAULT 'market'");
  addColumnIfMissing("listings", "shipping_weight_oz", "REAL DEFAULT 0");
  addColumnIfMissing("listings", "export_batch_id", "TEXT");
  addColumnIfMissing("listings", "publish_status", "TEXT DEFAULT 'draft'");
  addColumnIfMissing("listings", "publish_error", "TEXT");
  addColumnIfMissing("listings", "last_sync_at", "TEXT");
  addColumnIfMissing("listings", "quantity", "INTEGER DEFAULT 1");

  // Sales workflow fields
  addColumnIfMissing("sales", "order_id", "TEXT");
  addColumnIfMissing("sales", "buyer_handle", "TEXT");
  addColumnIfMissing("sales", "packaging_cost", "REAL DEFAULT 0");
  addColumnIfMissing("sales", "grading_cost", "REAL DEFAULT 0");
  addColumnIfMissing("sales", "tax_collected", "REAL DEFAULT 0");
  addColumnIfMissing("sales", "payout_amount", "REAL DEFAULT 0");
  addColumnIfMissing("sales", "tracking_number", "TEXT");

  addColumnIfMissing("orders", "destination_country", "TEXT DEFAULT 'CA'");
  addColumnIfMissing("orders", "destination_postal_code", "TEXT");

  addColumnIfMissing("shipments", "label_url", "TEXT");
  addColumnIfMissing("shipments", "status", "TEXT DEFAULT 'pending'");
  addColumnIfMissing("shipments", "provider", "TEXT");

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
    CREATE INDEX IF NOT EXISTS idx_user_items_listing_status ON user_items(listing_status);
    CREATE INDEX IF NOT EXISTS idx_user_items_sale_status ON user_items(sale_status);
    CREATE INDEX IF NOT EXISTS idx_user_items_intake_batch_id ON user_items(intake_batch_id);
    CREATE INDEX IF NOT EXISTS idx_user_items_card_set ON user_items(card_set);
    CREATE INDEX IF NOT EXISTS idx_user_items_storage_location ON user_items(storage_location);
    CREATE INDEX IF NOT EXISTS idx_sales_card_id ON sales(card_id);
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
    CREATE INDEX IF NOT EXISTS idx_sales_order_id ON sales(order_id);
    CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
    CREATE INDEX IF NOT EXISTS idx_listings_export_batch_id ON listings(export_batch_id);
    CREATE INDEX IF NOT EXISTS idx_user_items_vault ON user_items(vault_status);
    CREATE INDEX IF NOT EXISTS idx_pricing_snapshots_item_id ON pricing_snapshots(item_id);
    CREATE INDEX IF NOT EXISTS idx_pricing_snapshots_observed_at ON pricing_snapshots(observed_at);
    CREATE INDEX IF NOT EXISTS idx_price_snapshots_item_id ON price_snapshots(item_id);
    CREATE INDEX IF NOT EXISTS idx_price_comps_snapshot_id ON price_comps(snapshot_id);
    CREATE INDEX IF NOT EXISTS idx_pricing_recommendations_item_id ON pricing_recommendations(item_id);
    CREATE INDEX IF NOT EXISTS idx_listing_exports_exported_at ON listing_exports(exported_at);
    CREATE INDEX IF NOT EXISTS idx_orders_item_id ON orders(item_id);
    CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_status ON orders(fulfillment_status);
    CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON shipments(order_id);
    CREATE INDEX IF NOT EXISTS idx_shipments_tracking_number ON shipments(tracking_number);
    CREATE INDEX IF NOT EXISTS idx_profit_events_item_id ON profit_events(item_id);
    CREATE INDEX IF NOT EXISTS idx_profit_events_order_id ON profit_events(order_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_item_id ON sale_items(item_id);
    CREATE INDEX IF NOT EXISTS idx_market_alerts_item_id ON market_alerts(item_id);
    CREATE INDEX IF NOT EXISTS idx_market_alerts_status ON market_alerts(status);
    CREATE INDEX IF NOT EXISTS idx_listing_channels_listing_id ON listing_channels(listing_id);
    CREATE INDEX IF NOT EXISTS idx_listing_channels_marketplace ON listing_channels(marketplace);
    CREATE INDEX IF NOT EXISTS idx_decisions_subject ON decisions(subject_type, subject_id);
    CREATE INDEX IF NOT EXISTS idx_decisions_type ON decisions(decision_type);
    CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);
    CREATE INDEX IF NOT EXISTS idx_intake_batch_items_batch_id ON intake_batch_items(batch_id);
    CREATE INDEX IF NOT EXISTS idx_scan_captures_batch_id ON scan_captures(batch_id);
    CREATE INDEX IF NOT EXISTS idx_scan_processing_results_batch_item_id ON scan_processing_results(batch_item_id);
    CREATE INDEX IF NOT EXISTS idx_intake_exceptions_batch_item_id ON intake_exceptions(batch_item_id);
    CREATE INDEX IF NOT EXISTS idx_catalog_cards_lookup ON catalog_cards(normalized_player_name, normalized_set_name, card_number);
    CREATE INDEX IF NOT EXISTS idx_identification_candidates_item_id ON identification_candidates(item_id);
    CREATE INDEX IF NOT EXISTS idx_identification_results_item_id ON identification_results(item_id);
    CREATE INDEX IF NOT EXISTS idx_confirmed_scan_examples_card_id ON confirmed_scan_examples(final_catalog_card_id);
  `);
}
