import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  MAX_SCAN_IMAGE_BYTES,
  getScanImageRejection,
  isScanImageExtension,
} from "../src/electron/scanImage.js";

test("macOS open-file scan images are size-gated before IPC", () => {
  assert.equal(MAX_SCAN_IMAGE_BYTES, 12 * 1024 * 1024);
  assert.equal(getScanImageRejection({ isFile: true, size: MAX_SCAN_IMAGE_BYTES }), null);
  assert.match(
    getScanImageRejection({ isFile: true, size: MAX_SCAN_IMAGE_BYTES + 1 }),
    /too large/i,
  );
});

test("macOS open-file scan images are limited to supported image extensions", () => {
  assert.equal(isScanImageExtension("/tmp/card.JPG"), true);
  assert.equal(isScanImageExtension("/tmp/card.heic"), true);
  assert.equal(isScanImageExtension("/tmp/card.txt"), false);
});

test("Electron open-file scan flow uses the scan image guard before reading", async () => {
  const main = await readFile(new URL("../src/electron/main.js", import.meta.url), "utf8");

  assert.match(main, /getScanImageRejection/);
  assert.match(main, /dialog\.showErrorBox\("Could not open card image", rejection\)/);
  assert.match(main, /readImageAsDataUrl/);
});
