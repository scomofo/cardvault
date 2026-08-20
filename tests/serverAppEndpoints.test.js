import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("server app endpoints: AI proxy, CV proxy, and decision routes", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-server-app-"));
  const dbPath = join(tempDir, "cardvault.db");
  const previousEnv = {
    CARDVAULT_DB_PATH: process.env.CARDVAULT_DB_PATH,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    CV_SERVICE_URL: process.env.CV_SERVICE_URL,
    PROXY_TOKEN: process.env.PROXY_TOKEN,
  };

  process.env.CARDVAULT_DB_PATH = dbPath;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CV_SERVICE_URL;
  delete process.env.PROXY_TOKEN;

  const realFetch = globalThis.fetch;
  const stubRoutes = [];
  globalThis.fetch = (url, options = {}) => {
    const target = String(url);
    const route = stubRoutes.find((entry) => target.startsWith(entry.prefix));
    if (route) return route.handler(target, options);
    return realFetch(url, options);
  };
  function stubPrefix(prefix, handler) {
    const existing = stubRoutes.findIndex((entry) => entry.prefix === prefix);
    if (existing >= 0) stubRoutes.splice(existing, 1);
    stubRoutes.unshift({ prefix, handler });
  }

  const database = await import("../src/server/database.js");
  const { startServer } = await import("../server.js");
  const server = await startServer({ port: 0, host: "127.0.0.1" });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(path, { method = "GET", body, headers = {} } = {}) {
    const response = await realFetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  }

  try {
    await t.test("AI endpoints validate input before and after a key exists", async () => {
      const initial = await request("/api/ai/status");
      assert.deepEqual(initial.payload, { configured: false, masked: null });

      const badModel = await request("/api/ai", {
        method: "POST",
        body: { model: "gpt-4", messages: [{ role: "user", content: "hi" }] },
      });
      assert.equal(badModel.response.status, 400);
      assert.match(badModel.payload.error, /Invalid model/);

      const noMessages = await request("/api/ai", {
        method: "POST",
        body: { model: "claude-haiku-4-5-20251001", messages: [] },
      });
      assert.equal(noMessages.response.status, 400);
      assert.match(noMessages.payload.error, /non-empty array/);

      const noKey = await request("/api/ai", {
        method: "POST",
        body: { model: "claude-haiku-4-5-20251001", messages: [{ role: "user", content: "hi" }] },
      });
      assert.equal(noKey.response.status, 503);

      const badKey = await request("/api/ai/key", { method: "POST", body: { key: "nope" } });
      assert.equal(badKey.response.status, 400);

      const goodKey = await request("/api/ai/key", { method: "POST", body: { key: "sk-ant-test-0123456789" } });
      assert.equal(goodKey.payload.configured, true);
      assert.match(goodKey.payload.masked, /^sk-ant-.*6789$/);
      const status = await request("/api/ai/status");
      assert.equal(status.payload.configured, true);
      assert.equal(
        database.get("SELECT value FROM settings WHERE key = ?", ["anthropic_api_key"]).value,
        "sk-ant-test-0123456789",
      );
    });

    await t.test("AI proxy forwards sanitized requests and surfaces failures", async () => {
      let forwarded = null;
      stubPrefix("https://api.anthropic.com", async (_url, options) => {
        forwarded = { headers: options.headers, body: JSON.parse(options.body) };
        return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
      });

      const ok = await request("/api/ai", {
        method: "POST",
        body: {
          model: "claude-haiku-4-5-20251001",
          max_tokens: 99999,
          system: "be brief",
          messages: [{ role: "user", content: "hi" }],
          extraneous: "dropped",
        },
      });
      assert.equal(ok.payload.id, "msg_1");
      assert.equal(forwarded.headers["x-api-key"], "sk-ant-test-0123456789");
      assert.equal(forwarded.body.max_tokens, 4000);
      assert.equal(forwarded.body.system, "be brief");
      assert.equal(forwarded.body.extraneous, undefined);

      stubPrefix("https://api.anthropic.com", async () =>
        new Response(JSON.stringify({ error: { type: "rate_limit_error" } }), { status: 429 }));
      const limited = await request("/api/ai", {
        method: "POST",
        body: { model: "claude-haiku-4-5-20251001", messages: [{ role: "user", content: "hi" }] },
      });
      assert.equal(limited.response.status, 429);

      stubPrefix("https://api.anthropic.com", async () => {
        throw new Error("network down");
      });
      const failed = await request("/api/ai", {
        method: "POST",
        body: { model: "claude-haiku-4-5-20251001", messages: [{ role: "user", content: "hi" }] },
      });
      assert.equal(failed.response.status, 502);
      assert.equal(failed.payload.error, "AI proxy failed");
    });

    await t.test("CV proxy passes through responses, timeouts, and outages", async () => {
      stubPrefix("http://127.0.0.1:8000", async () =>
        new Response(JSON.stringify({ grade: 9, centering: "55/45" }), { status: 200 }));
      const analyzed = await request("/api/cv/analyze", { method: "POST", body: { image: "data" } });
      assert.equal(analyzed.payload.grade, 9);
      const health = await request("/api/cv/health");
      assert.equal(health.response.status, 200);

      stubPrefix("http://127.0.0.1:8000", async () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      });
      const timedOut = await request("/api/cv/analyze", { method: "POST", body: { image: "data" } });
      assert.equal(timedOut.response.status, 504);
      assert.equal(timedOut.payload.error, "CV service timeout");

      stubPrefix("http://127.0.0.1:8000", async () => {
        throw new Error("connection refused");
      });
      const down = await request("/api/cv/analyze", { method: "POST", body: { image: "data" } });
      assert.equal(down.response.status, 502);
      assert.equal(down.payload.error, "CV service unavailable");
      const offline = await request("/api/cv/health");
      assert.equal(offline.response.status, 503);
      assert.equal(offline.payload.status, "offline");
    });

    await t.test("decision routes evaluate subjects and record feedback", async () => {
      const missing = await request("/api/decisions/evaluate", { method: "POST", body: { subjectType: "inventory_item" } });
      assert.equal(missing.response.status, 400);
      const nonString = await request("/api/decisions/evaluate", {
        method: "POST",
        body: { subjectType: "inventory_item", subjectId: 7 },
      });
      assert.equal(nonString.response.status, 400);
      const unknown = await request("/api/decisions/evaluate", {
        method: "POST",
        body: { subjectType: "inventory_item", subjectId: "nope" },
      });
      assert.equal(unknown.response.status, 500);
      assert.match(unknown.payload.error, /Inventory item not found/);

      database.run(
        `INSERT INTO user_items (id, name, player_name, market_price, cost_basis, condition, front_img_id)
         VALUES (?,?,?,?,?,?,?)`,
        ["decision-item", "Decision Card", "Decision Player", 50, 10, "NM", "front-1"],
      );
      const evaluated = await request("/api/decisions/evaluate", {
        method: "POST",
        body: { subjectType: "inventory_item", subjectId: "decision-item" },
      });
      assert.equal(evaluated.response.status, 200);
      assert.ok(evaluated.payload.length > 0);

      const listed = await request("/api/decisions?subjectType=inventory_item&subjectId=decision-item");
      assert.equal(listed.payload.length, evaluated.payload.length);

      const calibration = await request("/api/decisions/calibration");
      assert.ok(Object.keys(calibration.payload).includes("pricing_decision"));

      const emptyFeedback = await request(`/api/decisions/${listed.payload[0].id}/feedback`, {
        method: "POST",
        body: {},
      });
      assert.equal(emptyFeedback.response.status, 400);
      const feedback = await request(`/api/decisions/${listed.payload[0].id}/feedback`, {
        method: "POST",
        body: { accepted: true, userResponse: "accepted" },
      });
      assert.equal(feedback.payload.status, "accepted");
    });

    await t.test("CORS reflects only trusted origins", async () => {
      const allowed = await request("/api/settings", { headers: { Origin: "http://localhost:3000" } });
      assert.equal(allowed.response.headers.get("access-control-allow-origin"), "http://localhost:3000");

      const blocked = await request("/api/settings", { headers: { Origin: "https://evil.example.com" } });
      assert.equal(blocked.response.headers.get("access-control-allow-origin"), null);
    });
  } finally {
    globalThis.fetch = realFetch;
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    });
    database.getDB().close();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});
