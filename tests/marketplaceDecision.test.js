import test from "node:test";
import assert from "node:assert/strict";
import { marketplaceDecision } from "../src/server/services/decisions/marketplaceDecision.js";

function buildContext(overrides = {}) {
  return {
    subjectType: "inventory_item",
    subjectId: "item-1",
    ageDays: 10,
    item: { market_price: 100, listing_status: "draft" },
    ...overrides,
  };
}

test("hard constraint: consignment threshold forces consign_high_end", () => {
  const decision = marketplaceDecision(buildContext({ item: { market_price: 800 } }));
  assert.equal(decision.recommendation, "consign_high_end");
  assert.deepEqual(decision.inputsUsed.eligibleChannels, ["consignment"]);
  assert.match(decision.explanation, /exceeds consignment threshold/);
});

test("hard constraint: bundle strategy forces keep_local_only", () => {
  const decision = marketplaceDecision(
    buildContext({
      strategyDecision: { recommendation: "bundle_with_similar" },
    }),
  );
  assert.equal(decision.recommendation, "keep_local_only");
});

test("hard constraint: stale inventory routes to COMC", () => {
  const decision = marketplaceDecision(buildContext({ ageDays: 150 }));
  assert.equal(decision.recommendation, "send_to_comc");
  assert.deepEqual(decision.inputsUsed.eligibleChannels, ["comc"]);
});

test("soft selection picks highest expected net among open channels", () => {
  const decision = marketplaceDecision(buildContext({ item: { market_price: 100, listing_status: "draft" } }));
  // At $100: ebay net=86.25, shopify net=96.80, tcgplayer=89.75, mercari=90
  // Highest is shopify → recommendation should be store_inventory_shopify
  assert.equal(decision.inputsUsed.selectedChannel, "shopify");
  assert.equal(decision.recommendation, "store_inventory_shopify");
  // channelNets has every fee-table entry
  assert.ok(decision.inputsUsed.channelNets.ebay < decision.inputsUsed.channelNets.shopify);
});

test("storage location 'store' overrides optimization and locks to shopify", () => {
  const decision = marketplaceDecision(
    buildContext({
      item: { market_price: 100, storage_location: "back store room", listing_status: "draft" },
    }),
  );
  assert.equal(decision.recommendation, "store_inventory_shopify");
  assert.deepEqual(decision.inputsUsed.eligibleChannels, ["shopify"]);
});

test("auction strategy forces ebay even if shopify has higher net", () => {
  const decision = marketplaceDecision(
    buildContext({
      strategyDecision: { recommendation: "auction_recommended" },
    }),
  );
  assert.equal(decision.recommendation, "sell_on_ebay");
  assert.equal(decision.inputsUsed.selectedChannel, "ebay");
});

test("crosspost triggers when listed and age exceeds crosspost threshold", () => {
  const decision = marketplaceDecision(
    buildContext({ ageDays: 75, item: { market_price: 100, listing_status: "listed" } }),
  );
  assert.equal(decision.recommendation, "crosspost");
});

test("explanation flags when the selected channel is not the unconstrained best", () => {
  const decision = marketplaceDecision(
    buildContext({
      item: { market_price: 100, storage_location: "store", listing_status: "draft" },
    }),
  );
  // Shopify is locked, but since shopify is actually the best-net channel here,
  // there should be no "unconstrained best would be" suffix.
  assert.doesNotMatch(decision.explanation, /Unconstrained best/);
});

test("unconstrainedBest reflects the global max regardless of eligibility", () => {
  const decision = marketplaceDecision(buildContext({ item: { market_price: 800 } }));
  // Forced to consignment, but unconstrainedBest still reports the best across the fee table
  assert.ok(decision.inputsUsed.unconstrainedBest);
  assert.match(decision.explanation, /Unconstrained best/);
});
