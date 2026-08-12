import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("decision store persistence and market trend automation", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-decision-store-"));
  const dbPath = join(tempDir, "cardvault.db");
  const previousPath = process.env.CARDVAULT_DB_PATH;

  process.env.CARDVAULT_DB_PATH = dbPath;

  const database = await import("../src/server/database.js");
  const store = await import("../src/server/services/decisions/decisionStore.js");
  const { runMarketTrendAutomation } = await import("../src/server/services/automation/marketTrendAutomation.js");

  const db = database.initDB();

  try {
    await t.test("saveDecisions persists actions, calibration, and defaults", () => {
      const [saved] = store.saveDecisions([
        {
          decisionType: "pricing",
          subjectType: "inventory_item",
          subjectId: 42,
          recommendation: "list_at_market",
          confidence: 0.8,
          explanation: "Comp data is solid.",
          suggestedAction: { type: "set_listing_price", valueCents: 1000 },
          inputsUsed: { sampleSize: 4 },
        },
      ]);
      assert.equal(saved.subject_id, "42");
      assert.equal(saved.status, "open");
      assert.equal(saved.suggested_action_type, "set_listing_price");
      assert.equal(JSON.parse(saved.suggested_action_payload).valueCents, 1000);
      const inputs = JSON.parse(saved.inputs_json);
      assert.equal(inputs.sampleSize, 4);
      assert.equal(inputs.calibration.priorConfidence, 0.8);
      assert.equal(typeof saved.confidence, "number");

      const [bare] = store.saveDecisions([
        {
          decisionType: "grading",
          subjectType: "inventory_item",
          subjectId: "item-b",
          recommendation: "sell_raw",
          confidence: 0.5,
          explanation: "No comps.",
          status: "resolved",
          createdAt: "2026-01-01T00:00:00.000Z",
          expiresAt: "2026-02-01T00:00:00.000Z",
        },
      ]);
      assert.equal(bare.suggested_action_type, null);
      assert.equal(bare.suggested_action_payload, null);
      assert.equal(bare.status, "resolved");
      assert.equal(bare.created_at, "2026-01-01T00:00:00.000Z");
      assert.equal(bare.expires_at, "2026-02-01T00:00:00.000Z");
    });

    await t.test("listDecisions filters by subject and status", () => {
      const unfiltered = store.listDecisions();
      assert.equal(unfiltered.length, 2);
      assert.equal(store.listDecisions({ subjectId: 42 }).length, 1);
      assert.equal(store.listDecisions({ subjectType: "inventory_item", status: "resolved" }).length, 1);
      assert.equal(store.listDecisions({ status: "nope" }).length, 0);
    });

    await t.test("addDecisionFeedback records responses and resolves statuses", () => {
      const decisions = store.saveDecisions(
        ["a", "b", "c", "d"].map((suffix) => ({
          decisionType: "pricing",
          subjectType: "inventory_item",
          subjectId: `fb-${suffix}`,
          recommendation: "list_at_market",
          confidence: 0.7,
          explanation: "x",
        })),
      );

      const accepted = store.addDecisionFeedback(decisions[0].id, { accepted: true, userResponse: "accepted" });
      assert.equal(accepted.status, "accepted");
      assert.ok(accepted.resolved_at);

      const overridden = store.addDecisionFeedback(decisions[1].id, { overridden: true, overrideReason: "too low" });
      assert.equal(overridden.status, "overridden");
      assert.ok(overridden.resolved_at);

      const snoozed = store.addDecisionFeedback(decisions[2].id, { snoozed: true });
      assert.equal(snoozed.status, "snoozed");
      assert.equal(snoozed.resolved_at, null);

      const dismissed = store.addDecisionFeedback(decisions[3].id, { userResponse: "dismissed" });
      assert.equal(dismissed.status, "dismissed");
      assert.ok(dismissed.resolved_at);

      const feedbackRows = database.all("SELECT * FROM decision_feedback ORDER BY rowid");
      assert.equal(feedbackRows.length, 4);
      assert.equal(feedbackRows[1].override_reason, "too low");
      assert.equal(feedbackRows[1].overridden, 1);
      assert.equal(feedbackRows[2].snoozed, 1);
    });

    await t.test("runMarketTrendAutomation raises deduplicated trend alerts", () => {
      const seeds = [
        ["trend-hot", 100_00, 130_00, 4],
        ["trend-rising", 100_00, 112_00, 4],
        ["trend-crash", 100_00, 75_00, 4],
        ["trend-dropping", 100_00, 90_00, 4],
        ["trend-neutral", 100_00, 102_00, 4],
        ["trend-thin", 100_00, 200_00, 1],
        ["trend-zeroavg", 0, 150_00, 4],
      ];
      for (const [id, average, last, sampleSize] of seeds) {
        database.run(
          `INSERT INTO user_items (id, name, player_name) VALUES (?,?,?)`,
          [id, `${id} card`, `${id} player`],
        );
        database.run(
          `INSERT INTO price_snapshots (id, item_id, source, average_price_cents, last_comp_price_cents, sample_size)
           VALUES (?,?,?,?,?,?)`,
          [`${id}-snap`, id, "test", average, last, sampleSize],
        );
      }

      const alerts = runMarketTrendAutomation();
      const bySubject = Object.fromEntries(alerts.map((alert) => [alert.itemId, alert]));
      assert.equal(alerts.length, 4);
      assert.equal(bySubject["trend-hot"].alertType, "player_hot");
      assert.equal(bySubject["trend-hot"].suggestedAction, "suggest_auction");
      assert.equal(bySubject["trend-rising"].alertType, "price_rising");
      assert.equal(bySubject["trend-crash"].alertType, "market_crash");
      assert.equal(bySubject["trend-dropping"].alertType, "price_dropping");

      const rows = database.all("SELECT * FROM market_alerts ORDER BY item_id");
      assert.equal(rows.length, 4);
      assert.equal(rows.find((row) => row.item_id === "trend-hot").severity, "high");
      assert.match(rows.find((row) => row.item_id === "trend-hot").explanation, /trend-hot player trend is 30\.0%/);

      // A second run reports the same trends but does not duplicate open alerts
      assert.equal(runMarketTrendAutomation().length, 4);
      assert.equal(database.all("SELECT * FROM market_alerts").length, 4);
    });
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
