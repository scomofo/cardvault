import test from "node:test";
import assert from "node:assert/strict";
import { verifyCandidateAgainstEbay } from "../src/server/services/metadata/ebayVerifier.js";

const sampleCard = {
  player_name: "Wayne Gretzky",
  set_name: "O-Pee-Chee Platinum",
  year: "2018",
  card_number: "50",
  parallel_name: "Red Prism",
};

function mockSearch(result) {
  return async () => result;
}

test("verifier boosts candidate when hits exceed threshold", async () => {
  const verification = await verifyCandidateAgainstEbay(sampleCard, {
    search: mockSearch({
      total: 12,
      items: [{ title: "2018 OPC Platinum Gretzky #50 Red Prism", price: 42, currency: "USD", url: "https://ebay.example/1" }],
    }),
  });
  assert.ok(verification);
  assert.equal(verification.hits, 12);
  assert.ok(verification.adjustment > 0, "expected positive adjustment for many hits");
  assert.equal(verification.sampleTitle, "2018 OPC Platinum Gretzky #50 Red Prism");
  assert.equal(verification.samplePrice, 42);
  assert.match(verification.query, /Wayne Gretzky/);
  assert.match(verification.query, /#50/);
});

test("verifier computes low/mid/high price range from active listings", async () => {
  const verification = await verifyCandidateAgainstEbay(sampleCard, {
    search: mockSearch({
      total: 5,
      items: [
        { title: "a", price: 30, currency: "USD", url: null },
        { title: "b", price: 45, currency: "USD", url: null },
        { title: "c", price: 60, currency: "USD", url: null },
        { title: "d", price: 80, currency: "USD", url: null },
        { title: "e", price: 110, currency: "USD", url: null },
      ],
    }),
  });
  assert.ok(verification.priceRange);
  assert.equal(verification.priceRange.low, 30);
  assert.equal(verification.priceRange.high, 110);
  assert.equal(verification.priceRange.mid, 60);
  assert.equal(verification.priceRange.sampleSize, 5);
  assert.equal(verification.priceRange.currency, "USD");
});

test("verifier returns null priceRange when no priced listings exist", async () => {
  const verification = await verifyCandidateAgainstEbay(sampleCard, {
    search: mockSearch({
      total: 2,
      items: [
        { title: "a", price: null, currency: null, url: null },
        { title: "b", price: 0, currency: null, url: null },
      ],
    }),
  });
  assert.ok(verification);
  assert.equal(verification.priceRange, null);
});

test("verifier penalizes candidate when no hits are found", async () => {
  const verification = await verifyCandidateAgainstEbay(sampleCard, {
    search: mockSearch({ total: 0, items: [] }),
  });
  assert.ok(verification);
  assert.equal(verification.hits, 0);
  assert.ok(verification.adjustment < 0, "expected negative adjustment for zero hits");
});

test("verifier returns neutral adjustment for ambiguous hit count", async () => {
  const verification = await verifyCandidateAgainstEbay(sampleCard, {
    search: mockSearch({ total: 1, items: [{ title: "noisy match", price: null, currency: null, url: null }] }),
  });
  assert.ok(verification);
  assert.equal(verification.hits, 1);
  assert.equal(verification.adjustment, 0);
});

test("verifier swallows search failures and returns null", async () => {
  const verification = await verifyCandidateAgainstEbay(sampleCard, {
    search: async () => {
      throw new Error("network boom");
    },
  });
  assert.equal(verification, null);
});

test("verifier returns null when card has no queryable fields", async () => {
  const verification = await verifyCandidateAgainstEbay({}, {
    search: mockSearch({ total: 10, items: [] }),
  });
  assert.equal(verification, null);
});
