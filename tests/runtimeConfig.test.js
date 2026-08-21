import test from "node:test";
import assert from "node:assert/strict";

import {
  getAnthropicApiKey,
  getProxyToken,
  normalizeAnthropicApiKey,
} from "../src/server/runtimeConfig.js";

test("runtime config treats bundled placeholders as unset", () => {
  assert.equal(getAnthropicApiKey({ ANTHROPIC_API_KEY: "sk-ant-your-key-here" }), "");
  assert.equal(getProxyToken({ PROXY_TOKEN: "change-me" }), "");
  assert.equal(normalizeAnthropicApiKey("sk-ant-your-key-here"), "");
});

test("runtime config trims and preserves configured credentials", () => {
  assert.equal(getAnthropicApiKey({ ANTHROPIC_API_KEY: "  sk-ant-real-key  " }), "sk-ant-real-key");
  assert.equal(getProxyToken({ PROXY_TOKEN: "  strong-token  " }), "strong-token");
});
