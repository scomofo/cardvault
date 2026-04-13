import test from "node:test";
import assert from "node:assert/strict";
import { fetchEbayBrowsePrice } from "../src/server/services/pricing/ebayBrowsePrice.js";

const sampleItem = {
  player_name: "Wayne Gretzky",
  card_set: "O-Pee-Chee Platinum",
  year: "2018",
  card_number: "50",
  parallel: "Red Prism",
};

function mockSearch(result) {
  return async () => result;
}

test("fetchEbayBrowsePrice normalizes active listings into a pricing snapshot", async () => {
  const snapshot = await fetchEbayBrowsePrice(sampleItem, {
    search: mockSearch({
      total: 5,
      items: [
        { title: "2018 OPC Platinum Gretzky #50 Red Prism", price: 30, currency: "USD", url: "https://ebay.example/a" },
        { title: "Gretzky Red Prism #50", price: 45, currency: "USD", url: "https://ebay.example/b" },
        { title: "Red Prism Gretzky", price: 60, currency: "USD", url: "https://ebay.example/c" },
        { title: "OPC Platinum Red Prism 50", price: 80, currency: "USD", url: "https://ebay.example/d" },
        { title: "Gretzky Platinum Red Prism", price: 110, currency: "USD", url: "https://ebay.example/e" },
      ],
    }),
  });

  assert.ok(snapshot);
  assert.equal(snapshot.source, "ebay-browse-active");
  assert.equal(snapshot.lowPriceCents, 3000);
  assert.equal(snapshot.highPriceCents, 11000);
  assert.equal(snapshot.marketPriceCents, 6000, "market price should track median");
  assert.equal(snapshot.lastCompPriceCents, 6000, "last comp also tracks median for active data");
  assert.equal(snapshot.averagePriceCents, 6500);
  assert.equal(snapshot.sampleSize, 5);
  assert.equal(snapshot.comps.length, 5);
  assert.equal(snapshot.comps[0].conditionBucket, "raw-active");
});

test("fetchEbayBrowsePrice returns null when no priced listings exist", async () => {
  const snapshot = await fetchEbayBrowsePrice(sampleItem, {
    search: mockSearch({
      total: 2,
      items: [
        { title: "a", price: null, currency: null, url: null },
        { title: "b", price: 0, currency: null, url: null },
      ],
    }),
  });
  assert.equal(snapshot, null);
});

test("fetchEbayBrowsePrice returns null when the item has no queryable metadata", async () => {
  const snapshot = await fetchEbayBrowsePrice({}, {
    search: mockSearch({ total: 10, items: [{ title: "x", price: 20, currency: "USD", url: null }] }),
  });
  assert.equal(snapshot, null);
});

test("fetchEbayBrowsePrice swallows search failures and returns null", async () => {
  const snapshot = await fetchEbayBrowsePrice(sampleItem, {
    search: async () => {
      throw new Error("network boom");
    },
  });
  assert.equal(snapshot, null);
});

test("fetchEbayBrowsePrice filters zero and negative prices before summarizing", async () => {
  const snapshot = await fetchEbayBrowsePrice(sampleItem, {
    search: mockSearch({
      total: 5,
      items: [
        { title: "a", price: 0, currency: "USD", url: null },
        { title: "b", price: -1, currency: "USD", url: null },
        { title: "c", price: 20, currency: "USD", url: null },
        { title: "d", price: 40, currency: "USD", url: null },
        { title: "e", price: null, currency: "USD", url: null },
      ],
    }),
  });
  assert.ok(snapshot);
  assert.equal(snapshot.sampleSize, 2);
  assert.equal(snapshot.lowPriceCents, 2000);
  assert.equal(snapshot.highPriceCents, 4000);
});
