import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

async function waitForServer(baseUrl, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/settings`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

test("dashboard exposes KPIs and richer action queue categories", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-dashboard-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 3800 + Math.floor(Math.random() * 200);
  const baseUrl = `http://127.0.0.1:${port}`;

  const server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CARDVAULT_DB_PATH: dbPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  t.after(async () => {
    if (!server.killed) {
      server.kill("SIGTERM");
    }
    await new Promise((resolve) => server.once("exit", resolve));
    await rm(tempDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl);

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
  assert.ok(Array.isArray(dashboard.performance.topProfitPlayers));
});
