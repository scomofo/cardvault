import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { createServer } from "node:http";
import { startTestServer } from "./helpers/testServer.js";

async function post(baseUrl, path, body = {}) {
  return fetch(`${baseUrl}/api${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
async function orderFixture(baseUrl, id, paymentStatus = "paid") {
  assert.equal((await post(baseUrl, "/items", { id: `item-${id}`, name: "Safety fixture", storageLocation: "Box 2", listedOn: [], priceHistory: [] })).status, 201);
  assert.equal((await post(baseUrl, "/orders", { id, itemId: `item-${id}`, platform: "ebay", salePrice: 60, paymentStatus, fulfillmentStatus: "pending", destinationCountry: "CA" })).status, 201);
}

test("shipping quotes remain pending; physical dispatch requires confirmation and is idempotent", async (t) => {
  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-dispatch-safety-" });
  await orderFixture(baseUrl, "quote-order");
  let response = await post(baseUrl, "/automation/shipping/quote-order");
  assert.equal(response.status, 200);
  const planned = await response.json();
  assert.equal(planned.label_status, "pending");
  for (const key of ["tracking_number", "label_url", "shipped_at", "purchased_at"]) assert.equal(planned[key], null);
  assert.equal((await post(baseUrl, "/orders/quote-order/dispatch")).status, 409);
  response = await post(baseUrl, "/orders/quote-order/dispatch", { confirmed: true, shippingCost: 2.5, carrier: "Canada Post" });
  assert.equal(response.status, 200);
  const dispatched = await response.json();
  assert.equal(dispatched.status, "shipped");
  assert.ok(dispatched.shipped_at);
  assert.equal(dispatched.tracking_number, null, "untracked shipment remains untracked");
  assert.equal(dispatched.label_url, null);
  const repeat = await post(baseUrl, "/orders/quote-order/dispatch", { confirmed: true });
  assert.equal(repeat.status, 200);
  assert.equal((await repeat.json()).id, dispatched.id);
  const db = new Database(dbPath);
  t.after(() => db.close());
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM shipments WHERE order_id = ?").get("quote-order").n, 1);
  const orders = await (await fetch(`${baseUrl}/api/orders`)).json();
  assert.equal(orders.find((o) => o.id === "quote-order").storageLocation, "Box 2");

  await orderFixture(baseUrl, "unpaid-order", "pending");
  assert.equal((await post(baseUrl, "/orders/unpaid-order/dispatch", { confirmed: true })).status, 409);
  assert.notEqual((await post(baseUrl, "/automation/shipping/unpaid-order")).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM shipments WHERE order_id = ?").get("unpaid-order").n, 0);
});

test("overlapping shipping requests purchase once and ambiguous responses cannot silently retry", { timeout: 10000 }, async (t) => {
  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-label-race-" });
  let hits = 0, release, arrived;
  const received = new Promise((resolve) => { arrived = resolve; });
  const carrier = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      hits++;
      release = () => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ labelStatus: "purchased", trackingNumber: "REAL-123" })); };
      arrived();
    });
  });
  await new Promise((resolve) => carrier.listen(0, "127.0.0.1", resolve));
  t.after(() => { carrier.closeAllConnections(); carrier.close(); });
  const db = new Database(dbPath);
  t.after(() => db.close());
  db.prepare("INSERT INTO shipping_provider_connections (id, provider, auth_status, metadata) VALUES (?,?,?,?)").run("test-carrier", "Canada Post", "configured", JSON.stringify({
    providerClient: "generic_http",
    labelPurchaseUrl: `http://127.0.0.1:${carrier.address().port}/labels`,
    rates: [{ countries: ["CA"], service: "Test mail", cost: 6, tracking: true }],
  }));
  await orderFixture(baseUrl, "race-order");
  const first = post(baseUrl, "/automation/shipping/race-order");
  await received;
  const overlapping = await post(baseUrl, "/automation/shipping/race-order", { retry: true, confirmNoExistingLabel: true });
  assert.equal(overlapping.status, 200);
  assert.equal((await overlapping.json()).label_status, "purchasing");
  assert.equal(hits, 1);
  release();
  const result = await (await first).json();
  assert.equal(result.label_status, "purchase_unknown", "tracking without a provider label is not a purchased label");
  assert.equal(result.label_url, null);
  assert.equal(result.shipped_at, null);
  await post(baseUrl, "/automation/shipping/race-order", { retry: true });
  assert.equal(hits, 1, "retry flag without explicit review cannot buy twice");
  assert.equal((await post(baseUrl, "/orders/race-order/dispatch", { confirmed: true })).status, 409);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM shipments WHERE order_id = ?").get("race-order").n, 1);
});
