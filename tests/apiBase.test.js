import test from "node:test";
import assert from "node:assert/strict";

import { apiPath, API_BASE } from "../src/lib/apiBase.js";

test("apiPath uses the shared API base", () => {
  assert.equal(API_BASE, "/api");
  assert.equal(apiPath("/settings"), "/api/settings");
  assert.equal(apiPath("/ebay/status"), "/api/ebay/status");
});
