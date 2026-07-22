import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer.js";

async function postJson(baseUrl, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function putJson(baseUrl, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("trades, watchlist, gradings, and purchases creates are idempotent upserts", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-upsert-" });

  const cases = [
    {
      path: "/api/trades",
      create: { id: "trade-1", partner: "Alex", gave: "Crosby", received: "McDavid" },
      retry: { id: "trade-1", partner: "Alex R.", gave: "Crosby", received: "McDavid" },
      changedField: "partner",
      changedValue: "Alex R.",
    },
    {
      path: "/api/watchlist",
      create: { id: "watch-1", name: "Bedard YG", targetPrice: 100 },
      retry: { id: "watch-1", name: "Bedard Young Guns", targetPrice: 90 },
      changedField: "name",
      changedValue: "Bedard Young Guns",
    },
    {
      path: "/api/gradings",
      create: { id: "grade-1", cardName: "Gretzky RC", company: "PSA" },
      retry: { id: "grade-1", cardName: "Gretzky Rookie", company: "PSA" },
      changedField: "cardName",
      changedValue: "Gretzky Rookie",
    },
    {
      path: "/api/purchases",
      create: { id: "purchase-1", name: "Hobby Box", price: 150 },
      retry: { id: "purchase-1", name: "Hobby Box 2024", price: 140 },
      changedField: "name",
      changedValue: "Hobby Box 2024",
    },
  ];

  for (const testCase of cases) {
    assert.equal((await postJson(baseUrl, testCase.path, testCase.create)).status, 201, `${testCase.path} create`);
    const retryResponse = await postJson(baseUrl, testCase.path, testCase.retry);
    assert.equal(retryResponse.status, 200, `${testCase.path} retry`);
    const updated = await retryResponse.json();
    assert.equal(updated[testCase.changedField], testCase.changedValue, `${testCase.path} updated field`);

    const listResponse = await fetch(`${baseUrl}${testCase.path}`);
    const rows = await listResponse.json();
    assert.equal(
      rows.filter((row) => row.id === testCase.create.id).length,
      1,
      `${testCase.path} single row`,
    );
  }
});

test("sales creates are idempotent and retries keep sold-state side effects intact", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-upsert-" });

  assert.equal(
    (
      await postJson(baseUrl, "/api/items", {
        id: "sale-item",
        name: "Wayne Gretzky",
        listedOn: [],
        priceHistory: [],
      })
    ).status,
    201,
  );

  assert.equal(
    (
      await postJson(baseUrl, "/api/sales", {
        id: "sale-1",
        cardId: "sale-item",
        cardName: "Wayne Gretzky",
        salePrice: 100,
        fees: 10,
        platform: "ebay",
        date: "2026-07-01T00:00:00.000Z",
      })
    ).status,
    201,
  );

  const retryResponse = await postJson(baseUrl, "/api/sales", {
    id: "sale-1",
    cardId: "sale-item",
    cardName: "Wayne Gretzky",
    salePrice: 100,
    fees: 12,
    platform: "ebay",
    date: "2026-07-01T00:00:00.000Z",
  });
  assert.equal(retryResponse.status, 200);
  const updated = await retryResponse.json();
  assert.equal(updated.fees, 12);

  const sales = await (await fetch(`${baseUrl}/api/sales`)).json();
  assert.equal(sales.filter((sale) => sale.id === "sale-1").length, 1);

  // The create's sold side effect on the item must survive the retry.
  const item = await (await fetch(`${baseUrl}/api/items/sale-item`)).json();
  assert.equal(item.status, "sold");
});

test("order create retries cannot revert automation-set fulfillment states", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-upsert-" });

  assert.equal(
    (
      await postJson(baseUrl, "/api/orders", {
        id: "order-1",
        platform: "ebay",
        salePrice: 75,
        fulfillmentStatus: "pending",
      })
    ).status,
    201,
  );

  // Automation marks the order shipped.
  assert.equal(
    (
      await putJson(baseUrl, "/api/orders/order-1", { fulfillmentStatus: "shipped" })
    ).status,
    200,
  );

  // A stale client create-retry with the original pending state.
  const retryResponse = await postJson(baseUrl, "/api/orders", {
    id: "order-1",
    platform: "ebay",
    salePrice: 75,
    fulfillmentStatus: "pending",
  });
  assert.equal(retryResponse.status, 200);
  const updated = await retryResponse.json();
  assert.equal(updated.fulfillmentStatus, "shipped");

  const orders = await (await fetch(`${baseUrl}/api/orders`)).json();
  assert.equal(orders.filter((order) => order.id === "order-1").length, 1);
});
