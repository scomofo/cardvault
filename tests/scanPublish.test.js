import test from "node:test";
import assert from "node:assert/strict";

import {
  applyChannelToListing,
  getPublishTarget,
  isStubChannel,
  publishScanListing,
  summarizePublishOutcome,
} from "../src/lib/scanPublish.js";

test("getPublishTarget offers live eBay publish only when connected", () => {
  assert.deepEqual(getPublishTarget("ebay", { useServer: true, ebayConnected: true }), {
    marketplace: "ebay",
    label: "eBay",
    mode: "live",
  });
  assert.equal(getPublishTarget("ebay", { useServer: true, ebayConnected: false }), null);
});

test("getPublishTarget queues handoff marketplaces in server mode", () => {
  assert.deepEqual(getPublishTarget("comc", { useServer: true }), {
    marketplace: "comc",
    label: "COMC",
    mode: "handoff",
  });
  assert.deepEqual(getPublishTarget("consignment", { useServer: true }), {
    marketplace: "consignment",
    label: "Consignment",
    mode: "handoff",
  });
});

test("getPublishTarget returns null offline and for local-only platforms", () => {
  assert.equal(getPublishTarget("comc", { useServer: false }), null);
  assert.equal(getPublishTarget("ebay", { useServer: false, ebayConnected: true }), null);
  assert.equal(getPublishTarget("shopify", { useServer: true }), null);
  assert.equal(getPublishTarget("mercari", { useServer: true }), null);
});

test("isStubChannel matches the server's synthetic external id pattern", () => {
  const listingId = "abcdefghijklmnop";
  assert.equal(
    isStubChannel(
      { external_listing_id: "ebay-abcdefghijkl" },
      { marketplace: "ebay", listingId },
    ),
    true,
  );
  assert.equal(
    isStubChannel(
      { external_listing_id: "1234567890" },
      { marketplace: "ebay", listingId },
    ),
    false,
  );
});

test("summarizePublishOutcome reports handoff queues as success", () => {
  assert.deepEqual(
    summarizePublishOutcome(
      { status: "handoff_ready", external_listing_id: "comc-handoff-abc" },
      { marketplace: "comc", label: "COMC", listingId: "abc" },
    ),
    {
      type: "success",
      message: "Queued for COMC handoff — review and submit it from the Sales tab",
    },
  );
});

test("summarizePublishOutcome downgrades stub publishes to a warning", () => {
  const listingId = "abcdefghijklmnop";
  const summary = summarizePublishOutcome(
    { status: "active", external_listing_id: "ebay-abcdefghijkl" },
    { marketplace: "ebay", label: "eBay", listingId },
  );
  assert.equal(summary.type, "warning");
  assert.match(summary.message, /isn't connected/);
});

test("summarizePublishOutcome celebrates a real live publish with the external id", () => {
  assert.deepEqual(
    summarizePublishOutcome(
      { status: "active", external_listing_id: "1102938475" },
      { marketplace: "ebay", label: "eBay", listingId: "abcdefghijklmnop" },
    ),
    { type: "success", message: "Published to eBay (#1102938475)" },
  );
});

test("summarizePublishOutcome handles unknown statuses and missing channels", () => {
  assert.deepEqual(
    summarizePublishOutcome(
      { status: "pending" },
      { marketplace: "ebay", label: "eBay", listingId: "x" },
    ),
    { type: "info", message: "eBay publish status: pending" },
  );
  assert.equal(
    summarizePublishOutcome(null, { marketplace: "ebay", label: "eBay", listingId: "x" }).type,
    "error",
  );
});

test("applyChannelToListing maps snake_case channel rows onto the local listing", () => {
  const listing = { id: "l1", platform: "ebay", startPrice: 10 };
  assert.deepEqual(
    applyChannelToListing(listing, {
      status: "active",
      external_listing_id: "123",
      last_sync_at: "2026-07-08 12:00:00",
    }),
    {
      id: "l1",
      platform: "ebay",
      startPrice: 10,
      publishStatus: "active",
      externalListingId: "123",
      lastSyncAt: "2026-07-08 12:00:00",
    },
  );
});

test("publishScanListing creates the item, then the listing, then publishes", async () => {
  const calls = [];
  const channel = { status: "active" };
  const result = await publishScanListing({
    itemsAPI: { create: async (item) => calls.push(["item", item.id]) },
    listingsAPI: { create: async (record) => calls.push(["listing", record.id]) },
    marketplacesAPI: {
      publish: async (body) => {
        calls.push(["publish", body.listingId, body.marketplace]);
        return channel;
      },
    },
    item: { id: "item-1" },
    listingRecord: { id: "listing-1" },
    marketplace: "ebay",
  });
  assert.deepEqual(calls, [
    ["item", "item-1"],
    ["listing", "listing-1"],
    ["publish", "listing-1", "ebay"],
  ]);
  assert.equal(result, channel);
});

test("publishScanListing stops before publish when the listing create fails", async () => {
  const calls = [];
  await assert.rejects(
    publishScanListing({
      itemsAPI: { create: async () => calls.push("item") },
      listingsAPI: {
        create: async () => {
          throw new Error("listing create failed");
        },
      },
      marketplacesAPI: { publish: async () => calls.push("publish") },
      item: { id: "item-1" },
      listingRecord: { id: "listing-1" },
      marketplace: "ebay",
    }),
    /listing create failed/,
  );
  assert.deepEqual(calls, ["item"]);
});
