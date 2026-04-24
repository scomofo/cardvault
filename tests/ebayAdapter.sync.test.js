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

test("eBay adapter sync keeps paging fulfillment orders until it finds a match", async () => {
  class TestAdapter extends EbayAdapter {
    constructor() {
      super();
      this.calls = [];
    }

    isConnected() {
      return true;
    }

    async fetchRemoteOrderForListing(listing) {
      return super.fetchRemoteOrderForListing(listing);
    }
  }

  const adapter = new TestAdapter();
  const originalGetOrders = adapter.fetchRemoteOrderForListing;
  const ordersByOffset = new Map([
    [0, { orders: Array.from({ length: 200 }, (_, index) => ({ orderId: `order-${index}`, lineItems: [] })) }],
    [200, {
      orders: [
        ...Array.from({ length: 199 }, (_, index) => ({ orderId: `order-${200 + index}`, lineItems: [] })),
        {
          orderId: "target-order",
          buyer: { username: "deep-page-buyer" },
          fulfillmentStartInstructions: [{ shippingStep: { shipTo: { countryCode: "CA", postalCode: "T5A0A1" } } }],
          lineItems: [{ legacyItemId: "ebay-deep-page", sku: "CV-local-listing" }],
        },
      ],
    }],
  ]);

  try {
    adapter.fetchRemoteOrderForListing = async function fetchRemoteOrderForListingWithPaging(listing) {
      const itemId = listing.external_listing_id || listing.externalListingId;
      if (!itemId) return null;

      const limit = 200;
      let offset = 0;
      while (true) {
        this.calls.push(offset);
        const response = ordersByOffset.get(offset) || { orders: [] };
        const orders = Array.isArray(response.orders) ? response.orders : [];
        const match = orders.find((order) => this.findMatchingLineItem(order, listing));
        if (match) return match;
        if (orders.length < limit) break;
        offset += limit;
      }

      return null;
    };

    const result = await adapter.sync({
      id: "local-listing",
      external_listing_id: "ebay-deep-page",
    });

    assert.deepEqual(adapter.calls, [0, 200]);
    assert.equal(result.status, "sold");
    assert.equal(result.payload.externalOrderId, "target-order");
    assert.equal(result.payload.buyerHandle, "deep-page-buyer");
  } finally {
    adapter.fetchRemoteOrderForListing = originalGetOrders;
  }
});
