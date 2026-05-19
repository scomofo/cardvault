import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { canGrantRendererPermission } from "../src/electron/permissions.js";

test("Electron renderer runs with sandbox enabled", async () => {
  const main = await readFile(new URL("../src/electron/main.js", import.meta.url), "utf8");

  assert.match(main, /sandbox:\s*true/);
});

test("Electron permission grants are limited to CardVault app origins", () => {
  const allowedOrigins = new Set([
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3000",
  ]);

  assert.equal(canGrantRendererPermission({
    permission: "media",
    requestingUrl: "http://127.0.0.1:3001/camera",
    allowedOrigins,
  }), true);
  assert.equal(canGrantRendererPermission({
    permission: "clipboard-read",
    requestingUrl: "http://127.0.0.1:3000",
    allowedOrigins,
  }), true);
  assert.equal(canGrantRendererPermission({
    permission: "media",
    requestingUrl: "https://example.com",
    allowedOrigins,
  }), false);
  assert.equal(canGrantRendererPermission({
    permission: "notifications",
    requestingUrl: "http://127.0.0.1:3001",
    allowedOrigins,
  }), false);
});
