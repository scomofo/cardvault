import test from "node:test";
import assert from "node:assert/strict";
import { enforceTrustedHostAndOrigin, isLoopbackRequest, isTrustedLanRequest, requireProtectedConfigWrite } from "../src/server/auth.js";

function createResponseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
}

test("isLoopbackRequest ignores spoofed hostnames", () => {
  const req = {
    ip: "203.0.113.9",
    socket: { remoteAddress: "203.0.113.9" },
    hostname: "localhost",
  };

  assert.equal(isLoopbackRequest(req), false);
});

test("requireProtectedConfigWrite blocks remote requests without a token even if host is localhost", () => {
  const originalToken = process.env.PROXY_TOKEN;
  delete process.env.PROXY_TOKEN;

  const req = {
    ip: "203.0.113.9",
    socket: { remoteAddress: "203.0.113.9" },
    hostname: "localhost",
    headers: {},
  };
  const res = createResponseRecorder();
  let nextCalled = false;

  requireProtectedConfigWrite(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.match(res.payload.error, /trusted app origin on the local network or a bearer token/i);

  if (originalToken == null) delete process.env.PROXY_TOKEN;
  else process.env.PROXY_TOKEN = originalToken;
});

test("isTrustedLanRequest accepts RFC1918 LAN addresses", () => {
  const req = {
    ip: "192.168.1.44",
    socket: { remoteAddress: "192.168.1.44" },
  };

  assert.equal(isTrustedLanRequest(req), true);
});

test("requireProtectedConfigWrite allows trusted local-network requests from the app origin without a token", () => {
  const originalToken = process.env.PROXY_TOKEN;
  const originalDevHostname = process.env.DEV_HOSTNAME;
  delete process.env.PROXY_TOKEN;
  process.env.DEV_HOSTNAME = "cardvault.local";

  const req = {
    ip: "192.168.1.44",
    socket: { remoteAddress: "192.168.1.44" },
    headers: { origin: "https://cardvault.local:3000" },
  };
  const res = createResponseRecorder();
  let nextCalled = false;

  requireProtectedConfigWrite(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);

  if (originalToken == null) delete process.env.PROXY_TOKEN;
  else process.env.PROXY_TOKEN = originalToken;
  if (originalDevHostname == null) delete process.env.DEV_HOSTNAME;
  else process.env.DEV_HOSTNAME = originalDevHostname;
});

test("requireProtectedConfigWrite blocks trusted LAN requests from untrusted origins", () => {
  const originalToken = process.env.PROXY_TOKEN;
  const originalDevHostname = process.env.DEV_HOSTNAME;
  delete process.env.PROXY_TOKEN;
  process.env.DEV_HOSTNAME = "cardvault.local";

  const req = {
    ip: "192.168.1.44",
    socket: { remoteAddress: "192.168.1.44" },
    headers: { origin: "https://evil.local:3000" },
  };
  const res = createResponseRecorder();
  let nextCalled = false;

  requireProtectedConfigWrite(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);

  if (originalToken == null) delete process.env.PROXY_TOKEN;
  else process.env.PROXY_TOKEN = originalToken;
  if (originalDevHostname == null) delete process.env.DEV_HOSTNAME;
  else process.env.DEV_HOSTNAME = originalDevHostname;
});

test("requireProtectedConfigWrite allows remote requests with the correct bearer token", () => {
  const originalToken = process.env.PROXY_TOKEN;
  process.env.PROXY_TOKEN = "test-token";

  const req = {
    ip: "203.0.113.9",
    socket: { remoteAddress: "203.0.113.9" },
    headers: { authorization: "Bearer test-token" },
  };
  const res = createResponseRecorder();
  let nextCalled = false;

  requireProtectedConfigWrite(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);

  if (originalToken == null) delete process.env.PROXY_TOKEN;
  else process.env.PROXY_TOKEN = originalToken;
});

function withoutProxyToken(t) {
  const originalToken = process.env.PROXY_TOKEN;
  delete process.env.PROXY_TOKEN;
  t.after(() => {
    if (originalToken == null) delete process.env.PROXY_TOKEN;
    else process.env.PROXY_TOKEN = originalToken;
  });
}

function runHostOriginCheck(req) {
  const res = createResponseRecorder();
  let nextCalled = false;
  enforceTrustedHostAndOrigin({ ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" }, ...req }, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

test("enforceTrustedHostAndOrigin rejects a Host header outside the trusted dev hosts (DNS rebinding)", (t) => {
  withoutProxyToken(t);

  const rejected = runHostOriginCheck({ method: "GET", headers: { host: "attacker.example.com" } });
  assert.equal(rejected.nextCalled, false);
  assert.equal(rejected.res.statusCode, 403);
  assert.match(rejected.res.payload.error, /host/i);

  const missing = runHostOriginCheck({ method: "GET", headers: {} });
  assert.equal(missing.nextCalled, false);
  assert.equal(missing.res.statusCode, 403);

  for (const host of ["127.0.0.1:3001", "localhost:3000", "[::1]:3001"]) {
    const allowed = runHostOriginCheck({ method: "GET", headers: { host } });
    assert.equal(allowed.nextCalled, true, `expected Host ${host} to be trusted`);
  }
});

test("enforceTrustedHostAndOrigin rejects state-changing requests from a foreign Origin but not safe ones", (t) => {
  withoutProxyToken(t);

  const crossSitePost = runHostOriginCheck({
    method: "POST",
    headers: { host: "127.0.0.1:3001", origin: "https://attacker.example.com" },
  });
  assert.equal(crossSitePost.nextCalled, false);
  assert.equal(crossSitePost.res.statusCode, 403);
  assert.match(crossSitePost.res.payload.error, /origin/i);

  const crossSiteGet = runHostOriginCheck({
    method: "GET",
    headers: { host: "127.0.0.1:3001", origin: "https://attacker.example.com" },
  });
  assert.equal(crossSiteGet.nextCalled, true, "CORS already withholds the response for a foreign-origin GET");

  const appPost = runHostOriginCheck({
    method: "POST",
    headers: { host: "127.0.0.1:3001", origin: "http://localhost:3000" },
  });
  assert.equal(appPost.nextCalled, true);

  const noOriginPost = runHostOriginCheck({ method: "POST", headers: { host: "127.0.0.1:3001" } });
  assert.equal(noOriginPost.nextCalled, true, "non-browser clients send no Origin");
});

test("enforceTrustedHostAndOrigin is a no-op when PROXY_TOKEN is the boundary", (t) => {
  const originalToken = process.env.PROXY_TOKEN;
  process.env.PROXY_TOKEN = "test-token";
  t.after(() => {
    if (originalToken == null) delete process.env.PROXY_TOKEN;
    else process.env.PROXY_TOKEN = originalToken;
  });

  const result = runHostOriginCheck({
    method: "POST",
    headers: { host: "api.example.com", origin: "https://dashboard.example.com" },
  });
  assert.equal(result.nextCalled, true);
});
