import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildManualSaleFulfillment } from "../src/lib/salesViewState.js";
import { estimateSellingProceeds } from "../src/lib/sellingEstimate.js";
import { listingLifecycle } from "../src/lib/scanPublish.js";
import { reconcileSyncResult } from "../src/server/services/marketplaces/syncReconciler.js";

test("proceeds use the supplied fee/shipping assumptions and preserve losses and unknown prices", () => {
  assert.equal(estimateSellingProceeds({ price: 10, feeRate: 0.1, shippingCost: 2, buyerShipping: 1, packagingCost: 0.5 }), 7.4);
  assert.equal(estimateSellingProceeds({ price: 1, feeRate: 0.1, shippingCost: 3 }), -2.1);
  for (const price of [null, "", 0, -1, NaN, Infinity]) assert.equal(estimateSellingProceeds({ price, feeRate: 0.1 }), null);
  assert.equal(estimateSellingProceeds({ price: 10, feeRate: 2 }), null);
  assert.equal(estimateSellingProceeds({ price: 10, feeRate: 0.1, shippingCost: -1 }), null);
});

test("a local active flag is not proof of a live marketplace listing", () => {
  assert.equal(listingLifecycle({ id: "local", platform: "ebay", status: "active" }), "draft");
  assert.equal(listingLifecycle({ id: "local", platform: "ebay", status: "active", externalListingId: "ebay-local", publishStatus: "active" }), "draft");
  assert.equal(listingLifecycle({ id: "local", platform: "ebay", status: "active", externalListingId: "12345", publishStatus: "active" }), "live");
});

test("sync cannot reactivate an ended or sold channel", () => {
  for (const status of ["ended", "sold"]) {
    for (const remote of ["active", "revised", "draft"]) {
      const result = reconcileSyncResult({}, { status, external_listing_id: "123" }, { status: remote, externalListingId: "123" });
      assert.equal(result.safeToApply, false);
      assert.equal(result.hasBlockingConflict, true);
    }
  }
});

test("eBay publish claims survive overlaps, ambiguous failures and retries", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "cardvault-publish-safety-"));
  const previousPath = process.env.CARDVAULT_DB_PATH;
  process.env.CARDVAULT_DB_PATH = join(dir, "cards.db");
  const { initDB, run, get } = await import("../src/server/database.js");
  const { getMarketplaceAdapter } = await import("../src/server/integrations/marketplaces/marketplaceRegistry.js");
  const { publishListingToMarketplace } = await import("../src/server/services/marketplaces/publishService.js");
  const db = initDB();
  const adapter = getMarketplaceAdapter("ebay");
  const originalPublish = adapter.publish;
  const originalConnected = adapter.isConnected;
  t.after(async () => {
    adapter.publish = originalPublish; adapter.isConnected = originalConnected;
    db.close();
    if (previousPath === undefined) delete process.env.CARDVAULT_DB_PATH;
    else process.env.CARDVAULT_DB_PATH = previousPath;
    await rm(dir, { recursive: true, force: true });
  });
  for (const id of ["overlap", "ambiguous", "ended"]) {
    run("INSERT INTO user_items (id, name) VALUES (?,?)", [`item-${id}`, "Test"]);
    run("INSERT INTO listings (id, card_id, platform, status) VALUES (?,?,?,?)", [id, `item-${id}`, "ebay", id === "ended" ? "ended" : "draft"]);
  }
  adapter.isConnected = () => true;
  let calls = 0, release;
  adapter.publish = async () => {
    calls++;
    await new Promise((resolve) => { release = resolve; });
    return { externalListingId: "123456", status: "active", syncedAt: new Date().toISOString() };
  };
  const first = publishListingToMarketplace("overlap", "ebay");
  assert.equal(get("SELECT status FROM listing_channels WHERE listing_id = ?", ["overlap"]).status, "publishing");
  await assert.rejects(publishListingToMarketplace("overlap", "ebay", { confirmNotPublished: true }), /still in progress/);
  assert.equal(calls, 1);
  release();
  const live = await first;
  assert.equal(live.external_listing_id, "123456");
  assert.equal((await publishListingToMarketplace("overlap", "ebay")).id, live.id);
  assert.equal(calls, 1);
  adapter.isConnected = () => false;
  assert.equal((await publishListingToMarketplace("overlap", "ebay")).status, "active", "loss of connection cannot replace a live channel with a stub");
  adapter.isConnected = () => true;
  adapter.publish = async () => { calls++; throw new Error("response lost"); };
  await assert.rejects(publishListingToMarketplace("ambiguous", "ebay"), /response lost/);
  assert.equal(get("SELECT status FROM listing_channels WHERE listing_id = ?", ["ambiguous"]).status, "publish_unknown");
  await assert.rejects(publishListingToMarketplace("ambiguous", "ebay"), /needs review/);
  assert.equal(calls, 2);
  adapter.isConnected = () => false;
  await assert.rejects(publishListingToMarketplace("ambiguous", "ebay", { confirmNotPublished: true }), /Reconnect eBay/);
  assert.equal(get("SELECT status FROM listing_channels WHERE listing_id = ?", ["ambiguous"]).status, "publish_unknown");
  adapter.isConnected = () => true;
  adapter.publish = async () => { calls++; return { externalListingId: "654321", status: "active" }; };
  assert.equal((await publishListingToMarketplace("ambiguous", "ebay", { confirmNotPublished: true })).status, "active");
  assert.equal(calls, 3);
  await assert.rejects(publishListingToMarketplace("ended", "ebay"), /sold or ended/);
  assert.equal(calls, 3);
});

test("recording a sale with tracking does not imply dispatch", () => {
  let id = 0;
  const { sale, order } = buildManualSaleFulfillment({ idFactory: () => `id-${++id}`, listing: { id: "listing", cardId: "card", cardName: "Card", platform: "ebay", shipping: 2 }, card: {}, feeRate: 0.1, salePrice: 20, trackingNumber: "REAL-TRACKING" });
  assert.equal(order.fulfillmentStatus, "pending");
  assert.equal(sale.trackingNumber, "REAL-TRACKING");
});
