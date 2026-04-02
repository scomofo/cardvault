import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("database initializes monetization pipeline tables and columns", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-schema-"));
  const dbPath = join(tempDir, "cardvault.db");
  const previousPath = process.env.CARDVAULT_DB_PATH;

  process.env.CARDVAULT_DB_PATH = dbPath;

  const { initDB, all } = await import("../src/server/database.js");
  const db = initDB();

  try {
    const tables = all(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?,?,?,?,?) ORDER BY name",
      ["intake_batches", "pricing_snapshots", "listing_batches", "orders", "shipments"],
    ).map((row) => row.name);

    assert.deepEqual(tables, [
      "intake_batches",
      "listing_batches",
      "orders",
      "pricing_snapshots",
      "shipments",
    ]);

    const userItemColumns = all("PRAGMA table_info(user_items)").map((column) => column.name);
    assert.ok(userItemColumns.includes("intake_batch_id"));
    assert.ok(userItemColumns.includes("storage_location"));
    assert.ok(userItemColumns.includes("market_price"));
    assert.ok(userItemColumns.includes("suggested_listing_price"));
    assert.ok(userItemColumns.includes("profit_realized"));

    const listingColumns = all("PRAGMA table_info(listings)").map((column) => column.name);
    assert.ok(listingColumns.includes("listing_title"));
    assert.ok(listingColumns.includes("pricing_strategy"));
    assert.ok(listingColumns.includes("shipping_weight_oz"));

    const salesColumns = all("PRAGMA table_info(sales)").map((column) => column.name);
    assert.ok(salesColumns.includes("order_id"));
    assert.ok(salesColumns.includes("packaging_cost"));
    assert.ok(salesColumns.includes("payout_amount"));
  } finally {
    db.close();
    if (previousPath === undefined) {
      delete process.env.CARDVAULT_DB_PATH;
    } else {
      process.env.CARDVAULT_DB_PATH = previousPath;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});
