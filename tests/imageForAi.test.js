import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { fitImageDimensions } from "../src/lib/imageForAi.js";

test("fitImageDimensions preserves small images", () => {
  assert.deepEqual(fitImageDimensions(1200, 900, 1600), {
    width: 1200,
    height: 900,
    scaled: false,
  });
});

test("fitImageDimensions constrains landscape images to the max edge", () => {
  assert.deepEqual(fitImageDimensions(4032, 3024, 1600), {
    width: 1600,
    height: 1200,
    scaled: true,
  });
});

test("fitImageDimensions constrains portrait images to the max edge", () => {
  assert.deepEqual(fitImageDimensions(3024, 4032, 1600), {
    width: 1200,
    height: 1600,
    scaled: true,
  });
});

test("AI image calls prepare images before extracting base64", async () => {
  const source = await readFile(new URL("../src/lib/ai.js", import.meta.url), "utf8");

  assert.match(source, /import\s*\{\s*prepareImageForAi\s*\}\s*from "\.\/imageForAi\.js"/);
  assert.match(source, /const\s+preparedImage\s*=\s*await\s+prepareImageForAi\(imageDataUrl\)/);
  assert.match(source, /parseMediaType\(preparedImage\)/);
  assert.match(source, /preparedImage\.split\(","\)\[1\]/);
});
