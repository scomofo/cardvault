import test from "node:test";
import assert from "node:assert/strict";

import { classifyListingViability } from "../src/lib/listingViability.js";

test("classifyListingViability buckets listing decisions from price, net, and floor", () => {
  assert.equal(classifyListingViability({}), null);
  assert.equal(classifyListingViability({ mid: 0.25, net: 0.1 }), "bulk_lot");
  assert.equal(classifyListingViability({ mid: 4, net: 3, floor: 5 }), "not_worth_listing");
  assert.equal(classifyListingViability({ mid: 8, net: 1.5 }), "not_worth_listing");
  assert.equal(classifyListingViability({ mid: 8, net: 4.5 }), "review");
  assert.equal(classifyListingViability({ mid: 12, net: 6 }), "viable");
});
