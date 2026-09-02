import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer.js";

test("AI image payloads larger than two megabytes reach the AI route", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-ai-payload-" });
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
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-cv-payload-" });

  const response = await fetch(`${baseUrl}/api/cv/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: "a".repeat(6_000_000) }),
  });

  assert.equal(response.status, 413);
});
