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
import {
  buildCanadaPostCreateShipmentPayload,
  parseCanadaPostCreateShipmentResponse,
  validateCanadaPostShipmentReadiness,
} from "../src/server/integrations/shipping/canadaPostNativeAdapter.js";

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

test("Canada Post native adapter reports missing shipment requirements", () => {
  const readiness = validateCanadaPostShipmentReadiness({
    metadata: {},
    rate: {},
    service: {},
    shipment: { country: "CA", weightOz: 0 },
  });

  assert.equal(readiness.ok, false);
  assert.deepEqual(readiness.missing, [
    "customerNumber",
    "contractId",
    "originPostalCode",
    "originAddress",
    "destinationPostalCode",
    "serviceCode",
    "packageDimensions",
    "weightOz",
  ]);
  assert.match(readiness.message, /missing customer number/i);
});

test("Canada Post native adapter rejects incomplete origin address", () => {
  const readiness = validateCanadaPostShipmentReadiness({
    metadata: {
      customerNumber: "1234567",
      contractId: "0045678",
      originPostalCode: "T2P 1J9",
      shipFrom: { city: "Calgary" },
      packageDimensionsCm: { length: 16, width: 11, height: 1 },
    },
    rate: { serviceCode: "DOM.EP" },
    service: { serviceCode: "DOM.EP" },
    shipment: { destinationPostalCode: "K1A 0B1", weightOz: 6 },
  });

  assert.equal(readiness.ok, false);
  assert.deepEqual(readiness.missing, ["originAddress"]);
});

test("Canada Post native adapter builds Create Shipment XML from validated context", () => {
  const payload = buildCanadaPostCreateShipmentPayload({
    metadata: {
      customerNumber: "1234567",
      contractId: "0045678",
      originPostalCode: "T2P 1J9",
      shipFrom: {
        name: "CardVault",
        addressLine1: "1 Arena Way",
        city: "Calgary",
        province: "AB",
        postalCode: "T2P 1J9",
      },
      packageDimensionsCm: { length: 16, width: 11, height: 1 },
    },
    rate: { serviceCode: "DOM.EP" },
    service: { service: "Canada Post Expedited Parcel", serviceCode: "DOM.EP" },
    shipment: {
      shipmentId: "shipment-native",
      country: "CA",
      destinationPostalCode: "K1A 0B1",
      weightOz: 6,
      destination: {
        name: "Buyer Name",
        addressLine1: "80 Wellington St",
        city: "Ottawa",
        province: "ON",
        postalCode: "K1A 0B1",
      },
    },
  });

  assert.equal(payload.preflight.ok, true);
  assert.equal(payload.endpointPath, "/rs/1234567/1234567/shipment");
  assert.match(payload.xml, /<customer-request-id>shipment-native<\/customer-request-id>/);
  assert.match(payload.xml, /<service-code>DOM\.EP<\/service-code>/);
  assert.match(payload.xml, /<contract-id>0045678<\/contract-id>/);
  assert.match(payload.xml, /<requested-shipping-point>T2P1J9<\/requested-shipping-point>/);
  assert.match(payload.xml, /<postal-code>K1A0B1<\/postal-code>/);
  assert.match(payload.xml, /<weight>0\.170<\/weight>/);
});

test("Canada Post native adapter parses Create Shipment response links", () => {
  const parsed = parseCanadaPostCreateShipmentResponse(`<?xml version="1.0" encoding="UTF-8"?>
    <shipment-info xmlns="http://www.canadapost.ca/ws/shipment-v8">
      <shipment-id>123456789</shipment-id>
      <tracking-pin>CP123456789CA</tracking-pin>
      <links>
        <link rel="self" href="https://example.test/shipment/123456789" media-type="application/vnd.cpc.shipment-v8+xml"/>
        <link rel="label" href="https://example.test/artifact/label-1" media-type="application/pdf"/>
      </links>
    </shipment-info>`);

  assert.equal(parsed.shipmentId, "123456789");
  assert.equal(parsed.trackingNumber, "CP123456789CA");
  assert.equal(parsed.labelUrl, "https://example.test/artifact/label-1");
});
