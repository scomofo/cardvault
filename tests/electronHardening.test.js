import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { canGrantRendererPermission } from "../src/electron/permissions.js";
import { isAllowedExternalUrl, isAllowedNavigation } from "../src/electron/navigation.js";

test("Electron renderer runs with sandbox enabled", async () => {
  const main = await readFile(new URL("../src/electron/main.js", import.meta.url), "utf8");

  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /webContents\.on\("will-navigate"/);
});

test("isAllowedNavigation only allows the app's own origin", () => {
  const allowedOrigins = new Set(["http://127.0.0.1:3001"]);

  assert.equal(isAllowedNavigation({ targetUrl: "http://127.0.0.1:3001/#settings", allowedOrigins }), true);
  assert.equal(isAllowedNavigation({ targetUrl: "https://auth.ebay.com/oauth2/authorize", allowedOrigins }), false);
  assert.equal(isAllowedNavigation({ targetUrl: "file:///etc/passwd", allowedOrigins }), false);
  assert.equal(isAllowedNavigation({ targetUrl: "not a url", allowedOrigins }), false);
});

test("isAllowedExternalUrl restricts shell.openExternal to safe schemes and loopback http", () => {
  assert.equal(isAllowedExternalUrl("https://developer.ebay.com"), true);
  assert.equal(isAllowedExternalUrl("mailto:support@example.com"), true);
  assert.equal(isAllowedExternalUrl("http://127.0.0.1:3001/api/ebay/auth"), true);
  assert.equal(isAllowedExternalUrl("http://localhost:3001/api/ebay/auth"), true);

  // A plain http: link to a real host would send credentials in the clear.
  assert.equal(isAllowedExternalUrl("http://example.com"), false);
  assert.equal(isAllowedExternalUrl("file:///Users/x/secret.txt"), false);
  assert.equal(isAllowedExternalUrl("javascript:alert(1)"), false);
  assert.equal(isAllowedExternalUrl("smb://attacker.example/share"), false);
  assert.equal(isAllowedExternalUrl("not a url"), false);
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
