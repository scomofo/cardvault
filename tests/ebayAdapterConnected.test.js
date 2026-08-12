import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("eBay adapter uses the live APIs when a connection exists", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-ebay-connected-"));
  const dbPath = join(tempDir, "cardvault.db");
  const previousPath = process.env.CARDVAULT_DB_PATH;

  process.env.CARDVAULT_DB_PATH = dbPath;

  const database = await import("../src/server/database.js");
  const { EbayAdapter } = await import("../src/server/integrations/marketplaces/ebayAdapter.js");

  const db = database.initDB();
  const adapter = new EbayAdapter();
  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  const handlers = { trading: null, inventory: null, offer: null, publish: null, orders: null };

  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    fetchCalls.push({ url: target, options });
    if (target.includes("/ws/api.dll")) return handlers.trading(target, options);
    if (target.includes("/inventory_item/")) return handlers.inventory(target, options);
    if (target.includes("/publish")) return handlers.publish(target, options);
    if (target.includes("/offer")) return handlers.offer(target, options);
    if (target.includes("/order")) return handlers.orders(target, options);
    throw new Error(`Unexpected fetch: ${target}`);
  };

  for (const [key, value] of [
    ["ebay_app_id", "app-1"],
    ["ebay_cert_id", "cert-1"],
    ["ebay_ru_name", "RuName"],
    ["ebay_access_token", "tok-live"],
    ["ebay_token_expires", new Date(Date.now() + 3600_000).toISOString()],
  ]) {
    database.run(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, value],
    );
  }

  function tradingSuccess(itemId) {
    return async () => new Response(`<R><Ack>Success</Ack><ItemID>${itemId}</ItemID></R>`, { status: 200 });
  }

  try {
    assert.equal(adapter.isConnected(), true);
    assert.equal(adapter.getShippingProfile().shippingService, "CA_StandardInternationalFlat");
    assert.equal(adapter.getShippingProfile("US").shippingCost, 3.99);

    await t.test("publish routes auctions through the Trading API", async () => {
      handlers.trading = tradingSuccess("111");
      const result = await adapter.publish({ id: "auction-1", format: "auction", listing_title: "Auction Card" }, {});
      assert.equal(result.status, "active");
      assert.equal(result.externalListingId, "111");
      const call = fetchCalls.at(-1);
      assert.equal(call.options.headers["X-EBAY-API-CALL-NAME"], "AddItem");
    });

    await t.test("publish uses the Inventory API for fixed-price listings", async () => {
      handlers.inventory = async () => new Response("{}", { status: 200 });
      handlers.offer = async () => new Response(JSON.stringify({ offerId: "OF1" }), { status: 200 });
      handlers.publish = async () => new Response(JSON.stringify({ listingId: "L100" }), { status: 200 });

      const result = await adapter.publish({ id: "fixed-1", listing_title: "Fixed Card", start_price: 10 }, {});
      assert.equal(result.externalListingId, "L100");
      assert.ok(fetchCalls.some((call) => call.url.includes("/inventory_item/CV-fixed-1")));
      assert.ok(fetchCalls.some((call) => call.url.includes("/offer/OF1/publish")));
    });

    await t.test("publish falls back to the Trading API when Inventory calls fail", async () => {
      handlers.inventory = async () =>
        new Response(JSON.stringify({ errors: [{ message: "inventory unavailable" }] }), { status: 400 });
      handlers.trading = tradingSuccess("222");

      const result = await adapter.publish({ id: "fixed-2", listing_title: "Fallback Card" }, {});
      assert.equal(result.externalListingId, "222");
      const call = fetchCalls.at(-1);
      assert.equal(call.options.headers["X-EBAY-API-CALL-NAME"], "AddFixedPriceItem");
    });

    await t.test("revise and end target the stored external listing id", async () => {
      handlers.trading = tradingSuccess("333");
      const revised = await adapter.revise({ id: "rev-1", external_listing_id: "EXT9", listing_title: "Rev Card" }, { start_price: 12 });
      assert.equal(revised.status, "revised");
      assert.equal(revised.externalListingId, "EXT9");
      let call = fetchCalls.at(-1);
      assert.equal(call.options.headers["X-EBAY-API-CALL-NAME"], "ReviseItem");
      assert.match(call.options.body, /<ItemID>EXT9<\/ItemID><\/Item>/);

      const before = fetchCalls.length;
      handlers.trading = tradingSuccess("");
      const ended = await adapter.end({ id: "end-1", external_listing_id: "EXT9" });
      assert.equal(ended.status, "ended");
      call = fetchCalls.at(-1);
      assert.equal(call.options.headers["X-EBAY-API-CALL-NAME"], "EndItem");

      const endedWithoutId = await adapter.end({ id: "end-2" });
      assert.equal(endedWithoutId.status, "ended");
      assert.equal(endedWithoutId.externalListingId, undefined);
      assert.equal(fetchCalls.length, before + 1, "no API call without an external id");
    });

    await t.test("sync falls back to local state without an external id", async () => {
      const result = await adapter.sync({ id: "no-ext", platform: "ebay", channel_status: "ended" });
      assert.equal(result.status, "ended");
    });

    await t.test("sync pages through orders and reports unsold listings as active", async () => {
      const pages = [];
      handlers.orders = async (url) => {
        const params = new URL(url).searchParams;
        pages.push(Number(params.get("offset")));
        if (pages.length === 1) {
          return new Response(
            JSON.stringify({
              orders: Array.from({ length: 200 }, (_, i) => ({
                orderId: `other-${i}`,
                lineItems: [{ sku: "CV-someone-else" }],
              })),
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ orders: [] }), { status: 200 });
      };

      const listing = { id: "l1", platform: "ebay", external_listing_id: "EXT1", created_at: "2026-01-01T00:00:00.000Z" };
      const result = await adapter.sync(listing);
      assert.equal(result.status, "active");
      assert.deepEqual(pages, [0, 200], "a full page triggers a second request");
    });

    await t.test("sync marks listings sold when a matching order line item exists", async () => {
      handlers.orders = async (url) => {
        const filter = new URL(url).searchParams.get("filter");
        assert.match(filter, /^creationdate:\[2026-01-01T00:00:00\.000Z\.\.\]$/);
        return new Response(
          JSON.stringify({
            orders: [
              {
                orderId: "ORDER-9",
                buyer: { username: "buyer_9" },
                pricingSummary: { total: { value: "80" } },
                lineItems: [{ lineItemId: "li-1", sku: "CV-l1", total: { value: "75" } }],
              },
            ],
          }),
          { status: 200 },
        );
      };

      const listing = { id: "l1", platform: "ebay", external_listing_id: "EXT1", created_at: "2026-01-01T00:00:00.000Z" };
      const result = await adapter.sync(listing);
      assert.equal(result.status, "sold");
      assert.equal(result.payload.externalOrderId, "ORDER-9");
      assert.equal(result.payload.buyerHandle, "buyer_9");
      assert.equal(result.payload.salePrice, 75);
      assert.equal(result.payload.sku, "CV-l1");
    });

    await t.test("mapForExport emits the eBay CSV column shape", () => {
      const fixed = adapter.mapForExport({ listing_title: "Fixed", start_price: 5 });
      assert.equal(fixed.Action, "Add");
      assert.equal(fixed.Format, "FixedPrice");
      assert.equal(fixed.Title, "Fixed");
      assert.equal(fixed.StartPrice, 5);

      const auction = adapter.mapForExport({ listing_title: "Auction", format: "auction" });
      assert.equal(auction.Format, "Auction");
    });
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
    if (previousPath === undefined) {
      delete process.env.CARDVAULT_DB_PATH;
    } else {
      process.env.CARDVAULT_DB_PATH = previousPath;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});
