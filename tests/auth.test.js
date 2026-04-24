import test from "node:test";
import assert from "node:assert/strict";
import { isLoopbackRequest, isTrustedLanRequest, requireProtectedConfigWrite } from "../src/server/auth.js";

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
  assert.match(res.payload.error, /trusted local-network request or bearer token/i);

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

test("requireProtectedConfigWrite allows trusted local-network requests without a token", () => {
  const originalToken = process.env.PROXY_TOKEN;
  delete process.env.PROXY_TOKEN;

  const req = {
    ip: "192.168.1.44",
    socket: { remoteAddress: "192.168.1.44" },
    headers: {},
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
