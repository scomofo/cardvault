import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("syncMarketplaceListings covers validation, failure, conflict, and sold paths", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-sync-branches-"));
  const dbPath = join(tempDir, "cardvault.db");
  const previousPath = process.env.CARDVAULT_DB_PATH;

  process.env.CARDVAULT_DB_PATH = dbPath;

  const database = await import("../src/server/database.js");
  const registry = await import("../src/server/integrations/marketplaces/marketplaceRegistry.js");
  const { syncMarketplaceListings } = await import("../src/server/services/marketplaces/syncService.js");

  const db = database.initDB();
  const ebayAdapter = registry.getMarketplaceAdapter("ebay");
  const comcAdapter = registry.getMarketplaceAdapter("comc");
  const originalEbaySync = ebayAdapter.sync;
  const originalComcSync = comcAdapter.sync;

  function seedListing(prefix, { marketplace = "ebay", channelStatus = "active", overrides = null } = {}) {
    database.run(
      `INSERT INTO user_items (id, name, card_set, cost_basis, listing_status, sale_status, status)
       VALUES (?,?,?,?,?,?,?)`,
      [`${prefix}-item`, "Test Card", "Test Set", 25, "listed", "available", "listed"],
    );
    database.run(
      `INSERT INTO listings
       (id, card_id, card_name, card_set, platform, listing_title, start_price, shipping, status, publish_status)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [`${prefix}-listing`, `${prefix}-item`, "Test Card", "Test Set", marketplace, "Test Card listing", 100, 5, "active", "active"],
    );
    database.run(
      `INSERT INTO listing_channels
       (id, listing_id, marketplace, external_listing_id, status, last_sync_at, overrides, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
      [`${prefix}-channel`, `${prefix}-listing`, marketplace, `${prefix}-ext`, channelStatus, new Date().toISOString(), overrides],
    );
  }

  function channelEvents(channelId, eventType) {
    return database.all(
      `SELECT * FROM listing_channel_events WHERE listing_channel_id = ? AND event_type = ?`,
      [channelId, eventType],
    );
  }

  try {
    await t.test("rejects invalid marketplace and listingId inputs", async () => {
      await assert.rejects(() => syncMarketplaceListings(""), /marketplace is required/);
      await assert.rejects(() => syncMarketplaceListings(42), /marketplace is required/);
      await assert.rejects(() => syncMarketplaceListings("amazon"), /Unsupported marketplace: amazon/);
      await assert.rejects(() => syncMarketplaceListings("ebay", {}), /listingId must be a string or number/);
    });

    await t.test("normalizes marketplace case and numeric listing ids", async () => {
      const results = await syncMarketplaceListings("  EBAY  ", 12345);
      assert.deepEqual(results, []);
    });

    await t.test("records a failed sync when the adapter throws", async () => {
      seedListing("sync-fail");
      ebayAdapter.sync = async () => {
        throw new Error("boom");
      };

      const results = await syncMarketplaceListings("ebay", "sync-fail-listing");
      assert.equal(results.length, 1);
      assert.equal(results[0].error, "boom");
      assert.equal(results[0].synced, null);
      assert.equal(results[0].sale, null);

      const channel = database.get(`SELECT * FROM listing_channels WHERE id = ?`, ["sync-fail-channel"]);
      assert.equal(channel.publish_error, "boom");
      const events = channelEvents("sync-fail-channel", "sync");
      assert.equal(events.length, 1);
      assert.equal(events[0].status, "failed");
      assert.match(events[0].payload, /boom/);
    });

    await t.test("blocks apply on an external id mismatch", async () => {
      seedListing("sync-block");
      ebayAdapter.sync = async () => ({
        marketplace: "ebay",
        externalListingId: "some-other-listing",
        status: "active",
        syncedAt: new Date().toISOString(),
      });

      const results = await syncMarketplaceListings("ebay", "sync-block-listing");
      assert.equal(results.length, 1);
      assert.equal(results[0].reconciliation.hasBlockingConflict, true);
      assert.equal(results[0].sale, null);

      const channel = database.get(`SELECT * FROM listing_channels WHERE id = ?`, ["sync-block-channel"]);
      assert.equal(channel.status, "active");
      assert.match(channel.publish_error, /^Sync needs review:/);
      const listing = database.get(`SELECT * FROM listings WHERE id = ?`, ["sync-block-listing"]);
      assert.match(listing.publish_error, /^Sync needs review:/);

      const conflictEvents = channelEvents("sync-block-channel", "reconciliation_conflict");
      assert.equal(conflictEvents.length, 1);
      assert.equal(conflictEvents[0].status, "blocked");
      assert.equal(channelEvents("sync-block-channel", "sync").length, 0);
    });

    await t.test("applies remote state through a status-mismatch warning", async () => {
      seedListing("sync-warn");
      const syncedAt = new Date().toISOString();
      ebayAdapter.sync = async (listing) => ({
        marketplace: "ebay",
        externalListingId: listing.external_listing_id,
        status: "ended",
        syncedAt,
      });

      const results = await syncMarketplaceListings("ebay", "sync-warn-listing");
      assert.equal(results[0].reconciliation.hasBlockingConflict, false);
      assert.equal(results[0].reconciliation.conflicts[0].type, "status_mismatch");
      assert.equal(results[0].sale, null);

      const conflictEvents = channelEvents("sync-warn-channel", "reconciliation_conflict");
      assert.equal(conflictEvents.length, 1);
      assert.equal(conflictEvents[0].status, "warning");

      const channel = database.get(`SELECT * FROM listing_channels WHERE id = ?`, ["sync-warn-channel"]);
      assert.equal(channel.status, "ended");
      assert.equal(channel.publish_error, null);
      const listing = database.get(`SELECT * FROM listings WHERE id = ?`, ["sync-warn-listing"]);
      assert.equal(listing.last_sync_at, syncedAt);
      assert.equal(listing.status, "ended");
      assert.equal(listing.publish_status, "ended");
    });

    await t.test("creates sale and order from snake_case payload metadata and marks the item sold", async () => {
      seedListing("sync-sold");
      const syncedAt = new Date().toISOString();
      ebayAdapter.sync = async (listing) => ({
        marketplace: "ebay",
        externalListingId: listing.external_listing_id,
        status: "sold",
        syncedAt,
        payload: {
          external_order_id: "EXT-9",
          buyer: { username: "buyer_snake" },
          address: { country_code: "us", zip: " 90210 " },
          total: 100,
          delivery_cost: 8,
          tax: 5,
          total_due_seller: 90,
        },
      });

      const results = await syncMarketplaceListings("ebay", "sync-sold-listing");
      assert.ok(results[0].sale);
      assert.ok(results[0].order);

      const sale = database.get(`SELECT * FROM sales WHERE listing_id = ?`, ["sync-sold-listing"]);
      assert.equal(sale.buyer_handle, "buyer_snake");
      assert.equal(sale.sale_price, 100);
      assert.equal(sale.tax_collected, 5);
      assert.equal(sale.payout_amount, 90);
      // payout 90 - cost basis 25 - shipping 5
      assert.equal(sale.net_profit, 60);
      assert.equal(sale.date, syncedAt);

      const order = database.get(`SELECT * FROM orders WHERE listing_id = ?`, ["sync-sold-listing"]);
      assert.equal(order.external_order_id, "EXT-9");
      assert.equal(order.buyer_handle, "buyer_snake");
      assert.equal(order.destination_country, "US");
      assert.equal(order.destination_postal_code, "90210");
      assert.equal(order.shipping_charge, 8);
      assert.equal(order.sale_id, sale.id);

      const item = database.get(`SELECT * FROM user_items WHERE id = ?`, ["sync-sold-item"]);
      assert.equal(item.status, "sold");
      assert.equal(item.listing_status, "ended");
      assert.equal(item.sale_status, "sold");
      assert.equal(item.profit_realized, 60);
      assert.equal(item.sold_at, syncedAt);

      const listing = database.get(`SELECT * FROM listings WHERE id = ?`, ["sync-sold-listing"]);
      assert.equal(listing.status, "sold");
      assert.equal(listing.publish_status, "sold");
    });

    await t.test("re-syncing a sold listing updates rather than duplicates the sale and order", async () => {
      const syncedAt = new Date().toISOString();
      ebayAdapter.sync = async (listing) => ({
        marketplace: "ebay",
        externalListingId: listing.external_listing_id,
        status: "sold",
        syncedAt,
        payload: {
          external_order_id: "EXT-9",
          buyer: { username: "buyer_snake_2" },
          total: 110,
          total_due_seller: 95,
        },
      });

      const results = await syncMarketplaceListings("ebay", "sync-sold-listing");
      assert.ok(results[0].sale);
      assert.ok(results[0].order);

      const sales = database.all(`SELECT * FROM sales WHERE listing_id = ?`, ["sync-sold-listing"]);
      assert.equal(sales.length, 1);
      const orders = database.all(`SELECT * FROM orders WHERE listing_id = ?`, ["sync-sold-listing"]);
      assert.equal(orders.length, 1);
      // Fresh non-null marketplace data overwrites; nulls keep stored values
      assert.equal(sales[0].buyer_handle, "buyer_snake_2");
      assert.equal(sales[0].sale_price, 110);
      assert.equal(orders[0].destination_country, "US");
      assert.equal(orders[0].external_order_id, "EXT-9");
    });

    await t.test("merges handoff payloads into overrides and surfaces handoff exceptions", async () => {
      seedListing("sync-handoff", {
        marketplace: "comc",
        channelStatus: "handoff_submitted",
        overrides: JSON.stringify({ handoff: { submissionReference: "REF-1" } }),
      });
      const syncedAt = new Date().toISOString();
      comcAdapter.sync = async (listing) => ({
        marketplace: "comc",
        externalListingId: listing.external_listing_id,
        status: "handoff_exception",
        syncedAt,
        payload: {
          handoff: { submissionStatus: "exception", note: "Carrier rejected package" },
        },
      });

      const results = await syncMarketplaceListings("comc", "sync-handoff-listing");
      assert.equal(results[0].reconciliation.hasBlockingConflict, false);

      const channel = database.get(`SELECT * FROM listing_channels WHERE id = ?`, ["sync-handoff-channel"]);
      assert.equal(channel.status, "handoff_exception");
      assert.equal(channel.publish_error, "Carrier rejected package");
      const overrides = JSON.parse(channel.overrides);
      assert.equal(overrides.handoff.submissionReference, "REF-1");
      assert.equal(overrides.handoff.submissionStatus, "exception");
      assert.equal(overrides.handoff.note, "Carrier rejected package");

      const listing = database.get(`SELECT * FROM listings WHERE id = ?`, ["sync-handoff-listing"]);
      assert.equal(listing.publish_status, "handoff_exception");
    });
  } finally {
    ebayAdapter.sync = originalEbaySync;
    comcAdapter.sync = originalComcSync;
    db.close();
    if (previousPath === undefined) {
      delete process.env.CARDVAULT_DB_PATH;
    } else {
      process.env.CARDVAULT_DB_PATH = previousPath;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});
