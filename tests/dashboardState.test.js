import test from "node:test";
import assert from "node:assert/strict";

import { loadDashboardState } from "../src/lib/dashboardState.js";

test("loadDashboardState returns dashboard payload objects", async () => {
  const payload = await loadDashboardState({
    get: async () => ({
      kpis: { totalInventoryValue: 125 },
      actionQueue: [{ queue: "ship_now" }],
      performance: { topProfitPlayers: [] },
    }),
  });

  assert.deepEqual(payload, {
    kpis: { totalInventoryValue: 125 },
    actionQueue: [{ queue: "ship_now" }],
    performance: { topProfitPlayers: [] },
  });
});

test("loadDashboardState normalizes non-object payloads to null", async () => {
  assert.equal(await loadDashboardState({ get: async () => null }), null);
  assert.equal(await loadDashboardState({ get: async () => "bad" }), null);
});
