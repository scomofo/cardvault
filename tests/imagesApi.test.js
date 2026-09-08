import test from "node:test";
import assert from "node:assert/strict";
import { imagesAPI } from "../src/lib/api.js";

test("server photo previews use the configured authorization token and return image bytes", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  t.after(() => { globalThis.fetch = originalFetch; if (originalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = originalStorage; });
  globalThis.localStorage = { getItem: (key) => key === "cv_proxy_token" ? "test-photo-token" : null };
  globalThis.fetch = async (path, options) => {
    assert.equal(path, "/api/images/front%2Funsafe");
    assert.equal(options.headers.Authorization, "Bearer test-photo-token");
    return new Response("image-bytes", { headers: { "Content-Type": "image/png" } });
  };
  const photo = await imagesAPI.read("front/unsafe");
  assert.equal(photo.type, "image/png");
  assert.equal(await photo.text(), "image-bytes");
});
