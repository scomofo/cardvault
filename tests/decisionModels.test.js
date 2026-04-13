import test from "node:test";
import assert from "node:assert/strict";
import { expectedGradedValue } from "../src/server/services/decisions/gradeRiskModel.js";
import {
  computeExpectedNet,
  marketplaceKeyFromRecommendation,
} from "../src/server/services/decisions/marketplaceFees.js";

test("expectedGradedValue weights 0.25/0.5/0.25 around projection", () => {
  const comps = { raw: 40, psa9: 120, psa10: 400 };
  const { expectedValue, distribution } = expectedGradedValue(9.5, comps);
  assert.equal(distribution.length, 3);
  assert.equal(distribution[0].grade, 9);
  assert.equal(distribution[1].grade, 9.5);
  assert.equal(distribution[2].grade, 10);
  const weightSum = distribution.reduce((s, p) => s + p.probability, 0);
  assert.equal(weightSum, 1);
  // PSA9=120, midpoint PSA9.5=260, PSA10=400 → 0.25*120 + 0.5*260 + 0.25*400 = 260
  assert.equal(expectedValue, 260);
});

test("expectedGradedValue clamps at grade bounds", () => {
  const { distribution } = expectedGradedValue(9.8, { raw: 10, psa9: 50, psa10: 200 });
  assert.equal(distribution[2].grade, 10);
  const low = expectedGradedValue(1.2, { raw: 10, psa9: 50, psa10: 200 }).distribution;
  assert.equal(low[0].grade, 1);
});

test("computeExpectedNet applies rate and flat fee", () => {
  // eBay default: 13.35% + $0.40
  const net = computeExpectedNet(100, "ebay", 0);
  assert.equal(net, 86.25); // 100 - 13.35 - 0.40
});

test("computeExpectedNet returns null for unknown marketplace", () => {
  assert.equal(computeExpectedNet(100, "unknown_channel", 0), null);
});

test("marketplaceKeyFromRecommendation maps known recommendations", () => {
  assert.equal(marketplaceKeyFromRecommendation("sell_on_ebay"), "ebay");
  assert.equal(marketplaceKeyFromRecommendation("send_to_comc"), "comc");
  assert.equal(marketplaceKeyFromRecommendation("consign_high_end"), "consignment");
  assert.equal(marketplaceKeyFromRecommendation("store_inventory_shopify"), "shopify");
  assert.equal(marketplaceKeyFromRecommendation("crosspost"), "ebay");
  assert.equal(marketplaceKeyFromRecommendation("keep_local_only"), "local");
  assert.equal(marketplaceKeyFromRecommendation("nonsense"), null);
});
