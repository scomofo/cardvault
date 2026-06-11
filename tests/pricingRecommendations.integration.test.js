import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";

import { startTestServer } from "./helpers/testServer.js";

test("pricing recommendations route lists latest recommendations and applies or dismisses them", async (t) => {
  const { baseUrl, dbPath } = await startTestServer(t, {
    dirPrefix: "cardvault-pricing-recs-",
  });
  const db = new Database(dbPath);
  try {
    db.prepare(
      `INSERT INTO user_items (id, name, card_set, card_number, status, sale_status)
       VALUES (?,?,?,?,?,?)`,
    ).run("rec-item", "Pricing Rec Card", "Rec Set", "9", "inventory", "available");
    db.prepare(
      `INSERT INTO pricing_recommendations
       (id, item_id, strategy, recommended_price_cents, minimum_acceptable_price_cents, confidence, explanation, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run("old-market", "rec-item", "market", 1000, 800, "low", "old market", "2026-01-01T00:00:00.000Z");
    db.prepare(
      `INSERT INTO pricing_recommendations
       (id, item_id, strategy, recommended_price_cents, minimum_acceptable_price_cents, confidence, explanation, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run("new-market", "rec-item", "market", 1250, 900, "high", "new market", "2026-01-02T00:00:00.000Z");
    db.prepare(
      `INSERT INTO pricing_recommendations
       (id, item_id, strategy, recommended_price_cents, minimum_acceptable_price_cents, confidence, explanation, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run("quick-sale", "rec-item", "quick_sale", 1100, 850, "medium", "quick sale", "2026-01-03T00:00:00.000Z");

    const listResponse = await fetch(`${baseUrl}/api/pricing-recommendations`);
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();
    assert.equal(listPayload.length, 2);
    assert.ok(listPayload.some((rec) => rec.id === "new-market"));
    assert.ok(!listPayload.some((rec) => rec.id === "old-market"));
    assert.deepEqual(
      listPayload.find((rec) => rec.id === "new-market"),
      {
        id: "new-market",
        itemId: "rec-item",
        strategy: "market",
        recommendedPriceCents: 1250,
        minimumAcceptablePriceCents: 900,
        confidence: "high",
        explanation: "new market",
        createdAt: "2026-01-02T00:00:00.000Z",
        itemName: "Pricing Rec Card",
        itemSet: "Rec Set",
        condition: "near_mint",
        suggestedListingPrice: 0,
        marketPrice: 0,
      },
    );

    const filteredResponse = await fetch(`${baseUrl}/api/pricing-recommendations?strategy=quick_sale`);
    assert.equal(filteredResponse.status, 200);
    const filteredPayload = await filteredResponse.json();
    assert.deepEqual(filteredPayload.map((rec) => rec.id), ["quick-sale"]);

    const applyResponse = await fetch(`${baseUrl}/api/pricing-recommendations/new-market/apply`, {
      method: "POST",
    });
    assert.equal(applyResponse.status, 200);
    assert.deepEqual(await applyResponse.json(), {
      ok: true,
      itemId: "rec-item",
      price: 12.5,
    });
    assert.equal(
      db.prepare("SELECT suggested_listing_price FROM user_items WHERE id = ?").get("rec-item").suggested_listing_price,
      12.5,
    );

    const dismissResponse = await fetch(`${baseUrl}/api/pricing-recommendations/quick-sale`, {
      method: "DELETE",
    });
    assert.equal(dismissResponse.status, 200);
    assert.deepEqual(await dismissResponse.json(), { ok: true });
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM pricing_recommendations WHERE id = ?").get("quick-sale").count,
      0,
    );
  } finally {
    db.close();
  }
});
