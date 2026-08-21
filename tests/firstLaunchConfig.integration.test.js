import test from "node:test";
import assert from "node:assert/strict";

import { startTestServer } from "./helpers/testServer.js";

test("copied example config supports first-launch API key setup", async (t) => {
  const { baseUrl } = await startTestServer(t, {
    dirPrefix: "cardvault-first-launch-",
    envFileSource: new URL("../.env.example", import.meta.url),
    unsetEnv: ["ANTHROPIC_API_KEY", "PROXY_TOKEN"],
  });

  const initialResponse = await fetch(`${baseUrl}/api/ai/status`);
  assert.equal(initialResponse.status, 200);
  assert.deepEqual(await initialResponse.json(), { configured: false, masked: null });

  const placeholderResponse = await fetch(`${baseUrl}/api/ai/key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "sk-ant-your-key-here" }),
  });
  assert.equal(placeholderResponse.status, 400);

  const keyResponse = await fetch(`${baseUrl}/api/ai/key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "sk-ant-test-first-launch-0123456789" }),
  });
  assert.equal(keyResponse.status, 200);

  const configuredResponse = await fetch(`${baseUrl}/api/ai/status`);
  assert.equal(configuredResponse.status, 200);
  assert.equal((await configuredResponse.json()).configured, true);
});
