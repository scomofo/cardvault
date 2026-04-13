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
