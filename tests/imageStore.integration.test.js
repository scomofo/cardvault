import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer.js";

// 1x1 red pixel PNG.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

async function postImage(baseUrl, id, dataUrl) {
  return fetch(`${baseUrl}/api/images/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  });
}

test("images round-trip through the server store", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-images-" });

  const uploadResponse = await postImage(baseUrl, "img_test_front", TINY_PNG_DATA_URL);
  assert.equal(uploadResponse.status, 201);
  const uploaded = await uploadResponse.json();
  assert.equal(uploaded.id, "img_test_front");
  assert.equal(uploaded.mime, "image/png");
  assert.ok(uploaded.size > 0);

  const getResponse = await fetch(`${baseUrl}/api/images/img_test_front`);
  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.headers.get("content-type"), "image/png");
  const bytes = Buffer.from(await getResponse.arrayBuffer());
  assert.equal(bytes.toString("base64"), TINY_PNG_BASE64);

  // Re-upload overwrites in place.
  assert.equal((await postImage(baseUrl, "img_test_front", TINY_PNG_DATA_URL)).status, 201);
});

test("image store rejects unsafe ids and bad payloads", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-images-" });

  assert.equal((await postImage(baseUrl, "..%2F..%2Fetc", TINY_PNG_DATA_URL)).status, 400);
  assert.equal((await postImage(baseUrl, "img_ok", "not-a-data-url")).status, 400);
  assert.equal((await postImage(baseUrl, "img_ok", "data:text/html;base64,PGh0bWw+")).status, 400);

  const missing = await fetch(`${baseUrl}/api/images/img_never_saved`);
  assert.equal(missing.status, 404);
});
