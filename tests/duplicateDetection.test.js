import test from "node:test";
import assert from "node:assert/strict";

import { findLikelyDuplicate, DUPLICATE_HAMMING_THRESHOLD } from "../src/lib/duplicateDetection.js";
import { hammingDistance } from "../src/lib/phash.js";

const BASE = "0000000000000000";

test("findLikelyDuplicate returns null without a phash or catalog", () => {
  assert.equal(findLikelyDuplicate([{ frontImgPhash: BASE }], null), null);
  assert.equal(findLikelyDuplicate(null, BASE), null);
  assert.equal(findLikelyDuplicate([], BASE), null);
});

test("findLikelyDuplicate skips cards without a stored phash", () => {
  const catalog = [{ id: "a" }, { id: "b", frontImgPhash: null }, null];
  assert.equal(findLikelyDuplicate(catalog, BASE), null);
});

test("findLikelyDuplicate matches within the threshold and reports the distance", () => {
  const nearMatch = { id: "near", frontImgPhash: "0000000000000003" }; // 2 bits
  const result = findLikelyDuplicate([nearMatch], BASE);
  assert.equal(result.card.id, "near");
  assert.equal(result.distance, 2);
});

test("findLikelyDuplicate returns the closest match, not the first", () => {
  const catalog = [
    { id: "far", frontImgPhash: "00000000000000ff" },  // 8 bits
    { id: "exact", frontImgPhash: BASE },               // 0 bits
    { id: "near", frontImgPhash: "0000000000000001" }, // 1 bit
  ];
  const result = findLikelyDuplicate(catalog, BASE);
  assert.equal(result.card.id, "exact");
  assert.equal(result.distance, 0);
});

test("findLikelyDuplicate rejects matches beyond the threshold", () => {
  const distant = { id: "distant", frontImgPhash: "ffffffffffffffff" }; // 64 bits
  assert.equal(findLikelyDuplicate([distant], BASE), null);
  assert.equal(hammingDistance(distant.frontImgPhash, BASE) > DUPLICATE_HAMMING_THRESHOLD, true);
});

test("hammingDistance handles incompatible inputs", () => {
  assert.equal(hammingDistance(BASE, "short"), Infinity);
  assert.equal(hammingDistance(null, BASE), Infinity);
  assert.equal(hammingDistance(BASE, BASE), 0);
});
