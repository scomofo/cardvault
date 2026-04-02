import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("decision engine evaluates inventory items and builds an action queue", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-decisions-"));
  const dbPath = join(tempDir, "cardvault.db");
  const previousPath = process.env.CARDVAULT_DB_PATH;

  process.env.CARDVAULT_DB_PATH = dbPath;

  const database = await import("../src/server/database.js");
  const shared = await import("../src/server/routes/shared.js");
  const engine = await import("../src/server/services/decisions/decisionEngine.js");

  const db = database.initDB();

  try {
    const itemId = shared.uid();
    database.run(
      `INSERT INTO user_items
       (id, name, player_name, card_set, year, card_number, cost_basis, market_price,
        suggested_listing_price, listing_status, sale_status, front_img_id, acquisition_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        itemId,
        "Ken Griffey Jr.",
        "Ken Griffey Jr.",
        "Topps Chrome",
        "1998",
        "120",
        25,
        80,
        79.99,
        "draft",
        "available",
        "front-1",
        "2025-11-01T00:00:00.000Z",
      ],
    );

    database.run(
      `INSERT INTO price_snapshots
       (id, item_id, source, observed_at, condition_bucket, market_price_cents,
        average_price_cents, low_price_cents, high_price_cents, last_comp_price_cents, sample_size)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        shared.uid(),
        itemId,
        "sportscardspro",
        new Date().toISOString(),
        "raw",
        8000,
        7600,
        6900,
        9100,
        7900,
        9,
      ],
    );

    const orderId = shared.uid();
    database.run(
      `INSERT INTO orders (id, item_id, platform, sale_price, fulfillment_status, sold_at)
       VALUES (?,?,?,?,?,?)`,
      [orderId, itemId, "ebay", 65, "pending", new Date().toISOString()],
    );

    const decisions = engine.evaluateSubject("inventory_item", itemId);
    assert.ok(decisions.length >= 5);
    assert.ok(decisions.some((decision) => decision.decision_type === "pricing_decision"));
    assert.ok(decisions.some((decision) => decision.decision_type === "listing_readiness_decision"));

    const queue = engine.buildActionQueue();
    assert.ok(queue.some((entry) => entry.subjectType === "order" && entry.subjectId === orderId));
    assert.ok(queue.some((entry) => entry.subjectType === "inventory_item" && entry.subjectId === itemId));
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
