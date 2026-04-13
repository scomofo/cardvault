export function runMigrations(db) {
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

  // Identification feedback payload (serialized clues + candidate snapshot)
  // used to retrain similarity weights from confirmations and corrections.
  addColumnIfMissing("identification_feedback", "payload_json", "TEXT");

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

export function createIndexes(db) {
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
    CREATE INDEX IF NOT EXISTS idx_price_snapshots_item_id ON price_snapshots(item_id);
    CREATE INDEX IF NOT EXISTS idx_price_comps_snapshot_id ON price_comps(snapshot_id);
    CREATE INDEX IF NOT EXISTS idx_pricing_recommendations_item_id ON pricing_recommendations(item_id);
    CREATE INDEX IF NOT EXISTS idx_listing_exports_exported_at ON listing_exports(exported_at);
    CREATE INDEX IF NOT EXISTS idx_orders_item_id ON orders(item_id);
    CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_status ON orders(fulfillment_status);
    CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON shipments(order_id);
    CREATE INDEX IF NOT EXISTS idx_shipments_tracking_number ON shipments(tracking_number);
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