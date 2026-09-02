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
