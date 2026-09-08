import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer.js";
import { saveReviewedListingDrafts } from "../src/lib/sellerWorkflow.js";

test("reviewed batch drafts recover a lost server response without duplicate listings", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-seller-workflow-" });
  const post = async (path, body) => {
    const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.ok([200, 201].includes(response.status), `Unexpected status ${response.status}`);
    return response.json();
  };
  let loseResponse = true;
  let checkpoint;
  const options = {
    selections: [{ cardId: "batch-a", price: "30.50", condition: "excellent" }, { cardId: "batch-b", price: "12", condition: "good" }],
    catalog: [{ id: "batch-a", name: "Wayne Gretzky", set: "O-Pee-Chee", status: "inventory" }, { id: "batch-b", name: "Mark Messier", status: "inventory" }],
    listings: [], shipping: "3.50", useServer: true, ids: new Map(), idFactory: (() => { let count = 0; return () => `seller-draft-${++count}`; })(),
    persistIds: (entries) => { checkpoint = JSON.stringify(entries); },
    itemsAPI: { create: (item) => post("/api/items", item) },
    listingsAPI: { create: async (listing) => { const saved = await post("/api/listings", listing); if (loseResponse && listing.cardId === "batch-b") throw new Error("Response lost after commit"); return saved; } },
    onSaved: () => {},
  };
  const first = await saveReviewedListingDrafts(options);
  assert.equal(first.saved.length, 1);
  assert.equal(first.failed.length, 1);
  loseResponse = false;
  const retry = await saveReviewedListingDrafts({ ...options, listings: first.saved, ids: new Map(JSON.parse(checkpoint)) });
  assert.equal(retry.saved.length, 1);
  const listingsResponse = await fetch(`${baseUrl}/api/listings`);
  assert.equal(listingsResponse.status, 200);
  const listings = await listingsResponse.json();
  assert.equal(listings.length, 2);
  assert.ok(listings.every((listing) => listing.status === "draft" && !listing.externalListingId));
  assert.equal(listings.find((listing) => listing.cardId === "batch-a").startPrice, 30.5);
  const itemsResponse = await fetch(`${baseUrl}/api/items`);
  assert.equal(itemsResponse.status, 200);
  const items = await itemsResponse.json();
  assert.equal(items.find((item) => item.id === "batch-a").condition, "excellent");
  assert.ok(items.every((item) => item.status === "inventory"));
});
