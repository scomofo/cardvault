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
