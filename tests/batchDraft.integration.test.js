import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer.js";
import { newDraftEntry, buildDraftPayload } from "../src/lib/batchDraft.js";
const PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
async function post(baseUrl, path, body) {
  const response = await fetch(baseUrl + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
function payload(id = "new-card") {
  const entry = { ...newDraftEntry({ id, card: { name: "Example Player", condition: "near_mint", set: "Test", year: "2020", number: "12", parallel: "Gold", costBasis: 12 } }),
    frontImgId: `img_${id}_front`, backImgId: `img_${id}_back`, identityConfirmed: true, conditionConfirmed: true, price: "30", shippingCost: "2" };
  return buildDraftPayload(entry, "test-batch");
}
async function upload(baseUrl, body) {
  for (const id of [body.item.frontImgId, body.item.backImgId]) assert.equal((await post(baseUrl, `/api/images/${id}`, { dataUrl: PHOTO })).status, 201);
}

test("reviewed batch route atomically creates unpublished inventory and a draft, reusing retries", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-batch-draft-" });
  const body = payload(); await upload(baseUrl, body);
  const result = await post(baseUrl, "/api/listings/draft", body);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.listing.status, "draft"); assert.equal(result.body.listing.publishStatus, "draft");
  assert.equal(result.body.item.status, "inventory"); assert.equal(result.body.item.listingStatus, "draft");
  const repeated = await post(baseUrl, "/api/listings/draft", body);
  assert.equal(repeated.status, 200); assert.equal(repeated.body.reused, true);
  const items = await (await fetch(`${baseUrl}/api/items`)).json(), listings = await (await fetch(`${baseUrl}/api/listings`)).json();
  assert.equal(items.length, 1); assert.equal(listings.length, 1);
  assert.equal(listings[0].externalListingId, null);
  assert.equal(listings[0].shipping, 0);
  assert.equal(items[0].costBasis, 12);
});
test("missing photos or confirmation cannot leave a half-created item or listing", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-batch-block-" });
  const body = payload();
  assert.equal((await post(baseUrl, "/api/listings/draft", body)).status, 409);
  await upload(baseUrl, body);
  assert.equal((await post(baseUrl, "/api/listings/draft", { ...body, conditionConfirmed: false })).status, 400);
  assert.equal((await (await fetch(`${baseUrl}/api/items`)).json()).length, 0);
  assert.equal((await (await fetch(`${baseUrl}/api/listings`)).json()).length, 0);
});
test("existing inventory is reused without changing its costs, condition, notes or photos", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-batch-existing-" });
  const body = payload("existing"); await upload(baseUrl, body);
  assert.equal((await post(baseUrl, "/api/items", { ...body.item, costBasis: 123, notes: "Keep my notes" })).status, 201);
  const result = await post(baseUrl, "/api/listings/draft", { ...body, source: "inventory", item: { ...body.item, costBasis: 999, notes: "Should not overwrite" } });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.item.costBasis, 123); assert.equal(result.body.item.notes, "Keep my notes");
  assert.equal((await (await fetch(`${baseUrl}/api/items`)).json()).length, 1);
});
test("sold inventory and another workflow's listing block draft creation", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-batch-conflict-" });
  const body = payload("sold"); await upload(baseUrl, body);
  await post(baseUrl, "/api/items", { ...body.item, status: "sold" });
  assert.equal((await post(baseUrl, "/api/listings/draft", { ...body, source: "inventory" })).status, 409);
  const other = payload("has-draft"); await upload(baseUrl, other); await post(baseUrl, "/api/items", other.item);
  await post(baseUrl, "/api/listings", { ...other.draft, id: "another-draft" });
  assert.equal((await post(baseUrl, "/api/listings/draft", { ...other, source: "inventory" })).status, 409);
});
test("concurrent draft submissions produce only one listing and reject a stale item snapshot", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-batch-concurrent-" });
  const body = payload(); await upload(baseUrl, body);
  const results = await Promise.all([post(baseUrl, "/api/listings/draft", body), post(baseUrl, "/api/listings/draft", body)]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 201]);
  assert.equal((await (await fetch(`${baseUrl}/api/listings`)).json()).length, 1);
  const stale = payload("stale"); await upload(baseUrl, stale); await post(baseUrl, "/api/items", stale.item);
  assert.equal((await post(baseUrl, "/api/listings/draft", { ...stale, source: "inventory", expectedItemUpdatedAt: "old" })).status, 409);
});
test("draft route ignores injected publish metadata and rejects invalid prices", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-batch-validation-" });
  const body = payload(); await upload(baseUrl, body);
  for (const price of [null, "10", -1, 0]) {
    assert.equal((await post(baseUrl, "/api/listings/draft", { ...body, draft: { ...body.draft, startPrice: price } })).status, 400);
  }
  const result = await post(baseUrl, "/api/listings/draft", { ...body, item: { ...body.item, status: "listed" }, draft: { ...body.draft, status: "active", publishStatus: "active", externalListingId: "fake" } });
  assert.equal(result.status, 201);
  assert.equal(result.body.listing.status, "draft"); assert.equal(result.body.listing.externalListingId, null);
  assert.equal(result.body.item.status, "inventory");
});

test("an ended batch listing can be relisted without deleting history or cloning inventory", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-batch-relist-" });
  const original = payload("relist-card"); await upload(baseUrl, original);
  assert.equal((await post(baseUrl, "/api/listings/draft", original)).status, 201);
  const ended = await fetch(`${baseUrl}/api/listings/${original.draft.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...original.draft, status: "ended" }) });
  assert.equal(ended.status, 200);
  const card = await (await fetch(`${baseUrl}/api/items/relist-card`)).json();
  const entry = { ...newDraftEntry({ id: "relisting-attempt", card, source: "inventory" }),
    identityConfirmed: true, conditionConfirmed: true, price: "35", shippingCost: "2" };
  const body = buildDraftPayload(entry, "new-batch");
  const result = await post(baseUrl, "/api/listings/draft", body);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal((await post(baseUrl, "/api/listings/draft", body)).status, 200);
  const listings = await (await fetch(`${baseUrl}/api/listings`)).json();
  assert.equal(listings.length, 2);
  assert.equal(listings.find((listing) => listing.id === original.draft.id).status, "ended");
  assert.equal(listings.find((listing) => listing.id === "draft_relisting-attempt").status, "draft");
  assert.equal((await (await fetch(`${baseUrl}/api/items`)).json()).length, 1);
});
