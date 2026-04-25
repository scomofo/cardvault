/**
 * Operational seller pipeline tables.
 * @param {import("better-sqlite3").Database} db
 */
export function createTables(db) {
  db.exec(`
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
      front_img_phash TEXT,
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
      grading_decision TEXT,
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
      tracking_number TEXT,
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
      external_order_id TEXT,
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
      label_url TEXT,
      status TEXT DEFAULT 'pending',
      provider TEXT,
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

    CREATE TABLE IF NOT EXISTS early_access_signups (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT,
      message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS seller_sessions (
      token TEXT PRIMARY KEY,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS batch_presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      defaults_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

  `);
}
