import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("server-backed batch saves apply created cards to the current catalog", async () => {
  const batchView = await readFile(new URL("../src/components/BatchView.jsx", import.meta.url), "utf8");

  assert.match(batchView, /const\s+result\s*=\s*await\s+itemsAPI\.bulkCreate\(items\)/);
  assert.match(batchView, /setCatalog\(\(p\)\s*=>\s*\[\.\.\.\(result\.created\s*\|\|\s*items\)/s);
});

test("dealer mode listing generation uses the selected export platform", async () => {
  const dealerModeView = await readFile(new URL("../src/components/DealerModeView.jsx", import.meta.url), "utf8");

  assert.match(
    dealerModeView,
    /automationAPI\.generateListings\(\{\s*itemIds,\s*platform:\s*exportPlatform\s*\}\)/s,
  );
});

test("dealer mode select all is based on filtered item membership", async () => {
  const dealerModeView = await readFile(new URL("../src/components/DealerModeView.jsx", import.meta.url), "utf8");

  assert.match(
    dealerModeView,
    /filtered\.length\s*>\s*0\s*&&\s*filtered\.every\(\(c\)\s*=>\s*selected\.has\(c\.id\)\)/,
  );
  assert.doesNotMatch(dealerModeView, /selected\.size\s*===\s*filtered\.length/);
});

test("dealer mode selected listing export tolerates missing listings while loading", async () => {
  const dealerModeView = await readFile(new URL("../src/components/DealerModeView.jsx", import.meta.url), "utf8");

  assert.match(
    dealerModeView,
    /return\s+\(listings\s*\|\|\s*\[\]\)\s*\.\s*filter\(/,
  );
});

test("settings exposes shipping provider connection management", async () => {
  const api = await readFile(new URL("../src/lib/api.js", import.meta.url), "utf8");
  const settings = await readFile(new URL("../src/components/Settings.jsx", import.meta.url), "utf8");

  assert.match(api, /export const shippingProvidersAPI\s*=/);
  assert.match(api, /shipping-provider-connections/);
  assert.match(settings, /ShippingProviderConnectionsSection/);
  assert.match(settings, /shippingProvidersAPI\.connections\(\)/);
  assert.match(settings, /shippingProvidersAPI\.connect\(newConn/);
  assert.match(settings, /shippingProvidersAPI\.test\(conn\.id/);
  assert.match(settings, /labelPurchaseUrl/);
  assert.match(settings, /apiKeyHeader/);
  assert.match(settings, /apiKeyPrefix/);
  assert.match(settings, /labelPurchaseTimeoutMs/);
  assert.match(settings, /labelPurchaseTimeoutMs:\s*e\.target\.value\s*===\s*""\s*\?\s*""\s*:\s*Number\(e\.target\.value\)/);
  assert.doesNotMatch(settings, /labelPurchaseTimeoutMs:\s*Number\(e\.target\.value\)\s*\|\|\s*10000/);
  assert.match(settings, /endpointValidation\?\.attempted/);
  assert.match(settings, /type="password"[\s\S]*value=\{newConn\.apiKey\}/);
});

test("settings exposes Canada Post production connection profile defaults", async () => {
  const settings = await readFile(new URL("../src/components/Settings.jsx", import.meta.url), "utf8");

  assert.match(settings, /CANADA_POST_ENDPOINTS/);
  assert.match(settings, /sandbox:\s*"https:\/\/ct\.soa-gw\.canadapost\.ca"/);
  assert.match(settings, /production:\s*"https:\/\/soa-gw\.canadapost\.ca"/);
  assert.match(settings, /providerClient:\s*"canada_post"/);
  assert.match(settings, /environment:\s*"sandbox"/);
  assert.match(settings, /apiKeyPrefix:\s*"Basic "/);
  assert.match(settings, /const\s+CANADA_POST_LABEL_URL_TEMPLATE\s*=\s*"labels\/canada-post\/\{trackingNumber\}\/\{shipmentId\}\.pdf"/);
  assert.match(settings, /labelUrlTemplate:\s*CANADA_POST_LABEL_URL_TEMPLATE/);
  assert.match(settings, /customerNumber:\s*""/);
  assert.match(settings, /contractId:\s*""/);
  assert.match(settings, /originPostalCode:\s*""/);
  assert.match(settings, /packageDimensionsCm:\s*\{/);
  assert.match(settings, /Customer Number/);
  assert.match(settings, /Contract ID/);
  assert.match(settings, /Origin Postal/);
  assert.match(settings, /Origin Address/);
  assert.match(settings, /Origin City/);
  assert.match(settings, /Origin Province/);
  assert.match(settings, /Package L\/W\/H/);
  assert.match(settings, /Canada Post Sandbox/);
  assert.match(settings, /Canada Post Production/);
});

test("settings keeps shipping provider countries input as raw text", async () => {
  const settings = await readFile(new URL("../src/components/Settings.jsx", import.meta.url), "utf8");

  assert.match(settings, /const\s+\[countriesText,\s*setCountriesText\]\s*=\s*useState\("CA"\)/);
  assert.match(settings, /setNewConn\(cloneDefaultShippingProvider\(\)\);\s*setCountriesText\("CA"\);/s);
  assert.match(settings, /value=\{countriesText\}/);
  assert.match(settings, /const\s+val\s*=\s*e\.target\.value;\s*setCountriesText\(val\);/s);
  assert.match(settings, /updateRate\(\{\s*countries:\s*val\.split\(","\)\.map\(\(entry\)\s*=>\s*entry\.trim\(\)\)\.filter\(Boolean\)\s*\}\)/s);
  assert.doesNotMatch(settings, /value=\{rate\.countries\.join\(", "\)\}/);
});

test("sales flow blocks duplicate manual sale submissions while saving", async () => {
  const salesFlow = await readFile(new URL("../src/components/SalesFlow.jsx", import.meta.url), "utf8");
  const activeListingCard = await readFile(new URL("../src/components/ActiveListingCard.jsx", import.meta.url), "utf8");

  assert.match(salesFlow, /useRef\(new Set\(\)\)/);
  assert.match(salesFlow, /saleSubmissionRef\.current\.has\(listingId\)/);
  assert.match(salesFlow, /saleSubmissionRef\.current\.add\(listingId\)/);
  assert.match(salesFlow, /saleSubmissionRef\.current\.delete\(listingId\)/);
  assert.match(activeListingCard, /disabled=\{busyListingId === l\.id\}/);
});
