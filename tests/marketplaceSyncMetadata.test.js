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
        salePrice: 132.5,
        shippingCharge: 12,
        taxCollected: 7.5,
        payoutAmount: 140,
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
    assert.equal(sale.sale_price, 132.5);
    assert.equal(sale.tax_collected, 7.5);
    assert.equal(sale.payout_amount, 140);
    assert.equal(order.buyer_handle, "buyer_99");
    assert.equal(order.external_order_id, "EBAY-ORDER-123");
    assert.equal(order.sale_price, 132.5);
    assert.equal(order.shipping_charge, 12);
    assert.equal(order.tax_collected, 7.5);
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

test("marketplace sold sync backfills metadata on existing sale and order rows", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-sync-metadata-update-"));
  const dbPath = join(tempDir, "cardvault.db");
  const previousPath = process.env.CARDVAULT_DB_PATH;

  process.env.CARDVAULT_DB_PATH = dbPath;

  const database = await import("../src/server/database.js");
  const registry = await import("../src/server/integrations/marketplaces/marketplaceRegistry.js");
  const syncService = await import(`../src/server/services/marketplaces/syncService.js?ts=${Date.now()}`);

  const db = database.initDB();
  const adapter = registry.getMarketplaceAdapter("ebay");
  const originalSync = adapter.sync;

  try {
    database.run(
      `INSERT INTO user_items
       (id, name, card_set, cost_basis, listing_status, sale_status, status)
       VALUES (?,?,?,?,?,?,?)`,
      ["sync-update-item", "Joe Sakic", "Upper Deck", 25, "listed", "available", "listed"],
    );

    database.run(
      `INSERT INTO listings
       (id, card_id, card_name, card_set, platform, listing_title, listing_description, start_price, sold_price, shipping, status, publish_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        "sync-update-listing",
        "sync-update-item",
        "Joe Sakic",
        "Upper Deck",
        "ebay",
        "Joe Sakic card",
        "Marketplace sync metadata backfill test",
        80,
        80,
        5,
        "active",
        "active",
      ],
    );

    database.run(
      `INSERT INTO listing_channels
       (id, listing_id, marketplace, external_listing_id, status, last_sync_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,datetime('now'),datetime('now'))`,
      [
        "sync-update-channel",
        "sync-update-listing",
        "ebay",
        "ebay-sync-update",
        "active",
        new Date().toISOString(),
      ],
    );

    database.run(
      `INSERT INTO sales
       (id, card_id, order_id, card_name, card_set, sale_price, cost_basis, platform, buyer_handle, fees, shipping_cost, packaging_cost, grading_cost, tax_collected, payout_amount, net_profit, listing_id, date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        "existing-sale",
        "sync-update-item",
        "existing-order",
        "Joe Sakic",
        "Upper Deck",
        80,
        0,
        "ebay",
        null,
        0,
        5,
        0,
        0,
        0,
        80,
        75,
        "sync-update-listing",
        new Date().toISOString(),
      ],
    );

    database.run(
      `INSERT INTO orders
       (id, sale_id, listing_id, item_id, platform, external_order_id, buyer_handle, sale_price, fees, shipping_charge, tax_collected, destination_country, destination_postal_code, payment_status, fulfillment_status, sold_at, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`,
      [
        "existing-order",
        "existing-sale",
        "sync-update-listing",
        "sync-update-item",
        "ebay",
        null,
        null,
        80,
        0,
        0,
        0,
        "CA",
        null,
        "paid",
        "pending",
        new Date().toISOString(),
      ],
    );

    adapter.sync = async (listing) => ({
      marketplace: "ebay",
      externalListingId: listing.external_listing_id,
      status: "sold",
      syncedAt: new Date().toISOString(),
      payload: {
        buyerHandle: "backfilled_buyer",
        externalOrderId: "EBAY-BACKFILL-1",
        salePrice: 95,
        shippingCharge: 7,
        taxCollected: 3,
        payoutAmount: 98,
        shippingAddress: {
          countryCode: "US",
          postalCode: "73301",
        },
      },
    });

    const results = await syncService.syncMarketplaceListings("ebay", "sync-update-listing");
    assert.equal(results.length, 1);

    const sale = database.get(`SELECT * FROM sales WHERE id = ?`, ["existing-sale"]);
    const order = database.get(`SELECT * FROM orders WHERE id = ?`, ["existing-order"]);

    assert.equal(sale.buyer_handle, "backfilled_buyer");
    assert.equal(sale.sale_price, 95);
    assert.equal(sale.cost_basis, 25);
    assert.equal(sale.tax_collected, 3);
    assert.equal(sale.payout_amount, 98);
    assert.equal(sale.net_profit, 68);

    assert.equal(order.external_order_id, "EBAY-BACKFILL-1");
    assert.equal(order.buyer_handle, "backfilled_buyer");
    assert.equal(order.sale_price, 95);
    assert.equal(order.shipping_charge, 7);
    assert.equal(order.tax_collected, 3);
    assert.equal(order.destination_country, "US");
    assert.equal(order.destination_postal_code, "73301");
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

test("marketplace sold sync repairs stale sale and order platform metadata", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-sync-platform-update-"));
  const dbPath = join(tempDir, "cardvault.db");
  const previousPath = process.env.CARDVAULT_DB_PATH;

  process.env.CARDVAULT_DB_PATH = dbPath;

  const database = await import("../src/server/database.js");
  const registry = await import("../src/server/integrations/marketplaces/marketplaceRegistry.js");
  const syncService = await import(`../src/server/services/marketplaces/syncService.js?ts=${Date.now()}`);

  const db = database.initDB();
  const adapter = registry.getMarketplaceAdapter("shopify");
  const originalSync = adapter.sync;

  try {
    database.run(
      `INSERT INTO user_items
       (id, name, card_set, cost_basis, listing_status, sale_status, status)
       VALUES (?,?,?,?,?,?,?)`,
      ["sync-platform-item", "Mats Sundin", "Upper Deck", 15, "listed", "available", "listed"],
    );

    database.run(
      `INSERT INTO listings
       (id, card_id, card_name, card_set, platform, listing_title, listing_description, start_price, sold_price, shipping, status, publish_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        "sync-platform-listing",
        "sync-platform-item",
        "Mats Sundin",
        "Upper Deck",
        "ebay",
        "Mats Sundin card",
        "Marketplace sync platform repair test",
        60,
        60,
        4,
        "active",
        "active",
      ],
    );

    database.run(
      `INSERT INTO listing_channels
       (id, listing_id, marketplace, external_listing_id, status, last_sync_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,datetime('now'),datetime('now'))`,
      [
        "sync-platform-channel",
        "sync-platform-listing",
        "shopify",
        "shopify-sync-platform",
        "active",
        new Date().toISOString(),
      ],
    );

    database.run(
      `INSERT INTO sales
       (id, card_id, order_id, card_name, card_set, sale_price, cost_basis, platform, buyer_handle, fees, shipping_cost, packaging_cost, grading_cost, tax_collected, payout_amount, net_profit, listing_id, date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        "existing-shop-sale",
        "sync-platform-item",
        "existing-shop-order",
        "Mats Sundin",
        "Upper Deck",
        60,
        0,
        "ebay",
        null,
        0,
        4,
        0,
        0,
        0,
        60,
        56,
        "sync-platform-listing",
        new Date().toISOString(),
      ],
    );

    database.run(
      `INSERT INTO orders
       (id, sale_id, listing_id, item_id, platform, external_order_id, buyer_handle, sale_price, fees, shipping_charge, tax_collected, destination_country, destination_postal_code, payment_status, fulfillment_status, sold_at, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`,
      [
        "existing-shop-order",
        "existing-shop-sale",
        "sync-platform-listing",
        "sync-platform-item",
        "ebay",
        null,
        null,
        60,
        0,
        0,
        0,
        "CA",
        null,
        "paid",
        "pending",
        new Date().toISOString(),
      ],
    );

    adapter.sync = async (listing) => ({
      marketplace: "shopify",
      externalListingId: listing.external_listing_id,
      status: "sold",
      syncedAt: new Date().toISOString(),
      payload: {
        buyerHandle: "shopify_buyer",
        externalOrderId: "SHOPIFY-ORDER-1",
        salePrice: 65,
        shippingCharge: 8,
        taxCollected: 2,
        payoutAmount: 70,
        shippingAddress: {
          countryCode: "US",
          postalCode: "60601",
        },
      },
    });

    const results = await syncService.syncMarketplaceListings("shopify", "sync-platform-listing");
    assert.equal(results.length, 1);

    const sale = database.get(`SELECT * FROM sales WHERE id = ?`, ["existing-shop-sale"]);
    const order = database.get(`SELECT * FROM orders WHERE id = ?`, ["existing-shop-order"]);

    assert.equal(sale.platform, "shopify");
    assert.equal(order.platform, "shopify");
    assert.equal(order.external_order_id, "SHOPIFY-ORDER-1");
    assert.equal(order.buyer_handle, "shopify_buyer");
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

test("marketplace sold sync relinks an existing order to the reused sale", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-sync-order-link-"));
  const dbPath = join(tempDir, "cardvault.db");
  const previousPath = process.env.CARDVAULT_DB_PATH;

  process.env.CARDVAULT_DB_PATH = dbPath;

  const database = await import("../src/server/database.js");
  const registry = await import("../src/server/integrations/marketplaces/marketplaceRegistry.js");
  const syncService = await import(`../src/server/services/marketplaces/syncService.js?ts=${Date.now()}`);

  const db = database.initDB();
  const adapter = registry.getMarketplaceAdapter("ebay");
  const originalSync = adapter.sync;

  try {
    database.run(
      `INSERT INTO user_items
       (id, name, card_set, cost_basis, listing_status, sale_status, status)
       VALUES (?,?,?,?,?,?,?)`,
      ["sync-link-item", "Teemu Selanne", "Upper Deck", 20, "listed", "available", "listed"],
    );

    database.run(
      `INSERT INTO listings
       (id, card_id, card_name, card_set, platform, listing_title, listing_description, start_price, sold_price, shipping, status, publish_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        "sync-link-listing",
        "sync-link-item",
        "Teemu Selanne",
        "Upper Deck",
        "ebay",
        "Teemu Selanne card",
        "Marketplace sync reused order link test",
        90,
        90,
        5,
        "active",
        "active",
      ],
    );

    database.run(
      `INSERT INTO listing_channels
       (id, listing_id, marketplace, external_listing_id, status, last_sync_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,datetime('now'),datetime('now'))`,
      [
        "sync-link-channel",
        "sync-link-listing",
        "ebay",
        "ebay-sync-link",
        "active",
        new Date().toISOString(),
      ],
    );

    database.run(
      `INSERT INTO sales
       (id, card_id, order_id, card_name, card_set, sale_price, cost_basis, platform, buyer_handle, fees, shipping_cost, packaging_cost, grading_cost, tax_collected, payout_amount, net_profit, listing_id, date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        "existing-link-sale",
        "sync-link-item",
        null,
        "Teemu Selanne",
        "Upper Deck",
        90,
        0,
        "ebay",
        null,
        0,
        5,
        0,
        0,
        0,
        90,
        85,
        "sync-link-listing",
        new Date().toISOString(),
      ],
    );

    database.run(
      `INSERT INTO orders
       (id, sale_id, listing_id, item_id, platform, external_order_id, buyer_handle, sale_price, fees, shipping_charge, tax_collected, destination_country, destination_postal_code, payment_status, fulfillment_status, sold_at, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`,
      [
        "existing-link-order",
        null,
        "sync-link-listing",
        "sync-link-item",
        "ebay",
        null,
        null,
        90,
        0,
        0,
        0,
        "CA",
        null,
        "paid",
        "pending",
        new Date().toISOString(),
      ],
    );

    adapter.sync = async (listing) => ({
      marketplace: "ebay",
      externalListingId: listing.external_listing_id,
      status: "sold",
      syncedAt: new Date().toISOString(),
      payload: {
        buyerHandle: "linked_buyer",
        externalOrderId: "EBAY-LINK-1",
        salePrice: 92,
        shippingCharge: 6,
        taxCollected: 2,
        payoutAmount: 94,
        shippingAddress: {
          countryCode: "US",
          postalCode: "30301",
        },
      },
    });

    const results = await syncService.syncMarketplaceListings("ebay", "sync-link-listing");
    assert.equal(results.length, 1);

    const sale = database.get(`SELECT * FROM sales WHERE id = ?`, ["existing-link-sale"]);
    const order = database.get(`SELECT * FROM orders WHERE id = ?`, ["existing-link-order"]);

    assert.equal(sale.order_id, "existing-link-order");
    assert.equal(order.sale_id, "existing-link-sale");
    assert.equal(order.external_order_id, "EBAY-LINK-1");
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

test("marketplace sync applies payload-native remote state", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-sync-payload-state-"));
  const dbPath = join(tempDir, "cardvault.db");
  const previousPath = process.env.CARDVAULT_DB_PATH;

  process.env.CARDVAULT_DB_PATH = dbPath;

  const database = await import("../src/server/database.js");
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
      ["sync-payload-state-item", "Mark Messier", "Upper Deck", "listed", "available", "listed"],
    );

    database.run(
      `INSERT INTO listings
       (id, card_id, card_name, card_set, platform, listing_title, listing_description, start_price, shipping, status, publish_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        "sync-payload-state-listing",
        "sync-payload-state-item",
        "Mark Messier",
        "Upper Deck",
        "ebay",
        "Mark Messier card",
        "Payload-native remote state test",
        49.99,
        4.99,
        "active",
        "active",
      ],
    );

    database.run(
      `INSERT INTO listing_channels
       (id, listing_id, marketplace, external_listing_id, status, last_sync_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,datetime('now'),datetime('now'))`,
      [
        "sync-payload-state-channel",
        "sync-payload-state-listing",
        "ebay",
        "ebay-payload-state",
        "active",
        new Date().toISOString(),
      ],
    );

    adapter.sync = async (listing) => ({
      marketplace: "ebay",
      syncedAt: "2026-06-11T03:00:00.000Z",
      payload: {
        listingId: listing.external_listing_id,
        listingStatus: "active",
        pricingSummary: {
          price: { value: "49.99", currency: "CAD" },
        },
      },
    });

    const results = await syncService.syncMarketplaceListings("ebay", "sync-payload-state-listing");
    assert.equal(results.length, 1);
    assert.deepEqual(results[0].reconciliation.conflicts, []);

    const channel = database.get(`SELECT * FROM listing_channels WHERE id = ?`, ["sync-payload-state-channel"]);
    const event = database.get(
      `SELECT * FROM listing_channel_events
       WHERE listing_channel_id = ? AND event_type = 'sync'
       ORDER BY rowid DESC LIMIT 1`,
      ["sync-payload-state-channel"],
    );

    assert.equal(channel.status, "active");
    assert.equal(channel.last_sync_at, "2026-06-11T03:00:00.000Z");
    assert.ok(event);
    assert.equal(event.status, "active");
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

test("marketplace sync persists remote update timestamp and price history", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-sync-remote-history-"));
  const dbPath = join(tempDir, "cardvault.db");
  const previousPath = process.env.CARDVAULT_DB_PATH;

  process.env.CARDVAULT_DB_PATH = dbPath;

  const database = await import("../src/server/database.js");
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
      ["sync-remote-history-item", "Mario Lemieux", "Upper Deck", "listed", "available", "listed"],
    );

    database.run(
      `INSERT INTO listings
       (id, card_id, card_name, card_set, platform, listing_title, listing_description, start_price, shipping, status, publish_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        "sync-remote-history-listing",
        "sync-remote-history-item",
        "Mario Lemieux",
        "Upper Deck",
        "ebay",
        "Mario Lemieux card",
        "Remote timestamp and price history test",
        74.99,
        4.99,
        "active",
        "active",
      ],
    );

    database.run(
      `INSERT INTO listing_channels
       (id, listing_id, marketplace, external_listing_id, status, last_sync_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,datetime('now'),datetime('now'))`,
      [
        "sync-remote-history-channel",
        "sync-remote-history-listing",
        "ebay",
        "ebay-remote-history",
        "active",
        new Date().toISOString(),
      ],
    );

    adapter.sync = async (listing) => ({
      marketplace: "ebay",
      syncedAt: "2026-06-11T05:00:00.000Z",
      payload: {
        itemId: listing.external_listing_id,
        listingStatus: "active",
        lastModifiedDate: "2026-06-10T21:15:00.000Z",
        priceHistory: [
          { price: 74.99, changedAt: "2026-06-09T18:00:00.000Z" },
          { price: 72.5, changedAt: "2026-06-10T21:15:00.000Z" },
        ],
        pricingSummary: {
          price: { value: "74.99", currency: "CAD" },
        },
      },
    });

    const results = await syncService.syncMarketplaceListings("ebay", "sync-remote-history-listing");
    assert.equal(results.length, 1);
    assert.equal(results[0].synced.remoteUpdatedAt, "2026-06-10T21:15:00.000Z");
    assert.equal(results[0].synced.priceHistory.length, 2);

    const channel = database.get(`SELECT * FROM listing_channels WHERE id = ?`, ["sync-remote-history-channel"]);
    const priceHistory = JSON.parse(channel.remote_price_history);

    assert.equal(channel.remote_updated_at, "2026-06-10T21:15:00.000Z");
    assert.equal(priceHistory.length, 2);
    assert.equal(priceHistory[1].price, 72.5);
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

test("blocking reconciliation conflicts surface on channel and listing errors", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-sync-conflict-visible-"));
  const dbPath = join(tempDir, "cardvault.db");
  const previousPath = process.env.CARDVAULT_DB_PATH;

  process.env.CARDVAULT_DB_PATH = dbPath;

  const database = await import("../src/server/database.js");
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
      ["sync-visible-conflict-item", "Bobby Orr", "Topps", "listed", "available", "listed"],
    );

    database.run(
      `INSERT INTO listings
       (id, card_id, card_name, card_set, platform, listing_title, listing_description, start_price, shipping, status, publish_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        "sync-visible-conflict-listing",
        "sync-visible-conflict-item",
        "Bobby Orr",
        "Topps",
        "ebay",
        "Bobby Orr card",
        "Visible reconciliation conflict test",
        120,
        4.99,
        "active",
        "active",
      ],
    );

    database.run(
      `INSERT INTO listing_channels
       (id, listing_id, marketplace, external_listing_id, status, last_sync_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,datetime('now'),datetime('now'))`,
      [
        "sync-visible-conflict-channel",
        "sync-visible-conflict-listing",
        "ebay",
        "ebay-local-id",
        "active",
        new Date().toISOString(),
      ],
    );

    adapter.sync = async () => ({
      marketplace: "ebay",
      externalListingId: "ebay-remote-id",
      status: "active",
      syncedAt: "2026-06-11T04:00:00.000Z",
      payload: { price: 120 },
    });

    const results = await syncService.syncMarketplaceListings("ebay", "sync-visible-conflict-listing");
    assert.equal(results.length, 1);
    assert.equal(results[0].reconciliation.hasBlockingConflict, true);

    const channel = database.get(`SELECT * FROM listing_channels WHERE id = ?`, ["sync-visible-conflict-channel"]);
    const listing = database.get(`SELECT * FROM listings WHERE id = ?`, ["sync-visible-conflict-listing"]);

    assert.match(channel.publish_error, /^Sync needs review: Local external id ebay-local-id differs from remote ebay-remote-id/);
    assert.equal(listing.publish_error, channel.publish_error);
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
