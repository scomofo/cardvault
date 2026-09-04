import test from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { startTestServer } from "./helpers/testServer.js";

// fetch() silently drops a caller-supplied Host header (it is a forbidden
// request header), so the rebinding cases go through node:http directly.
function rawRequest(baseUrl, { method = "GET", path, headers = {}, body = null }) {
  const url = new URL(path, baseUrl);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: url.hostname, port: url.port, method, path: url.pathname, headers },
      (res) => {
        let text = "";
        res.on("data", (chunk) => { text += chunk; });
        res.on("end", () => resolve({ status: res.statusCode, json: () => JSON.parse(text) }));
      },
    );
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

test("API rejects foreign Host and Origin headers when no bearer token is configured", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-host-origin-", unsetEnv: ["PROXY_TOKEN"] });

  const rebound = await rawRequest(baseUrl, { path: "/api/settings", headers: { Host: "attacker.example.com" } });
  assert.equal(rebound.status, 403);
  assert.match(rebound.json().error, /host/i);

  const crossSiteSync = await fetch(`${baseUrl}/api/marketplaces/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://attacker.example.com" },
    body: JSON.stringify({ marketplace: "ebay" }),
  });
  assert.equal(crossSiteSync.status, 403);
  assert.match((await crossSiteSync.json()).error, /origin/i);

  const appSync = await fetch(`${baseUrl}/api/marketplaces/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:3000" },
    body: JSON.stringify({ marketplace: "ebay" }),
  });
  assert.equal(appSync.status, 200);
  assert.deepEqual(await appSync.json(), []);

  const loopbackRead = await fetch(`${baseUrl}/api/settings`);
  assert.equal(loopbackRead.status, 200);
});

test("marketplace and shipping mutation routes require a trusted caller", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-mutation-auth-", env: { PROXY_TOKEN: "test-token" } });

  for (const path of ["/api/marketplaces/publish", "/api/marketplaces/sync", "/api/marketplaces/handoff/submit", "/api/automation/shipping/order-1"]) {
    const unauthorized = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketplace: "ebay", listingId: "missing" }),
    });
    assert.equal(unauthorized.status, 401, `${path} must require the bearer token`);
  }

  // With the token the Host check is skipped: the token is the boundary.
  const authorized = await rawRequest(baseUrl, {
    method: "POST",
    path: "/api/marketplaces/sync",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test-token", Host: "api.example.com" },
    body: JSON.stringify({ marketplace: "ebay" }),
  });
  assert.equal(authorized.status, 200);
  assert.deepEqual(authorized.json(), []);
});
