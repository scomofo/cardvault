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

test("validateOutboundUrlSyntax rejects the rest of 127/8, IPv4-mapped IPv6 loopback, the unspecified IPv6 address, CGNAT, and 192.0.0/24", () => {
  for (const host of ["127.0.0.2", "127.255.255.254", "[::ffff:127.0.0.1]", "[::ffff:7f00:1]", "[::]", "100.64.0.1", "192.0.0.1", "0.1.2.3"]) {
    assert.throws(
      () => validateOutboundUrlSyntax(`http://${host}/`, "test"),
      /must not target a local or private address/,
      `expected ${host} to be rejected`,
    );
  }
  assert.doesNotThrow(() => validateOutboundUrlSyntax("http://100.128.0.1/", "test"));
  assert.doesNotThrow(() => validateOutboundUrlSyntax("http://192.0.1.1/", "test"));
});

test("assertPublicOutboundUrl fails closed when the hostname does not resolve", async (t) => {
  const originalFlag = process.env.CARDVAULT_ALLOW_LOCAL_OUTBOUND_URLS;
  process.env.CARDVAULT_ALLOW_LOCAL_OUTBOUND_URLS = "0";
  t.after(() => {
    if (originalFlag === undefined) delete process.env.CARDVAULT_ALLOW_LOCAL_OUTBOUND_URLS;
    else process.env.CARDVAULT_ALLOW_LOCAL_OUTBOUND_URLS = originalFlag;
  });

  // .invalid is reserved (RFC 2606) and never resolves.
  await assert.rejects(
    () => assertPublicOutboundUrl("https://partner.does-not-exist.invalid/handoff", "test"),
    /URL could not be resolved/,
  );
});

test("fetchPublic drops credential headers and the body on a cross-origin redirect but keeps them same-origin", async (t) => {
  const seen = [];
  const handler = (req, res) => {
    if (req.url.startsWith("/redirect-cross")) {
      res.writeHead(302, { Location: `http://127.0.0.1:${otherPort}/landed` });
      res.end();
      return;
    }
    if (req.url === "/redirect-same") {
      res.writeHead(307, { Location: "/landed" });
      res.end();
      return;
    }
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      seen.push({
        port: req.socket.localPort,
        method: req.method,
        authorization: req.headers.authorization || null,
        apiKey: req.headers["x-partner-key"] || null,
        contentType: req.headers["content-type"] || null,
        body,
      });
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("landed");
    });
  };
  const first = createServer(handler);
  const other = createServer(handler);
  await new Promise((resolve) => first.listen(0, "127.0.0.1", resolve));
  await new Promise((resolve) => other.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => first.close(resolve)));
  t.after(() => new Promise((resolve) => other.close(resolve)));
  const firstPort = first.address().port;
  const otherPort = other.address().port;

  const originalFlag = process.env.CARDVAULT_ALLOW_LOCAL_OUTBOUND_URLS;
  process.env.CARDVAULT_ALLOW_LOCAL_OUTBOUND_URLS = "1";
  t.after(() => {
    if (originalFlag === undefined) delete process.env.CARDVAULT_ALLOW_LOCAL_OUTBOUND_URLS;
    else process.env.CARDVAULT_ALLOW_LOCAL_OUTBOUND_URLS = originalFlag;
  });

  const init = {
    method: "POST",
    headers: {
      Authorization: "Bearer partner-secret",
      "X-Partner-Key": "api-key-secret",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ listingId: "l1" }),
  };

  const crossOrigin = await fetchPublic(new URL(`http://127.0.0.1:${firstPort}/redirect-cross`), init, "test");
  assert.equal(crossOrigin.status, 200);
  const cross = seen.pop();
  assert.equal(cross.port, otherPort);
  assert.equal(cross.method, "GET", "302 rewrites POST to GET");
  assert.equal(cross.authorization, null, "Authorization must not follow a cross-origin redirect");
  assert.equal(cross.apiKey, null, "a configured API-key header must not follow a cross-origin redirect");
  assert.equal(cross.body, "");

  const sameOrigin = await fetchPublic(new URL(`http://127.0.0.1:${firstPort}/redirect-same`), init, "test");
  assert.equal(sameOrigin.status, 200);
  const same = seen.pop();
  assert.equal(same.port, firstPort);
  assert.equal(same.method, "POST", "307 preserves the method same-origin");
  assert.equal(same.authorization, "Bearer partner-secret");
  assert.equal(same.apiKey, "api-key-secret");
  assert.equal(same.body, JSON.stringify({ listingId: "l1" }));
});
