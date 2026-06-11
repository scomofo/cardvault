import test from "node:test";
import assert from "node:assert/strict";

import { selectConfiguredProviderService } from "../src/server/integrations/shipping/configuredProviderAdapter.js";

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
