import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("server-backed batch saves apply created cards to the current catalog", async () => {
  const batchView = await readFile(new URL("../src/components/BatchView.jsx", import.meta.url), "utf8");

  assert.match(batchView, /const\s+result\s*=\s*await\s+itemsAPI\.bulkCreate\(items\)/);
  assert.match(batchView, /setCatalog\(\(p\)\s*=>\s*\[\.\.\.\(result\.created\s*\|\|\s*items\)/s);
});
