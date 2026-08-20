import test from "node:test";
import assert from "node:assert/strict";
import { jaroWinkler } from "../src/server/services/identification/fuzzy.js";

function assertClose(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 0.001, `${label}: expected ~${expected}, got ${actual}`);
}

test("jaroWinkler handles empty and identical inputs", () => {
  assert.equal(jaroWinkler("", ""), 1);
  assert.equal(jaroWinkler(null, undefined), 1);
  assert.equal(jaroWinkler("card", ""), 0);
  assert.equal(jaroWinkler("", "card"), 0);
  assert.equal(jaroWinkler("card", "card"), 1);
  assert.equal(jaroWinkler("  CARD  ", "card"), 1);
});

test("jaroWinkler returns 0 with no character matches", () => {
  assert.equal(jaroWinkler("abc", "xyz"), 0);
});

test("jaroWinkler matches the classic reference values", () => {
  assertClose(jaroWinkler("MARTHA", "MARHTA"), 0.9611, "martha/marhta");
  assertClose(jaroWinkler("DWAYNE", "DUANE"), 0.84, "dwayne/duane");
  assertClose(jaroWinkler("DIXON", "DICKSONX"), 0.8133, "dixon/dicksonx");
});

test("jaroWinkler rewards shared prefixes and ranks near-misses sensibly", () => {
  const withPrefix = jaroWinkler("gretzky", "gretzkey");
  const scrambled = jaroWinkler("gretzky", "ygretzk");
  assert.ok(withPrefix > scrambled, "shared prefix should outrank a rotation");
  assert.ok(withPrefix > 0.9);
  assert.ok(jaroWinkler("upper deck", "upperdeck") > jaroWinkler("upper deck", "topps"));
});
