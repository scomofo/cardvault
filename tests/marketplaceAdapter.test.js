import test from "node:test";
import assert from "node:assert/strict";
import { ShopifyAdapter } from "../src/server/integrations/marketplaces/shopifyAdapter.js";

test("generic marketplace sync preserves the channel status for crossposted listings", async () => {
  const adapter = new ShopifyAdapter();
  const result = await adapter.sync({
    id: "crossposted-listing",
    platform: "ebay",
    channel_status: "active",
    external_listing_id: "shopify-123",
    sold_price: 79.99,
  });

  assert.equal(result.status, "active");
  assert.equal(result.externalListingId, "shopify-123");
});

test("generic marketplace sync preserves ended channels instead of reviving them", async () => {
  const adapter = new ShopifyAdapter();
  const result = await adapter.sync({
    id: "ended-listing",
    platform: "ebay",
    channel_status: "ended",
    external_listing_id: "shopify-456",
  });

  assert.equal(result.status, "ended");
});
