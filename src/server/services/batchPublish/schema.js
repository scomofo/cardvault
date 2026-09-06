export function createPublishBatchTables(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS publish_batches (
    id TEXT PRIMARY KEY, config TEXT NOT NULL, environment TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS publish_batch_rows (
    id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES publish_batches(id) ON DELETE CASCADE,
    listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'unchecked',
    snapshot TEXT, fingerprint TEXT, item_xml TEXT, proof TEXT, checked_at INTEGER,
    result TEXT, error TEXT, started_at INTEGER, external_id TEXT,
    UNIQUE(batch_id, listing_id)
  );
  CREATE INDEX IF NOT EXISTS idx_publish_rows_listing ON publish_batch_rows(listing_id);
  CREATE INDEX IF NOT EXISTS idx_publish_rows_batch ON publish_batch_rows(batch_id);
  CREATE TRIGGER IF NOT EXISTS cleanup_empty_publish_batches AFTER DELETE ON publish_batch_rows
  BEGIN
    DELETE FROM publish_batches WHERE id = OLD.batch_id
      AND NOT EXISTS (SELECT 1 FROM publish_batch_rows WHERE batch_id = OLD.batch_id);
  END;`);
}
