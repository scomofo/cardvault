import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Boot a temp SQLite DB for one test and tear it down afterwards, so the fee
 * model can be exercised against real `fee_models` rows.
 */
async function withFeeDb(t) {
  const tempDir = await mkdtemp(join(tmpdir(), "cardvault-fee-rates-"));
  const previousPath = process.env.CARDVAULT_DB_PATH;
  process.env.CARDVAULT_DB_PATH = join(tempDir, "cardvault.db");

  const database = await import("../src/server/database.js");
  const { uid } = await import("../src/server/routes/shared.js");
  const fees = await import("../src/server/services/decisions/marketplaceFees.js");
  const { marketplaceDecision } = await import("../src/server/services/decisions/marketplaceDecision.js");
  const db = database.initDB();

  t.after(async () => {
    db.close();
    if (previousPath === undefined) delete process.env.CARDVAULT_DB_PATH;
    else process.env.CARDVAULT_DB_PATH = previousPath;
    await rm(tempDir, { recursive: true, force: true });
  });

  const setFeeRate = (platform, feeRate) => {
    database.run("INSERT INTO fee_models (id, platform, fee_rate) VALUES (?,?,?)", [uid(), platform, feeRate]);
  };

  return { ...fees, marketplaceDecision, setFeeRate };
}

test("default fee schedule applies when no fee model is configured", async (t) => {
  const { getMarketplaceFee, computeExpectedNet } = await withFeeDb(t);

  assert.deepEqual(getMarketplaceFee("ebay"), { rate: 0.1335, flatFee: 0.4, source: "default" });
  assert.equal(computeExpectedNet(100, "ebay", 0), 86.25); // 100 - 13.35 - 0.40
});

test("a negotiated fee rate overrides the default and keeps the default flat fee", async (t) => {
  const { getMarketplaceFee, computeExpectedNet, setFeeRate } = await withFeeDb(t);

  setFeeRate("ebay", 0.09);

  assert.deepEqual(getMarketplaceFee("ebay"), { rate: 0.09, flatFee: 0.4, source: "negotiated" });
  assert.equal(computeExpectedNet(100, "ebay", 0), 90.6); // 100 - 9.00 - 0.40
  // Channels without an override keep their default rate.
  assert.equal(getMarketplaceFee("comc").source, "default");
});

test("negotiated rate lookup is case-insensitive", async (t) => {
  const { getMarketplaceFee, setFeeRate } = await withFeeDb(t);

  setFeeRate("eBay", 0.11);

  assert.deepEqual(getMarketplaceFee("ebay"), { rate: 0.11, flatFee: 0.4, source: "negotiated" });
});

test("a zero negotiated rate is honoured rather than treated as missing", async (t) => {
  const { getMarketplaceFee, computeExpectedNet, setFeeRate } = await withFeeDb(t);

  setFeeRate("shopify", 0);

  assert.deepEqual(getMarketplaceFee("shopify"), { rate: 0, flatFee: 0.3, source: "negotiated" });
  assert.equal(computeExpectedNet(100, "shopify", 0), 99.7); // flat fee still applies
});

test("an out-of-range stored rate is ignored in favour of the default", async (t) => {
  const { getMarketplaceFee, setFeeRate } = await withFeeDb(t);

  // The route rejects these, but a hand-edited DB row must not poison routing.
  setFeeRate("ebay", 1.8);
  setFeeRate("comc", -0.5);

  assert.equal(getMarketplaceFee("ebay").rate, 0.1335);
  assert.equal(getMarketplaceFee("ebay").source, "default");
  assert.equal(getMarketplaceFee("comc").rate, 0.2);
  assert.equal(getMarketplaceFee("comc").source, "default");
});

test("a stored rate makes a platform priceable that has no default entry", async (t) => {
  const { getMarketplaceFee, computeExpectedNet, setFeeRate } = await withFeeDb(t);

  assert.equal(getMarketplaceFee("goldin"), null);
  assert.equal(computeExpectedNet(100, "goldin", 0), null);

  setFeeRate("goldin", 0.15);

  assert.deepEqual(getMarketplaceFee("goldin"), { rate: 0.15, flatFee: 0, source: "negotiated" });
  assert.equal(computeExpectedNet(100, "goldin", 0), 85);
});

test("marketplace routing selects on negotiated rates, not default ones", async (t) => {
  const { marketplaceDecision, setFeeRate } = await withFeeDb(t);

  const context = {
    subjectType: "inventory_item",
    subjectId: "item-1",
    ageDays: 10,
    item: { market_price: 100, listing_status: "draft" },
  };

  // Default rates: shopify nets $96.80 vs eBay $86.25, so shopify wins.
  const beforeOverride = marketplaceDecision(context);
  assert.equal(beforeOverride.inputsUsed.selectedChannel, "shopify");

  // A negotiated 2% eBay rate nets $97.60 and flips the routing decision.
  setFeeRate("ebay", 0.02);

  const afterOverride = marketplaceDecision(context);
  assert.equal(afterOverride.inputsUsed.selectedChannel, "ebay");
  assert.equal(afterOverride.recommendation, "sell_on_ebay");
  assert.equal(afterOverride.inputsUsed.channelNets.ebay, 97.6);
  assert.ok(afterOverride.inputsUsed.channelNets.ebay > afterOverride.inputsUsed.channelNets.shopify);
  assert.match(afterOverride.explanation, /Expected net via ebay is \$97\.60/);
});
