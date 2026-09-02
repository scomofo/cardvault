import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer.js";

test("dashboard exposes KPIs and richer action queue categories", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-dashboard-" });

  await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "dash-item",
      name: "Connor McDavid",
      set: "Upper Deck",
      number: "201",
      listedOn: [],
      priceHistory: [],
      marketPrice: 125,
      suggestedListingPrice: 129.99,
      acquisitionDate: "2025-08-01T00:00:00.000Z",
      gradingCandidate: 1,
    }),
  });

  const dashboardResponse = await fetch(`${baseUrl}/api/dashboard`);
  assert.equal(dashboardResponse.status, 200);
  const dashboard = await dashboardResponse.json();
  assert.ok(dashboard.kpis.totalInventoryValue >= 125);
  assert.ok(Array.isArray(dashboard.actionQueue));
  assert.ok(dashboard.actionQueue.some((entry) => entry.queue === "list_now"));
  assert.ok(dashboard.actionQueue.some((entry) => entry.queue === "high_value_unlisted"));
  assert.ok(dashboard.actionQueue.every((entry) => Object.prototype.hasOwnProperty.call(entry, "itemId")));
  assert.ok(dashboard.actionQueue.every((entry) => Object.prototype.hasOwnProperty.call(entry, "itemName")));
  assert.ok(Array.isArray(dashboard.performance.topProfitPlayers));
});
