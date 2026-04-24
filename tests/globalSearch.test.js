import test from "node:test";
import assert from "node:assert/strict";
import { matchScore, shouldOpenGlobalSearch } from "../src/lib/search/globalSearch.js";

test("global search matches trade gave and received card text", () => {
  const trade = {
    name: "Local Dealer",
    partner: "Local Dealer",
    gave: "Connor McDavid Young Guns",
    received: "Wayne Gretzky Rookie",
    notes: "Weekend expo trade",
  };

  assert.ok(matchScore(trade, "McDavid") > 0);
  assert.ok(matchScore(trade, "Gretzky") > 0);
  assert.ok(matchScore(trade, "expo") > 0);
});

test("global search opens on slash outside editable fields", () => {
  assert.equal(
    shouldOpenGlobalSearch({
      key: "/",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: { tagName: "DIV", isContentEditable: false },
    }),
    true,
  );
});

test("global search ignores slash inside editable fields", () => {
  assert.equal(
    shouldOpenGlobalSearch({
      key: "/",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: { tagName: "INPUT", isContentEditable: false },
    }),
    false,
  );
  assert.equal(
    shouldOpenGlobalSearch({
      key: "/",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: { tagName: "DIV", isContentEditable: true },
    }),
    false,
  );
});
