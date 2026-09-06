import test from "node:test";
import assert from "node:assert/strict";
import { toggleCardListing } from "../src/lib/cardDetailState.js";
import { filterCatalog, summarizeCatalog } from "../src/lib/catalogState.js";

test("listing changes cannot resurrect sold cards or add their value to owned totals", () => {
  const sold = Object.freeze({
    id: "sold", status: "sold", listedOn: Object.freeze(["ebay"]),
    soldPrice: 150, soldPlatform: "ebay", priceEstimate: { mid: 200 }, costBasis: 100,
  });
  for (const platform of ["ebay", "comc"]) {
    const result = toggleCardListing(sold, platform);
    assert.equal(result, sold);
    assert.equal(filterCatalog([result], { status: "owned" }).length, 0);
    assert.deepEqual(filterCatalog([result], { status: "sold" }), [sold]);
    assert.deepEqual(summarizeCatalog([result]), {
      owned: 0, listed: 0, sold: 1, priced: 0, value: 0, gain: 0, comparable: 0,
    });
  }
});

test("owned cards stay listed until their last platform is removed", () => {
  const card = Object.freeze({ id: "owned", status: "inventory", listedOn: Object.freeze([]) });
  const ebay = toggleCardListing(card, "ebay");
  const both = toggleCardListing(ebay, "comc");
  const comc = toggleCardListing(both, "ebay");
  const inventory = toggleCardListing(comc, "comc");
  assert.deepEqual(card.listedOn, []);
  assert.equal(ebay.status, "listed");
  assert.deepEqual(both.listedOn, ["ebay", "comc"]);
  assert.equal(comc.status, "listed");
  assert.deepEqual(comc.listedOn, ["comc"]);
  assert.equal(inventory.status, "inventory");
  assert.deepEqual(inventory.listedOn, []);
});
