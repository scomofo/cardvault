import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { startTestServer } from "./helpers/testServer.js";

const writes = [
  ["POST", "/ebay/selling-policies"], ["PUT", "/ebay/selling-setup"],
  ["POST", "/listings/missing/ebay-check"], ["POST", "/listings/missing/ebay-recover"],
];

test("eBay setup, checking and recovery enforce bearer authorization and object request bodies", async (t) => {
  const token = "test-only-proxy-token";
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-ebay-check-routes-", env: { PROXY_TOKEN: token } });
  for (const [method, path] of writes) {
    const denied = await fetch(`${baseUrl}/api${path}`, { method, headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(denied.status, 401, `${method} ${path} needs authorization`);
    const invalid = await fetch(`${baseUrl}/api${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: "[]" });
    assert.equal(invalid.status, 400, `${method} ${path} rejects an array`);
    assert.match((await invalid.json()).error, /body must be an object/);
  }
  assert.equal((await fetch(`${baseUrl}/api/ebay/selling-setup`)).status, 401);
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const noAccount = await fetch(`${baseUrl}/api/ebay/selling-policies`, { method: "POST", headers, body: "{}" });
  assert.equal(noAccount.status, 409);
  assert.match((await noAccount.json()).error, /Connect eBay/);
  const missing = await fetch(`${baseUrl}/api/listings/missing/ebay-check`, { method: "POST", headers, body: "{}" });
  assert.equal(missing.status, 404);
  const notConfirmed = await fetch(`${baseUrl}/api/listings/missing/ebay-recover`, { method: "POST", headers, body: "{}" });
  assert.equal(notConfirmed.status, 400);
});

test("selling setup GET exposes only safe preferences, never account identity or credentials", async (t) => {
  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-ebay-setup-read-", unsetEnv: ["PROXY_TOKEN"] });
  const db = new Database(dbPath);
  t.after(() => db.close());
  const save = db.prepare("INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  const settings = { ebay_app_id: "private-app", ebay_cert_id: "private-cert", ebay_ru_name: "test-redirect", ebay_access_token: "private-access", ebay_refresh_token: "private-refresh", ebay_sandbox: "true", ebay_token_expires: new Date(Date.now() + 3600000).toISOString() };
  for (const [key, value] of Object.entries(settings)) save.run(key, value);
  const accountKey = createHash("sha256").update(JSON.stringify([settings.ebay_app_id, true, settings.ebay_refresh_token])).digest("hex");
  const config = { fulfillmentPolicyId: "101", paymentPolicyId: "202", returnPolicyId: "303", postalCode: "T5J0N3", sport: "Ice Hockey", manufacturer: "Upper Deck" };
  save.run("ebay_selling_setup", JSON.stringify({ accountKey, config }));
  const response = await fetch(`${baseUrl}/api/ebay/selling-setup`);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result, { connected: true, environment: "sandbox", config });
  const serialized = JSON.stringify(result);
  for (const secret of [accountKey, settings.ebay_app_id, settings.ebay_cert_id, settings.ebay_access_token, settings.ebay_refresh_token]) assert.equal(serialized.includes(secret), false);
  save.run("ebay_refresh_token", "different-private-account");
  const switched = await fetch(`${baseUrl}/api/ebay/selling-setup`);
  assert.equal(switched.status, 200);
  assert.deepEqual(await switched.json(), { connected: true, environment: "sandbox", config: null });
});
