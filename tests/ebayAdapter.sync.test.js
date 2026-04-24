import test from "node:test";
import assert from "node:assert/strict";
import { EbayAdapter } from "../src/server/integrations/marketplaces/ebayAdapter.js";

test("eBay adapter sync enriches sold listings from fulfillment orders", async () => {
  class TestAdapter extends EbayAdapter {
    isConnected() {
      return true;
    }

    async fetchRemoteOrderForListing() {
      return {
        orderId: "ebay-order-123",
        pricingSummary: {
          total: { value: "114.98" },
          deliveryCost: { value: "9.99" },
          tax: { value: "5.00" },
        },
        paymentSummary: {
          totalDueSeller: { value: "114.98" },
        },
        buyer: {
          username: "buyer_sync",
          buyerRegistrationAddress: {
            contactAddress: {
              countryCode: "US",
              postalCode: "10001",
            },
          },
        },
        fulfillmentStartInstructions: [
          {
            shippingStep: {
              shipTo: {
                countryCode: "US",
                postalCode: "10001",
                city: "New York",
                stateOrProvince: "NY",
              },
            },
          },
        ],
        lineItems: [
          {
            lineItemId: "line-item-1",
            legacyItemId: "ebay-legacy-1",
            sku: "CV-local-listing",
            total: { value: "99.99" },
            deliveryCost: {
              shippingCost: { value: "9.99" },
            },
            taxes: [
              { amount: { value: "5.00" } },
            ],
          },
        ],
      };
    }
  }

  const adapter = new TestAdapter();
  const result = await adapter.sync({
    id: "local-listing",
    external_listing_id: "ebay-legacy-1",
  });

  assert.equal(result.status, "sold");
  assert.equal(result.externalListingId, "ebay-legacy-1");
  assert.equal(result.payload.externalOrderId, "ebay-order-123");
  assert.equal(result.payload.buyerHandle, "buyer_sync");
  assert.equal(result.payload.salePrice, 99.99);
  assert.equal(result.payload.shippingCharge, 9.99);
  assert.equal(result.payload.taxCollected, 5);
  assert.equal(result.payload.payoutAmount, 114.98);
  assert.equal(result.payload.shippingAddress.countryCode, "US");
  assert.equal(result.payload.shippingAddress.postalCode, "10001");
});

test("eBay adapter sync keeps listing active when no fulfillment order matches", async () => {
  class TestAdapter extends EbayAdapter {
    isConnected() {
      return true;
    }

    async fetchRemoteOrderForListing() {
      return null;
    }
  }

  const adapter = new TestAdapter();
  const result = await adapter.sync({
    id: "local-listing",
    external_listing_id: "ebay-legacy-1",
    listing_title: "Active listing",
  });

  assert.equal(result.status, "active");
  assert.equal(result.payload.listing_title, "Active listing");
});
