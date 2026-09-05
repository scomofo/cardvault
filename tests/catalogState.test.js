import test from "node:test";
import assert from "node:assert/strict";
import { cardEstimate, catalogStatus, filterCatalog, summarizeCatalog } from "../src/lib/catalogState.js";

test("portfolio totals exclude sold cards and compare only owned cards with value and cost", () => {
  const summary = summarizeCatalog([
    { priceEstimate: { mid: "150" }, costBasis: "100" },
    { status: "listed", priceEstimate: { mid: 40 }, costBasis: 50 },
    { status: "sold", priceEstimate: { mid: 1000 }, costBasis: 800, listedOn: ["ebay"] },
    { costBasis: 200 },
    { priceEstimate: { mid: 20 }, costBasis: "" },
    { priceEstimate: { mid: 10 }, costBasis: 0 },
  ]);
  assert.deepEqual(summary, { owned: 5, listed: 1, sold: 1, priced: 4, value: 220, gain: 50, comparable: 3 });
});

test("unpriced, malformed, and zero estimates are distinct", () => {
  for (const mid of [undefined, null, "", " ", "unknown", "12abc", Infinity, -10]) {
    assert.equal(cardEstimate({ priceEstimate: { mid } }), null);
  }
  assert.equal(cardEstimate({ priceEstimate: { mid: "0" } }), 0);
  assert.deepEqual(summarizeCatalog([]), { owned: 0, listed: 0, sold: 0, priced: 0, value: 0, gain: 0, comparable: 0 });
  assert.equal(summarizeCatalog([{ priceEstimate: { mid: 0 }, costBasis: 10 }]).gain, -10);
});

test("listed status handles local and server records with sold taking precedence", () => {
  assert.equal(catalogStatus({ listedOn: ["ebay"] }), "listed");
  assert.equal(catalogStatus({ listingStatus: "listed" }), "listed");
  assert.equal(catalogStatus({ status: "sold", listingStatus: "listed" }), "sold");
  assert.equal(catalogStatus({ listedOn: "[]" }), "inventory");
});

test("binder, status, and multi-field search combine without mutating the collection", () => {
  const cards = Object.freeze([
    Object.freeze({ id: "owned", name: "Connor McDavid", year: 2015, binder: "All" }),
    Object.freeze({ id: "sold", name: "Connor McDavid", year: 2015, binder: "All", status: "sold" }),
    Object.freeze({ id: "listed", name: "Connor McDavid", year: 2015, binder: "Hockey", listedOn: ["ebay"] }),
  ]);
  assert.deepEqual(filterCatalog(cards, { binder: "All", status: "owned", search: " McDavid   2015 " }).map((c) => c.id), ["owned"]);
  assert.deepEqual(filterCatalog(cards, { status: "listed" }).map((c) => c.id), ["listed"]);
  assert.deepEqual(filterCatalog(cards, { status: "sold" }).map((c) => c.id), ["sold"]);
  assert.equal(filterCatalog(cards, { search: "no such card" }).length, 0);
  assert.equal(filterCatalog(cards, { search: "   " }).length, 3);
});

test("value sorting keeps unpriced cards last, with a real zero estimate first when ascending", () => {
  const cards = [
    { id: "unknown" },
    { id: "high", priceEstimate: { mid: 100 } },
    { id: "zero", priceEstimate: { mid: 0 } },
    { id: "low", priceEstimate: { mid: "10" } },
  ];
  assert.deepEqual(filterCatalog(cards, { sort: "value_asc" }).map((c) => c.id), ["zero", "low", "high", "unknown"]);
  assert.deepEqual(filterCatalog(cards, { sort: "value_desc" }).map((c) => c.id), ["high", "low", "zero", "unknown"]);
  assert.equal(cards[0].id, "unknown");
});

test("date sorting handles missing and invalid dates without changing the original order", () => {
  const cards = [
    { id: "invalid", createdAt: "not a date" },
    { id: "old", createdAt: "2025-01-01" },
    { id: "new", createdAt: "2026-01-01" },
  ];
  assert.deepEqual(filterCatalog(cards).map((c) => c.id), ["new", "old", "invalid"]);
  assert.deepEqual(filterCatalog(cards, { sort: "date_asc" }).map((c) => c.id), ["old", "new", "invalid"]);
  assert.equal(cards[0].id, "invalid");
});

test("name sorting is case-insensitive and handles card numbers naturally", () => {
  const cards = [{ name: "Card 10" }, { name: "card 2" }, { name: "Alpha" }];
  assert.deepEqual(filterCatalog(cards, { sort: "name_asc" }).map((c) => c.name), ["Alpha", "card 2", "Card 10"]);
});
