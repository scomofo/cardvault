import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("refreshPricingForItem uses a recent snapshot unless forceRefresh is requested", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-pricing-cache-"));
  const dbPath = join(tempDir, "cardvault.db");
  const previousPath = process.env.CARDVAULT_DB_PATH;

  process.env.CARDVAULT_DB_PATH = dbPath;

  const { initDB, run } = await import("../src/server/database.js");
  const { refreshPricingForItem } = await import("../src/server/services/pricing/pricingService.js");
  const db = initDB();

  try {
    run(
      `INSERT INTO user_items (id, name, card_set, card_number, status, sale_status)
       VALUES (?,?,?,?,?,?)`,
      ["cache-item", "Cache Card", "Cache Set", "1", "inventory", "available"],
    );
    run(
      `INSERT INTO price_snapshots
       (id, item_id, source, observed_at, condition_bucket, market_price_cents,
        average_price_cents, low_price_cents, high_price_cents, last_comp_price_cents,
        sample_size, raw_payload)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        "snapshot-cache-item",
        "cache-item",
        "cached-source",
        new Date().toISOString(),
        "raw",
        1200,
        1200,
        1000,
        1400,
        1200,
        4,
        "{}",
      ],
    );

    const cached = await refreshPricingForItem("cache-item", { source: "unknown-source" });
    assert.equal(cached.latest.id, "snapshot-cache-item");
    assert.equal(cached.latest.source, "cached-source");

    await assert.rejects(
      () => refreshPricingForItem("cache-item", { source: "unknown-source", forceRefresh: true }),
      /Unknown pricing source: unknown-source/,
    );
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
