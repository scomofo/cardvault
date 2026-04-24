import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("marketplace sold sync preserves buyer and destination metadata from the adapter payload", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-sync-metadata-"));
  const dbPath = join(tempDir, "cardvault.db");
  const previousPath = process.env.CARDVAULT_DB_PATH;

  process.env.CARDVAULT_DB_PATH = dbPath;

  const database = await import("../src/server/database.js");
  const shared = await import("../src/server/routes/shared.js");
  const registry = await import("../src/server/integrations/marketplaces/marketplaceRegistry.js");
  const syncService = await import(`../src/server/services/marketplaces/syncService.js?ts=${Date.now()}`);

  const db = database.initDB();
  const adapter = registry.getMarketplaceAdapter("ebay");
  const originalSync = adapter.sync;

  try {
    database.run(
      `INSERT INTO user_items
       (id, name, card_set, listing_status, sale_status, status)
       VALUES (?,?,?,?,?,?)`,
      ["sync-metadata-item", "Pavel Bure", "Upper Deck", "listed", "available", "listed"],
    );

    database.run(
      `INSERT INTO listings
       (id, card_id, card_name, card_set, platform, listing_title, listing_description, start_price, sold_price, shipping, status, publish_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        "sync-metadata-listing",
        "sync-metadata-item",
        "Pavel Bure",
        "Upper Deck",
        "ebay",
        "Pavel Bure card",
        "Marketplace sync metadata test",
        149.99,
        149.99,
        9.99,
        "active",
        "active",
      ],
    );

    database.run(
      `INSERT INTO listing_channels
       (id, listing_id, marketplace, external_listing_id, status, last_sync_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,datetime('now'),datetime('now'))`,
      [
        "sync-metadata-channel",
        "sync-metadata-listing",
        "ebay",
        "ebay-sync-meta",
        "active",
        new Date().toISOString(),
      ],
    );

    adapter.sync = async (listing) => ({
      marketplace: "ebay",
      externalListingId: listing.external_listing_id,
      status: "sold",
      syncedAt: new Date().toISOString(),
      payload: {
        buyerHandle: "buyer_99",
        externalOrderId: "EBAY-ORDER-123",
        shippingAddress: {
          countryCode: "US",
          postalCode: "90210",
        },
      },
    });

    const results = await syncService.syncMarketplaceListings("ebay", "sync-metadata-listing");
    assert.equal(results.length, 1);
    assert.ok(results[0].sale);
    assert.ok(results[0].order);

    const sale = database.get(`SELECT * FROM sales WHERE listing_id = ?`, ["sync-metadata-listing"]);
    const order = database.get(`SELECT * FROM orders WHERE listing_id = ?`, ["sync-metadata-listing"]);

    assert.ok(sale);
    assert.ok(order);
    assert.equal(sale.buyer_handle, "buyer_99");
    assert.equal(order.buyer_handle, "buyer_99");
    assert.equal(order.external_order_id, "EBAY-ORDER-123");
    assert.equal(order.destination_country, "US");
    assert.equal(order.destination_postal_code, "90210");
  } finally {
    adapter.sync = originalSync;
    db.close();
    if (previousPath === undefined) {
      delete process.env.CARDVAULT_DB_PATH;
    } else {
      process.env.CARDVAULT_DB_PATH = previousPath;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});
