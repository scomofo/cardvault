import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  validateOutboundUrlSyntax,
  assertPublicOutboundUrl,
  fetchPublic,
} from "../src/server/outboundUrlGuard.js";

test("validateOutboundUrlSyntax rejects malformed URLs and non-http(s) protocols", () => {
  assert.throws(() => validateOutboundUrlSyntax("not a url", "test"), /URL is invalid/);
  assert.throws(() => validateOutboundUrlSyntax("ftp://example.com/", "test"), /must use http or https/);
});

test("validateOutboundUrlSyntax rejects loopback, private, link-local, and unspecified IPv4 literals", () => {
  for (const host of ["127.0.0.1", "10.0.0.5", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0"]) {
    assert.throws(
      () => validateOutboundUrlSyntax(`http://${host}/`, "test"),
      /must not target a local or private address/,
      `expected ${host} to be rejected`,
    );
  }
});

test("validateOutboundUrlSyntax rejects bracketed IPv6 loopback/ULA/link-local literals", () => {
  for (const host of ["[::1]", "[fc00::1]", "[fe80::1]"]) {
    assert.throws(
      () => validateOutboundUrlSyntax(`http://${host}/`, "test"),
      /must not target a local or private address/,
      `expected ${host} to be rejected`,
    );
  }
});

test("validateOutboundUrlSyntax rejects localhost-shaped hostnames and accepts a public-looking one", () => {
  assert.throws(() => validateOutboundUrlSyntax("http://localhost/", "test"), /must not target/);
  assert.throws(() => validateOutboundUrlSyntax("http://printer.local/", "test"), /must not target/);
  assert.doesNotThrow(() => validateOutboundUrlSyntax("https://api.example.com/webhook", "test"));
});

test("assertPublicOutboundUrl rejects a loopback literal without needing a real DNS lookup", async () => {
  await assert.rejects(
    () => assertPublicOutboundUrl("http://127.0.0.1/", "test"),
    /must not target a local or private address/,
  );
});

test("fetchPublic rejects a redirect from a validated endpoint to a loopback target", async (t) => {
  const server = createServer((req, res) => {
    res.writeHead(302, { Location: "http://127.0.0.1:9/internal-secret" });
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const originalFlag = process.env.CARDVAULT_ALLOW_LOCAL_OUTBOUND_URLS;
  process.env.CARDVAULT_ALLOW_LOCAL_OUTBOUND_URLS = "0";
  t.after(() => {
    if (originalFlag === undefined) delete process.env.CARDVAULT_ALLOW_LOCAL_OUTBOUND_URLS;
    else process.env.CARDVAULT_ALLOW_LOCAL_OUTBOUND_URLS = originalFlag;
  });

  // fetchPublic trusts its starting `endpoint` (the caller already validated
  // it) and only re-validates redirect targets — that's what this checks.
  const endpoint = new URL(`http://127.0.0.1:${port}/`);
  await assert.rejects(
    () => fetchPublic(endpoint, {}, "test"),
    /must not target a local or private address/,
  );
});

test("fetchPublic follows a same-host redirect to a benign target", async (t) => {
  const server = createServer((req, res) => {
    if (req.url === "/start") {
      res.writeHead(302, { Location: "/final" });
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const originalFlag = process.env.CARDVAULT_ALLOW_LOCAL_OUTBOUND_URLS;
  process.env.CARDVAULT_ALLOW_LOCAL_OUTBOUND_URLS = "1";
  t.after(() => {
    if (originalFlag === undefined) delete process.env.CARDVAULT_ALLOW_LOCAL_OUTBOUND_URLS;
    else process.env.CARDVAULT_ALLOW_LOCAL_OUTBOUND_URLS = originalFlag;
  });

  const response = await fetchPublic(new URL(`http://127.0.0.1:${port}/start`), {}, "test");
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "ok");
});
