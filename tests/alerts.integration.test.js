import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";

import { startTestServer } from "./helpers/testServer.js";

test("alerts route lists open alerts and supports resolution workflows", async (t) => {
  const { baseUrl, dbPath } = await startTestServer(t, {
    dirPrefix: "cardvault-alerts-",
  });
  const db = new Database(dbPath);
  try {
    db.prepare(
      `INSERT INTO user_items
       (id, name, card_set, card_number, status, sale_status, suggested_listing_price, market_price, listing_status)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run("alert-item", "Alert Card", "Alert Set", "11", "inventory", "available", 19.5, 24, "listed");
    db.prepare(
      `INSERT INTO market_alerts
       (id, item_id, alert_type, severity, explanation, suggested_action, status, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run("alert-high", "alert-item", "repricing", "high", "Drop price", "price_drop_suggestion", "open", "2026-01-02T00:00:00.000Z");
    db.prepare(
      `INSERT INTO market_alerts
       (id, item_id, alert_type, severity, explanation, suggested_action, status, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run("alert-low", "alert-item", "review", "low", "Review item", "review_inventory", "open", "2026-01-03T00:00:00.000Z");
    db.prepare(
      `INSERT INTO market_alerts
       (id, item_id, alert_type, severity, explanation, suggested_action, status, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run("alert-resolved", "alert-item", "repricing", "medium", "Already resolved", "review_alert", "resolved", "2026-01-04T00:00:00.000Z");

    const listResponse = await fetch(`${baseUrl}/api/alerts`);
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();
    assert.deepEqual(listPayload.map((alert) => alert.id), ["alert-high", "alert-low"]);
    assert.equal(typeof listPayload[0].updatedAt, "string");
    assert.deepEqual({ ...listPayload[0], updatedAt: "<timestamp>" }, {
      id: "alert-high",
      itemId: "alert-item",
      listingId: null,
      alertType: "repricing",
      severity: "high",
      explanation: "Drop price",
      suggestedAction: "price_drop_suggestion",
      status: "open",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "<timestamp>",
      itemName: "Alert Card",
      suggestedListingPrice: 19.5,
      marketPrice: 24,
      listingStatus: "listed",
    });

    const resolvedResponse = await fetch(`${baseUrl}/api/alerts?status=resolved`);
    assert.equal(resolvedResponse.status, 200);
    assert.deepEqual((await resolvedResponse.json()).map((alert) => alert.id), ["alert-resolved"]);

    const invalidStatusResponse = await fetch(`${baseUrl}/api/alerts/alert-high`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ignored" }),
    });
    assert.equal(invalidStatusResponse.status, 400);
    assert.match((await invalidStatusResponse.json()).error, /status must be one of/);

    const patchResponse = await fetch(`${baseUrl}/api/alerts/alert-high`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "snoozed" }),
    });
    assert.equal(patchResponse.status, 200);
    const patchPayload = await patchResponse.json();
    assert.equal(patchPayload.id, "alert-high");
    assert.equal(patchPayload.alertType, "repricing");
    assert.equal(patchPayload.status, "snoozed");

    const dismissResponse = await fetch(`${baseUrl}/api/alerts/dismiss-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertType: "review" }),
    });
    assert.equal(dismissResponse.status, 200);
    assert.deepEqual(await dismissResponse.json(), { dismissed: 1 });
    assert.equal(
      db.prepare("SELECT status FROM market_alerts WHERE id = ?").get("alert-low").status,
      "resolved",
    );
    assert.equal(
      db.prepare("SELECT status FROM market_alerts WHERE id = ?").get("alert-high").status,
      "snoozed",
    );
  } finally {
    db.close();
  }
});
