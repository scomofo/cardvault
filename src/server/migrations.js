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
  addColumnIfMissing("user_items", "front_img_phash", "TEXT");
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

  addColumnIfMissing("purchases", "external_order_id", "TEXT");

  addColumnIfMissing("orders", "destination_country", "TEXT DEFAULT 'CA'");
  addColumnIfMissing("orders", "destination_postal_code", "TEXT");

  addColumnIfMissing("shipments", "label_url", "TEXT");
  addColumnIfMissing("shipments", "status", "TEXT DEFAULT 'pending'");
  addColumnIfMissing("shipments", "provider", "TEXT");
  addColumnIfMissing("listing_channels", "remote_updated_at", "TEXT");
  addColumnIfMissing("listing_channels", "remote_price_history", "TEXT");

  // Identification feedback payload (serialized clues + candidate snapshot)
  // used to retrain similarity weights from confirmations and corrections.
  addColumnIfMissing("identification_feedback", "payload_json", "TEXT");

  // CV scans audit log
  db.exec(`
    CREATE TABLE IF NOT EXISTS cv_scans (
      id TEXT PRIMARY KEY,
      item_id TEXT REFERENCES user_items(id) ON DELETE SET NULL,
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

    CREATE TABLE IF NOT EXISTS batch_presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      defaults_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fee_models (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL UNIQUE,
      fee_rate REAL NOT NULL DEFAULT 0,
      label TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS canada_post_manifest_runs (
      id TEXT PRIMARY KEY,
      connection_id TEXT REFERENCES shipping_provider_connections(id) ON DELETE SET NULL,
      status TEXT DEFAULT 'running',
      group_ids TEXT NOT NULL DEFAULT '[]',
      manifest_urls TEXT NOT NULL DEFAULT '[]',
      artifact_urls TEXT NOT NULL DEFAULT '[]',
      po_numbers TEXT NOT NULL DEFAULT '[]',
      error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS canada_post_manifest_artifacts (
      id TEXT PRIMARY KEY,
      manifest_run_id TEXT NOT NULL REFERENCES canada_post_manifest_runs(id) ON DELETE CASCADE,
      source_url TEXT,
      content_type TEXT DEFAULT 'application/pdf',
      byte_size INTEGER DEFAULT 0,
      content BLOB NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // sales.card_id, listings.card_id, orders.sale_id/listing_id/item_id,
  // shipments.item_id, and cv_scans.item_id were declared with no ON DELETE
  // action, so deleting a card that was ever sold, listed, or scanned fails
  // with a raw FOREIGN KEY constraint error instead of detaching the history
  // row that should survive it. SQLite can't ALTER a foreign key's ON DELETE
  // action in place, so rebuild each affected table once (guarded by
  // inspecting the live schema, so this only runs a single time per DB).
  const foreignKeyOnDelete = (table, column) =>
    db.prepare(`PRAGMA foreign_key_list(${table})`).all()
      .find((fk) => fk.from === column)?.on_delete;

  const rebuildTableWithOnDeleteSetNull = (table, createRebuildTableSql) => {
    const rebuildTable = `${table}__rebuild`;
    const columnList = getColumns(table).join(", ");
    // Any view whose definition names this table goes stale the instant the
    // table is dropped, and SQLite re-validates every view on the next
    // schema change (even one inside the same transaction) — so it has to
    // be dropped and recreated around the rebuild, not just left alone.
    const dependentViews = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'view'`)
      .all()
      .filter((view) => new RegExp(`\\b${table}\\b`).test(view.sql));
    const wasForeignKeysOn = db.pragma("foreign_keys", { simple: true }) === 1;
    if (wasForeignKeysOn) db.pragma("foreign_keys = OFF");
    try {
      db.transaction(() => {
        for (const view of dependentViews) db.exec(`DROP VIEW IF EXISTS ${view.name}`);
        db.exec(createRebuildTableSql);
        db.exec(`INSERT INTO ${rebuildTable} (${columnList}) SELECT ${columnList} FROM ${table}`);
        db.exec(`DROP TABLE ${table}`);
        db.exec(`ALTER TABLE ${rebuildTable} RENAME TO ${table}`);
        for (const view of dependentViews) db.exec(view.sql);
      })();
    } finally {
      if (wasForeignKeysOn) db.pragma("foreign_keys = ON");
    }
  };

  if (foreignKeyOnDelete("sales", "card_id") !== "SET NULL") {
    rebuildTableWithOnDeleteSetNull("sales", `
      CREATE TABLE sales__rebuild (
        id TEXT PRIMARY KEY,
        card_id TEXT REFERENCES user_items(id) ON DELETE SET NULL,
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
        tracking_number TEXT,
        listing_id TEXT,
        date TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  if (foreignKeyOnDelete("listings", "card_id") !== "SET NULL") {
    rebuildTableWithOnDeleteSetNull("listings", `
      CREATE TABLE listings__rebuild (
        id TEXT PRIMARY KEY,
        card_id TEXT REFERENCES user_items(id) ON DELETE SET NULL,
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
        quantity INTEGER DEFAULT 1,
        status TEXT DEFAULT 'active',
        publish_status TEXT DEFAULT 'draft',
        publish_error TEXT,
        last_sync_at TEXT,
        sold_price REAL,
        sold_date TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  if (foreignKeyOnDelete("orders", "sale_id") !== "SET NULL") {
    rebuildTableWithOnDeleteSetNull("orders", `
      CREATE TABLE orders__rebuild (
        id TEXT PRIMARY KEY,
        sale_id TEXT REFERENCES sales(id) ON DELETE SET NULL,
        listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
        item_id TEXT REFERENCES user_items(id) ON DELETE SET NULL,
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
    `);
  }

  if (foreignKeyOnDelete("shipments", "item_id") !== "SET NULL") {
    rebuildTableWithOnDeleteSetNull("shipments", `
      CREATE TABLE shipments__rebuild (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        item_id TEXT REFERENCES user_items(id) ON DELETE SET NULL,
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
        label_url TEXT,
        status TEXT DEFAULT 'pending',
        provider TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  if (foreignKeyOnDelete("cv_scans", "item_id") !== "SET NULL") {
    rebuildTableWithOnDeleteSetNull("cv_scans", `
      CREATE TABLE cv_scans__rebuild (
        id TEXT PRIMARY KEY,
        item_id TEXT REFERENCES user_items(id) ON DELETE SET NULL,
        centering_lr TEXT,
        centering_tb TEXT,
        centering_score REAL,
        detection_confidence REAL,
        warp_quality REAL,
        processing_ms INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }
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
    CREATE INDEX IF NOT EXISTS idx_purchases_external_order_id ON purchases(external_order_id);
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
    CREATE INDEX IF NOT EXISTS idx_canada_post_manifest_runs_created_at ON canada_post_manifest_runs(created_at);
    CREATE INDEX IF NOT EXISTS idx_canada_post_manifest_artifacts_run_id ON canada_post_manifest_artifacts(manifest_run_id);
  `);
}
