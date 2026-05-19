import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

async function waitForServer(baseUrl, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/settings`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

async function startTestServer(t, { dirPrefix, portBase, portSpan = 400 }) {
  const tempDir = await mkdtemp(join(tmpdir(), dirPrefix));
  const dbPath = join(tempDir, "cardvault-test.db");
  const port = portBase + Math.floor(Math.random() * portSpan);
  const baseUrl = `http://127.0.0.1:${port}`;

  const server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CARDVAULT_DB_PATH: dbPath,
    },
    stdio: "ignore",
  });

  t.after(async () => {
    if (!server.killed) server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
    await rm(tempDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl);
  return { baseUrl };
}

test("AI image payloads larger than two megabytes reach the AI route", async (t) => {
  const { baseUrl } = await startTestServer(t, {
    dirPrefix: "cardvault-ai-payload-",
    portBase: 7500,
  });
  const payload = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 1,
    messages: [{
      role: "user",
      content: [{
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: "a".repeat(2_200_000),
        },
      }],
    }],
  };

  const response = await fetch(`${baseUrl}/api/ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  assert.notEqual(response.status, 413);
});

test("CV analyze route keeps its narrower payload limit", async (t) => {
  const { baseUrl } = await startTestServer(t, {
    dirPrefix: "cardvault-cv-payload-",
    portBase: 7900,
  });

  const response = await fetch(`${baseUrl}/api/cv/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: "a".repeat(6_000_000) }),
  });

  assert.equal(response.status, 413);
});
