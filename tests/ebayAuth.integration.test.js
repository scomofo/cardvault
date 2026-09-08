import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer.js";

test("eBay auth routes require RuName and enforce OAuth state", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-ebay-auth-" });

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

test("eBay environment can be switched without re-entering credentials", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-ebay-env-" });
  const post = (path, body) => fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const beforeCreds = await post("/api/ebay/environment", { sandbox: false });
  assert.equal(beforeCreds.status, 409);

  const saveCreds = await post("/api/ebay/credentials", {
    appId: "app-id",
    certId: "cert-id",
    sandbox: true,
    ruName: "CardVaultRuName",
    callbackUrl: `${baseUrl}/api/ebay/callback`,
  });
  assert.equal(saveCreds.status, 200);

  const invalid = await post("/api/ebay/environment", { sandbox: "maybe" });
  assert.equal(invalid.status, 400);

  const toProduction = await post("/api/ebay/environment", { sandbox: false });
  assert.equal(toProduction.status, 200);
  assert.deepEqual(await toProduction.json(), { saved: true, sandbox: false });

  const statusResponse = await fetch(`${baseUrl}/api/ebay/status`);
  assert.equal(statusResponse.status, 200);
  const status = await statusResponse.json();
  assert.equal(status.configured, true);
  assert.equal(status.sandbox, false);
  assert.equal(status.connected, false);

  const authResponse = await fetch(`${baseUrl}/api/ebay/auth`, { redirect: "manual" });
  assert.equal(authResponse.status, 302);
  const authUrl = new URL(authResponse.headers.get("location"));
  assert.equal(authUrl.hostname, "auth.ebay.com");
});
