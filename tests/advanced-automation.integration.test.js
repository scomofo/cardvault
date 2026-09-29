import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer.js";

test("advanced automation routes handle duplicates, trends, acquisition, bundles, grading, and cashflow", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-advanced-auto-" });

  for (const id of ["dup-a", "dup-b"]) {
    const res = await fetch(`${baseUrl}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        name: "Auston Matthews",
        playerName: "Auston Matthews",
        set: "Young Guns",
        number: "201",
        listedOn: [],
        priceHistory: [],
        marketPrice: 12,
        suggestedListingPrice: 13.5,
        acquisitionSource: "show",
        frontImgId: `${id}-front`,
        costBasis: 5,
        projected_grade: 9.5,
      }),
    });
    assert.equal(res.status, 201);
  }

  const priceLookup = await fetch(`${baseUrl}/api/automation/identify-price/dup-a`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pricingStrategy: "premium" }),
  });
  assert.equal(priceLookup.status, 200);

  const duplicates = await fetch(`${baseUrl}/api/automation/duplicates`);
  const duplicatesPayload = await duplicates.json();
  assert.ok(duplicatesPayload.some((group) => group.count >= 2));

  const trends = await fetch(`${baseUrl}/api/automation/market-trends`, {
    method: "POST",
  });
  assert.equal(trends.status, 200);

  const acquisition = await fetch(`${baseUrl}/api/automation/acquisition-decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ askingPrice: 100, estimatedExitValue: 150, historicalRoiBySource: 10 }),
  });
  const acquisitionPayload = await acquisition.json();
  assert.equal(acquisitionPayload.recommendation, "buy_now");

  const bundles = await fetch(`${baseUrl}/api/automation/bundles`);
  const bundlesPayload = await bundles.json();
  assert.ok(Array.isArray(bundlesPayload));

  const grading = await fetch(`${baseUrl}/api/automation/grading`);
  const gradingPayload = await grading.json();
  assert.ok(gradingPayload.some((entry) => entry.itemId === "dup-a"));

  const cashflow = await fetch(`${baseUrl}/api/automation/cashflow`);
  const cashflowPayload = await cashflow.json();
  assert.ok(cashflowPayload.inventoryValue >= 24);
  assert.ok(Array.isArray(cashflowPayload.roiBySource));
});
