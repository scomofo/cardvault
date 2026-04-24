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

test("eBay auth routes require RuName and enforce OAuth state", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-ebay-auth-"));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = 3800 + Math.floor(Math.random() * 200);
  const baseUrl = `http://127.0.0.1:${port}`;

  const server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CARDVAULT_DB_PATH: dbPath,
      EBAY_CALLBACK_URL: `${baseUrl}/api/ebay/callback`,
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

  const invalidCredsResponse = await fetch(`${baseUrl}/api/ebay/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appId: "app-id",
      certId: "cert-id",
      sandbox: true,
      ruName: `${baseUrl}/api/ebay/callback`,
    }),
  });
  assert.equal(invalidCredsResponse.status, 400);
  const invalidPayload = await invalidCredsResponse.json();
  assert.match(invalidPayload.error, /RuName/i);

  const saveCredsResponse = await fetch(`${baseUrl}/api/ebay/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appId: "app-id",
      certId: "cert-id",
      sandbox: true,
      ruName: "CardVaultSandboxRuName",
      callbackUrl: `${baseUrl}/api/ebay/callback`,
    }),
  });
  assert.equal(saveCredsResponse.status, 200);

  const authResponse = await fetch(`${baseUrl}/api/ebay/auth`, {
    redirect: "manual",
  });
  assert.equal(authResponse.status, 302);

  const authLocation = authResponse.headers.get("location");
  assert.ok(authLocation);
  const authUrl = new URL(authLocation);
  assert.equal(authUrl.searchParams.get("redirect_uri"), "CardVaultSandboxRuName");
  assert.ok(authUrl.searchParams.get("state"));

  const callbackResponse = await fetch(`${baseUrl}/api/ebay/callback?code=test-code`, {
    redirect: "manual",
  });
  assert.equal(callbackResponse.status, 400);
  const callbackPayload = await callbackResponse.json();
  assert.match(callbackPayload.error, /state/i);
});
