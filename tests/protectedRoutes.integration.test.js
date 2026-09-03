import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer.js";

test("protected config routes require bearer auth when PROXY_TOKEN is configured", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-protected-routes-", env: { PROXY_TOKEN: "test-token" } });

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

  const unauthorizedItemsResponse = await fetch(`${baseUrl}/api/items`);
  assert.equal(unauthorizedItemsResponse.status, 401);

  const authorizedItemsResponse = await fetch(`${baseUrl}/api/items`, {
    headers: { Authorization: "Bearer test-token" },
  });
  assert.equal(authorizedItemsResponse.status, 200);

  const unauthorizedCreateResponse = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "proxy-token-protected", name: "Blocked" }),
  });
  assert.equal(unauthorizedCreateResponse.status, 401);
});
