import test from "node:test";
import assert from "node:assert/strict";
import { navigationTargetForSearchResult } from "../src/lib/search/searchNavigation.js";

test("search navigation sends watchlist results to the watch tools tab", () => {
  assert.deepEqual(
    navigationTargetForSearchResult("watch"),
    { view: "tools", toolsTab: "watch" },
  );
});

test("search navigation sends trade results to the trade tools tab", () => {
  assert.deepEqual(
    navigationTargetForSearchResult("trade"),
    { view: "tools", toolsTab: "trade" },
  );
});

test("search navigation preserves existing top-level destinations for cards and sales data", () => {
  assert.deepEqual(navigationTargetForSearchResult("card"), { view: "cards" });
  assert.deepEqual(navigationTargetForSearchResult("sale"), { view: "sales" });
  assert.deepEqual(navigationTargetForSearchResult("order"), { view: "sales" });
});
