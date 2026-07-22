import test from "node:test";
import assert from "node:assert/strict";

import { catalogCardToItemPatch, describeCatalogCard } from "../src/lib/identificationDisplay.js";

test("describeCatalogCard reads raw catalog_cards rows", () => {
  assert.deepEqual(
    describeCatalogCard({
      player_name: "Wayne Gretzky",
      set_name: "O-Pee-Chee",
      card_number: "120",
      year: "1980",
    }),
    {
      name: "Wayne Gretzky",
      set: "O-Pee-Chee",
      number: "120",
      year: "1980",
      label: "Wayne Gretzky — 1980 O-Pee-Chee — #120",
    },
  );
});

test("describeCatalogCard tolerates camelCase and client shapes", () => {
  const described = describeCatalogCard({ name: "Connor Bedard", set: "Upper Deck", number: "451" });
  assert.equal(described.name, "Connor Bedard");
  assert.equal(described.label, "Connor Bedard — Upper Deck — #451");
  assert.equal(describeCatalogCard(null), null);
});

test("describeCatalogCard builds a label from partial data", () => {
  assert.equal(describeCatalogCard({ player_name: "Sidney Crosby" }).label, "Sidney Crosby");
  assert.equal(describeCatalogCard({ set_name: "SP Authentic", year: 2005 }).label, "2005 SP Authentic");
});

test("catalogCardToItemPatch maps fields and never blanks with empty values", () => {
  assert.deepEqual(
    catalogCardToItemPatch({
      player_name: "Wayne Gretzky",
      set_name: "O-Pee-Chee",
      card_number: "120",
      year: 1980,
      parallel_name: "",
      rarity: "",
    }),
    { name: "Wayne Gretzky", set: "O-Pee-Chee", number: "120", year: "1980" },
  );
  assert.deepEqual(catalogCardToItemPatch(null), {});
});

test("catalogCardToItemPatch includes parallel and rarity when present", () => {
  const patch = catalogCardToItemPatch({
    player_name: "Auston Matthews",
    parallel_name: "Young Guns",
    rarity: "SP",
  });
  assert.equal(patch.parallel, "Young Guns");
  assert.equal(patch.rarity, "SP");
});
