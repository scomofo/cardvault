import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { startTestServer } from "./helpers/testServer.js";

const reviewed = { listingTitle: "Reviewed hockey card", listingDescription: "See the photographed card condition.", condition: "excellent", startPrice: 25, shipping: 0 };
async function request(baseUrl, path, method = "GET", body) {
  return fetch(`${baseUrl}/api${path}`, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
}

test("draft review repairs old content, saves photos and preserves card data", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-draft-review-" });
  assert.equal((await request(baseUrl, "/items", "POST", { id: "card", name: "Hockey card", costBasis: 12, storageLocation: "Box A", status: "inventory" })).status, 201);
  assert.equal((await request(baseUrl, "/listings", "POST", { id: "draft", cardId: "card", platform: "ebay", startPrice: 10, status: "draft" })).status, 201);
  const before = await request(baseUrl, "/listings/draft/ebay-readiness");
  assert.equal(before.status, 200);
  assert.equal((await before.json()).ready, false);
  assert.equal((await request(baseUrl, "/images/front", "POST", { dataUrl: "data:image/png;base64,aGVsbG8=" })).status, 201);
  const response = await request(baseUrl, "/listings/draft/review", "POST", { ...reviewed, frontImgId: "front" });
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.listing.listingTitle, reviewed.listingTitle);
  assert.equal(saved.listing.shipping, 0);
  assert.equal(saved.item.condition, "excellent");
  assert.equal(saved.item.costBasis, 12);
  assert.equal(saved.item.storageLocation, "Box A");
  assert.equal(saved.item.status, "inventory");
  const readiness = await request(baseUrl, "/listings/draft/ebay-readiness");
  assert.equal(readiness.status, 200);
  assert.deepEqual((await readiness.json()).photos, { front: true, back: false });
  assert.equal((await request(baseUrl, "/listings/draft/review", "POST", { ...reviewed, backImgId: "missing" })).status, 400);
});

test("delayed draft sync cannot erase channel publication state and locked drafts reject review", async (t) => {
  const { baseUrl, dbPath } = await startTestServer(t, { dirPrefix: "cardvault-draft-sync-" });
  const db = new Database(dbPath);
  t.after(() => db.close());
  assert.equal((await request(baseUrl, "/items", "POST", { id: "card", name: "Card", status: "inventory" })).status, 201);
  assert.equal((await request(baseUrl, "/listings", "POST", { id: "draft", cardId: "card", platform: "ebay", startPrice: 10, status: "draft" })).status, 201);
  db.prepare("INSERT INTO listing_channels (id,listing_id,marketplace,status) VALUES (?,?,?,?)").run("channel", "draft", "ebay", "publishing");
  for (const status of ["publishing", "publish_unknown", "active", "sold"]) {
    const externalId = ["active", "sold"].includes(status) ? "123456789" : null;
    db.prepare("UPDATE listing_channels SET status=?, external_listing_id=?, publish_error=? WHERE id='channel'").run(status, externalId, "Provider evidence");
    db.prepare("UPDATE listings SET status=?, publish_status=?, publish_error=?, external_listing_id=? WHERE id='draft'").run(["active", "sold"].includes(status) ? status : "draft", status, "Provider evidence", externalId);
    const stale = await request(baseUrl, "/listings/draft", "PUT", { cardId: "card", platform: "ebay", status: "draft", publishStatus: "draft", externalListingId: null, publishError: null, startPrice: 10 });
    assert.equal(stale.status, 200);
    const listing = await stale.json();
    assert.equal(listing.publishStatus, status);
    assert.equal(listing.publishError, "Provider evidence");
    if (externalId) assert.equal(listing.externalListingId, externalId);
    assert.equal((await request(baseUrl, "/listings/draft/review", "POST", reviewed)).status, 409);
  }
});


test("manual sale remains sold after delayed draft sync despite a draft channel", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-review-manual-sale-" });
  assert.equal((await request(baseUrl, "/items", "POST", { id: "card", name: "Card" })).status, 201);
  assert.equal((await request(baseUrl, "/listings", "POST", { id: "draft", cardId: "card", platform: "ebay", startPrice: 10, status: "draft" })).status, 201);
  assert.equal((await request(baseUrl, "/marketplaces/publish", "POST", { listingId: "draft", marketplace: "ebay" })).status, 200);
  assert.equal((await request(baseUrl, "/sales", "POST", { id: "sale", cardId: "card", listingId: "draft", platform: "ebay", salePrice: 25, date: "2026-09-08" })).status, 201);
  const response = await request(baseUrl, "/listings/draft", "PUT", { cardId: "card", platform: "ebay", status: "draft", publishStatus: "draft", soldPrice: null, soldDate: null });
  assert.equal(response.status, 200);
  const listing = await response.json();
  assert.equal(listing.status, "sold");
  assert.equal(listing.publishStatus, "sold");
  assert.equal(listing.soldPrice, 25);
  assert.equal(listing.soldDate, "2026-09-08");
  const items = await request(baseUrl, "/items");
  assert.equal(items.status, 200);
  assert.equal((await items.json()).find((item) => item.id === "card").status, "sold");
});
