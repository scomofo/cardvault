import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("server-backed batch saves apply created cards to the current catalog", async () => {
  const batchView = await readFile(new URL("../src/components/BatchView.jsx", import.meta.url), "utf8");

  assert.match(batchView, /const\s+result\s*=\s*await\s+itemsAPI\.bulkCreate\(items\)/);
  assert.match(batchView, /setCatalog\(\(p\)\s*=>\s*\[\.\.\.\(result\.created\s*\|\|\s*items\)/s);
});

test("dealer mode listing generation uses the selected export platform", async () => {
  const dealerModeView = await readFile(new URL("../src/components/DealerModeView.jsx", import.meta.url), "utf8");

  assert.match(
    dealerModeView,
    /automationAPI\.generateListings\(\{\s*itemIds,\s*platform:\s*exportPlatform\s*\}\)/s,
  );
});

test("dealer mode select all is based on filtered item membership", async () => {
  const dealerModeView = await readFile(new URL("../src/components/DealerModeView.jsx", import.meta.url), "utf8");

  assert.match(
    dealerModeView,
    /filtered\.length\s*>\s*0\s*&&\s*filtered\.every\(\(c\)\s*=>\s*selected\.has\(c\.id\)\)/,
  );
  assert.doesNotMatch(dealerModeView, /selected\.size\s*===\s*filtered\.length/);
});

test("sales flow blocks duplicate manual sale submissions while saving", async () => {
  const salesFlow = await readFile(new URL("../src/components/SalesFlow.jsx", import.meta.url), "utf8");
  const activeListingCard = await readFile(new URL("../src/components/ActiveListingCard.jsx", import.meta.url), "utf8");

  assert.match(salesFlow, /useRef\(new Set\(\)\)/);
  assert.match(salesFlow, /saleSubmissionRef\.current\.has\(listingId\)/);
  assert.match(salesFlow, /saleSubmissionRef\.current\.add\(listingId\)/);
  assert.match(salesFlow, /saleSubmissionRef\.current\.delete\(listingId\)/);
  assert.match(activeListingCard, /disabled=\{busyListingId === l\.id\}/);
});
