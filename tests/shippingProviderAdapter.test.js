import test from "node:test";
import assert from "node:assert/strict";

import {
  purchaseConfiguredProviderService,
  selectConfiguredProviderService,
} from "../src/server/integrations/shipping/configuredProviderAdapter.js";
import {
  registerShippingProviderClient,
  resetShippingProviderClientsForTests,
} from "../src/server/integrations/shipping/providerClientRegistry.js";

test("configured shipping provider adapter normalizes purchased label metadata", () => {
  const service = selectConfiguredProviderService(
    {
      provider: "Canada Post",
      metadata: JSON.stringify({
        rates: [{
          service: "Canada Post Expedited Parcel",
          serviceCode: "DOM.EP",
          countries: ["CA"],
          maxWeightOz: 8,
          cost: 9.75,
          tracking: true,
          labelPurchase: {
            labelStatus: "purchased",
            trackingNumber: "CP-PURCHASED-123",
            labelUrl: "labels/{provider}/{trackingNumber}/{shipmentId}.pdf",
          },
        }],
      }),
    },
    {
      country: "CA",
      salePrice: 129.99,
      weightOz: 6,
      shipmentId: "shipment-123",
    },
  );

  assert.equal(service.carrier, "Canada Post");
  assert.equal(service.service, "Canada Post Expedited Parcel");
  assert.equal(service.serviceCode, "DOM.EP");
  assert.equal(service.cost, 9.75);
  assert.equal(service.tracking, true);
  assert.equal(service.trackingNumber, "CP-PURCHASED-123");
  assert.equal(service.labelStatus, "purchased");
  assert.equal(service.shipmentStatus, "shipped");
  assert.equal(service.labelUrl, "labels/canada-post/CP-PURCHASED-123/shipment-123.pdf");
  assert.equal(service.source, "provider_connection");
  assert.equal(Object.hasOwn(service, "api_key"), false);
});

test("configured shipping provider adapter returns null when no rates match", () => {
  const service = selectConfiguredProviderService(
    {
      provider: "Canada Post",
      metadata: {
        rates: [{
          service: "Canada Post Lettermail",
          countries: ["CA"],
          maxWeightOz: 3,
          cost: 1.94,
        }],
      },
    },
    {
      country: "US",
      salePrice: 20,
      weightOz: 6,
      shipmentId: "shipment-456",
    },
  );

  assert.equal(service, null);
});

test("configured shipping provider adapter purchases labels through a registered provider client", async () => {
  resetShippingProviderClientsForTests();
  let purchaseInput = null;
  registerShippingProviderClient("unit-test-client", {
    async purchaseLabel(input) {
      purchaseInput = input;
      return {
        labelStatus: "purchased",
        trackingNumber: "LIVE-TRACK-123",
        labelUrl: "labels/live/{trackingNumber}/{shipmentId}.pdf",
      };
    },
  });

  const service = await purchaseConfiguredProviderService(
    {
      provider: "Canada Post",
      api_key: "secret-provider-key",
      metadata: {
        providerClient: "unit-test-client",
        rates: [{
          service: "Canada Post Expedited Parcel",
          serviceCode: "DOM.EP",
          countries: ["CA"],
          maxWeightOz: 8,
          cost: 9.75,
          tracking: true,
        }],
      },
    },
    {
      country: "CA",
      salePrice: 129.99,
      weightOz: 6,
      shipmentId: "shipment-live",
      packageType: "card_mailer",
      destinationPostalCode: "T2P",
    },
  );

  assert.equal(service.labelStatus, "purchased");
  assert.equal(service.trackingNumber, "LIVE-TRACK-123");
  assert.equal(service.labelUrl, "labels/live/LIVE-TRACK-123/shipment-live.pdf");
  assert.equal(purchaseInput.connection.api_key, "secret-provider-key");
  assert.equal(purchaseInput.service.serviceCode, "DOM.EP");
  assert.equal(purchaseInput.shipment.destinationPostalCode, "T2P");

  resetShippingProviderClientsForTests();
});
