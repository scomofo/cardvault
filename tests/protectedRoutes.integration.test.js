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

test("protected config routes require bearer auth when PROXY_TOKEN is configured", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-protected-routes-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 3600 + Math.floor(Math.random() * 200);
  const baseUrl = `http://127.0.0.1:${port}`;

  const server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CARDVAULT_DB_PATH: dbPath,
      PROXY_TOKEN: "test-token",
    },
    stdio: "ignore",
  });

  t.after(async () => {
    if (!server.killed) {
      server.kill("SIGTERM");
    }
    await new Promise((resolve) => server.once("exit", resolve));
    await rm(tempDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl);

  const unauthorizedKeyResponse = await fetch(`${baseUrl}/api/ai/key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "sk-ant-test-key" }),
  });
  assert.equal(unauthorizedKeyResponse.status, 401);

  const authorizedKeyResponse = await fetch(`${baseUrl}/api/ai/key`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
    },
    body: JSON.stringify({ key: "sk-ant-test-key" }),
  });
  assert.equal(authorizedKeyResponse.status, 200);

  const unauthorizedSettingsResponse = await fetch(`${baseUrl}/api/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userName: "Blocked" }),
  });
  assert.equal(unauthorizedSettingsResponse.status, 401);

  const authorizedSettingsResponse = await fetch(`${baseUrl}/api/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
    },
    body: JSON.stringify({ userName: "Allowed" }),
  });
  assert.equal(authorizedSettingsResponse.status, 200);
});
