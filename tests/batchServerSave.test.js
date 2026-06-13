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

test("dealer mode exposes direct marketplace handoff submission", async () => {
  const api = await readFile(new URL("../src/lib/api.js", import.meta.url), "utf8");
  const dealerModeView = await readFile(new URL("../src/components/DealerModeView.jsx", import.meta.url), "utf8");

  assert.match(api, /submitHandoff:\s*\(data\)\s*=>\s*request\("\/marketplaces\/handoff\/submit",\s*\{\s*method:\s*"POST",\s*body:\s*data\s*\}\)/);
  assert.match(dealerModeView, /const\s+HANDOFF_PLATFORMS\s*=\s*new Set\(\["comc",\s*"consignment"\]\)/);
  assert.match(dealerModeView, /const\s+\[submittingHandoff,\s*setSubmittingHandoff\]\s*=\s*useState\(false\)/);
  assert.match(dealerModeView, /selectedHandoffListingIds/);
  assert.match(dealerModeView, /marketplacesAPI\.submitHandoff\(\{\s*marketplace:\s*exportPlatform,\s*listingIds:\s*selectedHandoffListingIds,?\s*\}\)/s);
  assert.match(dealerModeView, /Submit Handoff/);
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

test("settings exposes marketplace handoff connection configuration", async () => {
  const settings = await readFile(new URL("../src/components/Settings.jsx", import.meta.url), "utf8");

  assert.match(settings, /function\s+cloneDefaultMarketplaceConnection\(\)/);
  assert.match(settings, /accessToken:\s*""/);
  assert.match(settings, /handoffSubmissionUrl:\s*""/);
  assert.match(settings, /handoffStatusUrl:\s*""/);
  assert.match(settings, /apiKeyHeader:\s*"Authorization"/);
  assert.match(settings, /apiKeyPrefix:\s*"Bearer "/);
  assert.match(settings, /handoffSubmissionTimeoutMs:\s*10000/);
  assert.match(settings, /handoffStatusTimeoutMs:\s*10000/);
  assert.match(settings, /const\s+connectionPayload\s*=\s*\{/);
  assert.match(settings, /marketplacesAPI\.connect\(connectionPayload\)/);
  assert.match(settings, /value=\{newConn\.accessToken\}/);
  assert.match(settings, /Handoff Submission URL/);
  assert.match(settings, /Handoff Status URL/);
  assert.match(settings, /Auth Header/);
  assert.match(settings, /Auth Prefix/);
  assert.match(settings, /Submission Timeout \(ms\)/);
  assert.match(settings, /Status Timeout \(ms\)/);
  assert.match(settings, /handoffSubmissionTimeoutMs:\s*e\.target\.value\s*===\s*""\s*\?\s*""\s*:\s*Number\(e\.target\.value\)/);
});

test("roadmap reflects completed handoff operator UX and remaining partner validation", async () => {
  const roadmap = await readFile(new URL("../docs/Roadmap.md", import.meta.url), "utf8");
  const roadmapData = await readFile(new URL("../src/server/services/dashboard/roadmapData.js", import.meta.url), "utf8");

  assert.match(roadmapData, /Consignment \/ COMC integrations",\s*status:\s*"partial"/);
  assert.match(roadmap, /operator UX for direct submissions is implemented/);
  assert.match(roadmap, /partner-specific live validation/);
  assert.doesNotMatch(roadmap, /operator UX for triggering direct submissions/);
});

test("automation API exposes Canada Post manifest transmit helper", async () => {
  const api = await readFile(new URL("../src/lib/api.js", import.meta.url), "utf8");

  assert.match(api, /transmitCanadaPostManifest:\s*\(data\)\s*=>/);
  assert.match(api, /canadaPostManifests:\s*\(\)\s*=>/);
  assert.match(api, /canadaPostManifestArtifactUrl:\s*\(runId,\s*artifactId\)\s*=>/);
  assert.match(api, /\/automation\/shipping\/canada-post\/manifest/);
  assert.match(api, /\/automation\/shipping\/canada-post\/manifests/);
});

test("settings exposes Canada Post production connection profile defaults", async () => {
  const settings = await readFile(new URL("../src/components/Settings.jsx", import.meta.url), "utf8");

  assert.match(settings, /CANADA_POST_ENDPOINTS/);
  assert.match(settings, /sandbox:\s*"https:\/\/ct\.soa-gw\.canadapost\.ca"/);
  assert.match(settings, /production:\s*"https:\/\/soa-gw\.canadapost\.ca"/);
  assert.match(settings, /providerClient:\s*"canada_post"/);
  assert.match(settings, /environment:\s*"sandbox"/);
  assert.match(settings, /labelPurchaseMode:\s*"proxy"/);
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
  assert.match(settings, /Purchase Mode/);
  assert.match(settings, /Native Canada Post/);
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

test("settings exposes Canada Post manifest operations controls", async () => {
  const settings = await readFile(new URL("../src/components/Settings.jsx", import.meta.url), "utf8");

  assert.match(settings, /const\s+\[manifestGroupText,\s*setManifestGroupText\]\s*=\s*useState\(""\)/);
  assert.match(settings, /automationAPI\.canadaPostManifests\(\)/);
  assert.match(settings, /automationAPI\.transmitCanadaPostManifest\(\{/);
  assert.match(settings, /automationAPI\.canadaPostManifestArtifactUrl\(run\.id,\s*artifact\.id\)/);
  assert.match(settings, /Canada Post Manifests/);
  assert.match(settings, /Transmit Manifest/);
  assert.match(settings, /Group IDs/);
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

test("sales flow exposes handoff exception retry and status sync actions", async () => {
  const salesFlow = await readFile(new URL("../src/components/SalesFlow.jsx", import.meta.url), "utf8");

  assert.match(salesFlow, /const\s+isHandoffException\s*=\s*entry\.queue\s*===\s*"marketplace_handoff_exception"/);
  assert.match(salesFlow, /async function retryHandoff\(entry\)/);
  assert.match(salesFlow, /marketplacesAPI\.submitHandoff\(\{\s*marketplace:\s*entry\.marketplace,\s*listingIds:\s*\[entry\.subjectId\]\s*\}\)/s);
  assert.match(salesFlow, /async function syncHandoffStatus\(entry\)/);
  assert.match(salesFlow, /marketplacesAPI\.sync\(\{\s*marketplace:\s*entry\.marketplace,\s*listingId:\s*entry\.subjectId\s*\}\)/s);
  assert.match(salesFlow, /Retry Handoff/);
  assert.match(salesFlow, /Sync Status/);
  assert.match(salesFlow, /entry\.submissionReference/);
});
