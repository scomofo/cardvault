import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("eBay auth, client, and browse layers", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-ebay-client-"));
  const dbPath = join(tempDir, "cardvault.db");
  const previousPath = process.env.CARDVAULT_DB_PATH;

  process.env.CARDVAULT_DB_PATH = dbPath;

  const database = await import("../src/server/database.js");
  const auth = await import("../src/server/integrations/ebay/ebayAuth.js");
  const client = await import("../src/server/integrations/ebay/ebayClient.js");
  const browse = await import("../src/server/integrations/ebay/ebayBrowse.js");

  const db = database.initDB();
  const originalFetch = globalThis.fetch;
  const calls = [];

  function saveSetting(key, value) {
    database.run(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, value],
    );
  }

  function setting(key) {
    return database.get("SELECT value FROM settings WHERE key = ?", [key])?.value || null;
  }

  function stubResponse(body, init) {
    globalThis.fetch = async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(body, init);
    };
  }

  const futureExpiry = () => new Date(Date.now() + 3600_000).toISOString();

  try {
    await t.test("credentials, auth url, status, and tokens fail closed when unconfigured", async () => {
      assert.equal(auth.getEbayCredentials(), null);
      assert.throws(() => auth.getAuthUrl(), /eBay credentials not configured/);
      const status = auth.getEbayStatus();
      assert.equal(status.configured, false);
      assert.equal(status.connected, false);
      assert.equal(status.sandbox, true);
      await assert.rejects(() => auth.exchangeCodeForToken("code"), /eBay credentials not configured/);
      await assert.rejects(() => auth.getAccessToken(), /eBay not authorized - connect via Settings/);
      await assert.rejects(() => browse.searchBrowse("gretzky"), /eBay credentials not configured/);
      assert.deepEqual(await browse.searchBrowse("   "), { total: 0, items: [] });
    });

    await t.test("legacy redirect setting doubles as RuName only when not a URL", async () => {
      saveSetting("ebay_app_id", "app-1");
      saveSetting("ebay_cert_id", "cert-1");

      saveSetting("ebay_redirect_uri", "https://example.com/callback");
      assert.equal(auth.getEbayCredentials(), null);

      saveSetting("ebay_redirect_uri", "Legacy-RuName");
      assert.equal(auth.getEbayCredentials().ruName, "Legacy-RuName");

      saveSetting("ebay_ru_name", "Real-RuName");
      const creds = auth.getEbayCredentials();
      assert.equal(creds.ruName, "Real-RuName");
      assert.equal(creds.sandbox, true);
      assert.equal(creds.devId, "");
      assert.equal(creds.callbackUrl, "http://localhost:3000/api/ebay/callback");
    });

    await t.test("getAuthUrl targets sandbox or production with request state", () => {
      const sandboxUrl = new URL(auth.getAuthUrl({ state: "st-1" }));
      assert.equal(sandboxUrl.origin, "https://auth.sandbox.ebay.com");
      assert.equal(sandboxUrl.searchParams.get("client_id"), "app-1");
      assert.equal(sandboxUrl.searchParams.get("redirect_uri"), "Real-RuName");
      assert.equal(sandboxUrl.searchParams.get("state"), "st-1");

      saveSetting("ebay_sandbox", "false");
      assert.equal(new URL(auth.getAuthUrl()).origin, "https://auth.ebay.com");
      saveSetting("ebay_sandbox", "true");
    });

    await t.test("exchangeCodeForToken persists tokens and reports failures", async () => {
      calls.length = 0;
      stubResponse(JSON.stringify({ access_token: "tok-1", refresh_token: "ref-1", expires_in: 7200 }), { status: 200 });

      const tokens = await auth.exchangeCodeForToken("code-1");
      assert.equal(tokens.accessToken, "tok-1");
      assert.equal(tokens.refreshToken, "ref-1");
      assert.equal(calls[0].url, "https://api.sandbox.ebay.com/identity/v1/oauth2/token");
      assert.match(calls[0].options.headers.Authorization, /^Basic /);
      assert.equal(setting("ebay_access_token"), "tok-1");
      assert.equal(setting("ebay_refresh_token"), "ref-1");

      stubResponse("denied", { status: 400 });
      await assert.rejects(() => auth.exchangeCodeForToken("code-2"), /Token exchange failed: denied/);
    });

    await t.test("getAccessToken reuses valid tokens and refreshes expired ones", async () => {
      saveSetting("ebay_token_expires", futureExpiry());
      globalThis.fetch = async () => {
        throw new Error("fetch should not be called for a valid token");
      };
      assert.equal(await auth.getAccessToken(), "tok-1");

      saveSetting("ebay_token_expires", new Date(Date.now() - 1000).toISOString());
      stubResponse(JSON.stringify({ access_token: "tok-2", expires_in: 7200 }), { status: 200 });
      assert.equal(await auth.getAccessToken(), "tok-2");
      assert.equal(setting("ebay_access_token"), "tok-2");

      saveSetting("ebay_token_expires", new Date(Date.now() - 1000).toISOString());
      stubResponse("nope", { status: 401 });
      await assert.rejects(() => auth.getAccessToken(), /Token refresh failed - re-authorize via Settings/);

      saveSetting("ebay_access_token", "tok-live");
      saveSetting("ebay_token_expires", futureExpiry());
      const status = auth.getEbayStatus();
      assert.equal(status.configured, true);
      assert.equal(status.connected, true);
    });

    await t.test("tradingApiCall builds XML requests and parses acknowledgements", async () => {
      calls.length = 0;
      stubResponse("<AddItemResponse><Ack>Success</Ack><ItemID>555</ItemID></AddItemResponse>", { status: 200 });
      assert.equal(await client.addItem("<Title>x</Title>"), "555");
      assert.equal(calls[0].url, "https://api.sandbox.ebay.com/ws/api.dll");
      assert.equal(calls[0].options.headers["X-EBAY-API-CALL-NAME"], "AddItem");
      assert.match(calls[0].options.body, /<eBayAuthToken>tok-live<\/eBayAuthToken>/);
      assert.match(calls[0].options.body, /<AddItemRequest xmlns=/);

      stubResponse("<R><Ack>Success</Ack></R>", { status: 200 });
      assert.equal(await client.addFixedPriceItem("<Title>x</Title>"), null);

      stubResponse("<R><Ack>Success</Ack><ItemID>777</ItemID></R>", { status: 200 });
      assert.equal(await client.reviseItem("<ItemID>777</ItemID>"), "777");

      calls.length = 0;
      stubResponse("<R><Ack>Success</Ack></R>", { status: 200 });
      await client.endItem("888");
      assert.match(calls[0].options.body, /<ItemID>888<\/ItemID><EndingReason>NotAvailable<\/EndingReason>/);

      stubResponse("<R><Ack>Failure</Ack><ShortMessage>Bad title</ShortMessage></R>", { status: 200 });
      await assert.rejects(() => client.tradingApiCall("AddItem", ""), /eBay AddItem failed: Bad title/);
    });

    await t.test("inventoryApiCall handles success, no-content, and error responses", async () => {
      calls.length = 0;
      stubResponse(JSON.stringify({ sku: "sku 1" }), { status: 200 });
      const created = await client.createInventoryItem("sku 1", { product: {} });
      assert.equal(created.sku, "sku 1");
      assert.equal(calls[0].url, "https://api.sandbox.ebay.com/sell/inventory/v1/inventory_item/sku%201");
      assert.equal(calls[0].options.method, "PUT");
      assert.equal(calls[0].options.body, JSON.stringify({ product: {} }));

      stubResponse(null, { status: 204 });
      assert.deepEqual(await client.createOffer({ sku: "sku-1" }), {});

      calls.length = 0;
      stubResponse(JSON.stringify({ offerId: "o-1" }), { status: 200 });
      await client.publishOffer("o 1");
      assert.equal(calls[0].url, "https://api.sandbox.ebay.com/sell/inventory/v1/offer/o%201/publish");

      calls.length = 0;
      stubResponse(JSON.stringify({}), { status: 200 });
      await client.inventoryApiCall("GET", "/offer", { should: "be ignored" });
      assert.equal(calls[0].options.body, undefined);

      stubResponse(JSON.stringify({ errors: [{ message: "bad sku" }] }), { status: 400 });
      await assert.rejects(() => client.createOffer({}), /eBay Inventory API error: bad sku/);

      stubResponse("not json", { status: 500, statusText: "Internal Server Error" });
      await assert.rejects(() => client.createOffer({}), /eBay Inventory API error: Internal Server Error/);
    });

    await t.test("fulfillmentApiCall and getOrders build order queries", async () => {
      calls.length = 0;
      stubResponse(JSON.stringify({ orders: [{ orderId: "ord-1" }], total: 1 }), { status: 200 });
      const orders = await client.getOrders({ limit: 10, offset: 5, filter: "creationdate:[2026-01-01]" });
      assert.equal(orders.orders[0].orderId, "ord-1");
      const url = new URL(calls[0].url);
      assert.equal(url.origin, "https://api.sandbox.ebay.com");
      assert.equal(url.pathname, "/sell/fulfillment/v1/order");
      assert.equal(url.searchParams.get("limit"), "10");
      assert.equal(url.searchParams.get("offset"), "5");
      assert.equal(url.searchParams.get("filter"), "creationdate:[2026-01-01]");

      stubResponse(JSON.stringify({ errors: [{ message: "no access" }] }), { status: 403 });
      await assert.rejects(() => client.getOrders(), /eBay Fulfillment API error: no access/);
    });

    await t.test("searchBrowse maps item summaries through an injected fetcher", async () => {
      const requests = [];
      const fetcher = async (url, options) => {
        requests.push({ url, options });
        return new Response(
          JSON.stringify({
            total: "7",
            itemSummaries: [
              { title: "Card A", price: { value: "12.5", currency: "USD" }, itemWebUrl: "https://ebay.example/a" },
              { title: "Card B" },
            ],
          }),
          { status: 200 },
        );
      };

      const result = await browse.searchBrowse("gretzky rookie", { limit: 3, fetcher });
      assert.equal(result.total, 7);
      assert.deepEqual(result.items[0], { title: "Card A", price: 12.5, currency: "USD", url: "https://ebay.example/a" });
      assert.deepEqual(result.items[1], { title: "Card B", price: null, currency: null, url: null });
      const url = new URL(requests[0].url);
      assert.equal(url.searchParams.get("q"), "gretzky rookie");
      assert.equal(url.searchParams.get("limit"), "3");
      assert.equal(requests[0].options.headers.Authorization, "Bearer tok-live");

      const failing = async () => new Response("{}", { status: 500 });
      await assert.rejects(() => browse.searchBrowse("query", { fetcher: failing }), /eBay Browse error 500/);

      const empty = async () => new Response(JSON.stringify({}), { status: 200 });
      assert.deepEqual(await browse.searchBrowse("query", { fetcher: empty }), { total: 0, items: [] });
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
