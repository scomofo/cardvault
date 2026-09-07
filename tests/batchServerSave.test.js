import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("server-backed batch saves apply created cards to the current catalog", async () => {
  const batchView = await readFile(new URL("../src/components/BatchView.jsx", import.meta.url), "utf8");

  assert.match(batchView, /await itemsAPI\.create\(entry\)/);
  assert.match(batchView, /const id = item\.id/);
  assert.match(batchView, /setCatalog\(\(previous\) => \[entry, \.\.\.previous\.filter/);
  assert.match(batchView, /await persistIntake\(remaining\)/);
  assert.doesNotMatch(batchView, /setQueue\(\[\]\)/);
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
  const shippingSection = await readFile(
    new URL("../src/components/settings/ShippingProviderConnectionsSection.jsx", import.meta.url),
    "utf8",
  );

  assert.match(api, /export const shippingProvidersAPI\s*=/);
  assert.match(api, /shipping-provider-connections/);
  assert.match(settings, /ShippingProviderConnectionsSection/);
  assert.match(shippingSection, /shippingProvidersAPI\.connections\(\)/);
  assert.match(shippingSection, /shippingProvidersAPI\.connect\(newConn/);
  assert.match(shippingSection, /shippingProvidersAPI\.test\(conn\.id/);
  assert.match(shippingSection, /labelPurchaseUrl/);
  assert.match(shippingSection, /apiKeyHeader/);
  assert.match(shippingSection, /apiKeyPrefix/);
  assert.match(shippingSection, /labelPurchaseTimeoutMs/);
  assert.match(shippingSection, /labelPurchaseTimeoutMs:\s*e\.target\.value\s*===\s*""\s*\?\s*""\s*:\s*Number\(e\.target\.value\)/);
  assert.doesNotMatch(shippingSection, /labelPurchaseTimeoutMs:\s*Number\(e\.target\.value\)\s*\|\|\s*10000/);
  assert.match(shippingSection, /endpointValidation\?\.attempted/);
  assert.match(shippingSection, /type="password"[\s\S]*value=\{newConn\.apiKey\}/);
});

test("settings exposes marketplace handoff connection configuration", async () => {
  const api = await readFile(new URL("../src/lib/api.js", import.meta.url), "utf8");
  const settings = await readFile(new URL("../src/components/Settings.jsx", import.meta.url), "utf8");

  assert.match(api, /testConnection:\s*\(id,\s*data\s*=\s*\{\}\)\s*=>\s*request\(`\/marketplace-connections\/\$\{id\}\/test`,\s*\{\s*method:\s*"POST",\s*body:\s*data\s*\}\)/);
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
  assert.match(settings, /const\s+\[testingMarketplaceId,\s*setTestingMarketplaceId\]\s*=\s*useState\(null\)/);
  assert.match(settings, /marketplacesAPI\.testConnection\(conn\.id,\s*\{\s*listingId:\s*"connection-test"/s);
  assert.match(settings, /HANDOFF_MARKETPLACES\.has\(String\(conn\.marketplace\s*\|\|\s*""\)\.toLowerCase\(\)\)/);
  assert.match(settings, /Partner validation ready/);
});

test("roadmap reflects completed handoff operator UX and remaining partner validation", async () => {
  const roadmap = await readFile(new URL("../docs/Roadmap.md", import.meta.url), "utf8");
  const roadmapData = await readFile(new URL("../src/server/services/dashboard/roadmapData.js", import.meta.url), "utf8");

  assert.match(roadmapData, /Consignment \/ COMC integrations",\s*status:\s*"partial"/);
  assert.match(roadmap, /validate configured partner endpoints from Settings/);
  assert.match(roadmap, /real COMC\/consignment credentials and live acceptance evidence/);
  assert.doesNotMatch(roadmap, /operator UX for triggering direct submissions/);
});

test("automation API exposes Canada Post manifest transmit helper", async () => {
  const api = await readFile(new URL("../src/lib/api.js", import.meta.url), "utf8");

  assert.match(api, /validateCanadaPost:\s*\(data\)\s*=>/);
  assert.match(api, /transmitCanadaPostManifest:\s*\(data\)\s*=>/);
  assert.match(api, /canadaPostManifests:\s*\(\)\s*=>/);
  assert.match(api, /canadaPostManifestArtifactUrl:\s*\(runId,\s*artifactId\)\s*=>/);
  assert.match(api, /\/automation\/shipping\/canada-post\/validation/);
  assert.match(api, /\/automation\/shipping\/canada-post\/manifest/);
  assert.match(api, /\/automation\/shipping\/canada-post\/manifests/);
});

test("settings exposes Canada Post production connection profile defaults", async () => {
  const shippingSection = await readFile(
    new URL("../src/components/settings/ShippingProviderConnectionsSection.jsx", import.meta.url),
    "utf8",
  );

  assert.match(shippingSection, /CANADA_POST_ENDPOINTS/);
  assert.match(shippingSection, /sandbox:\s*"https:\/\/ct\.soa-gw\.canadapost\.ca"/);
  assert.match(shippingSection, /production:\s*"https:\/\/soa-gw\.canadapost\.ca"/);
  assert.match(shippingSection, /providerClient:\s*"canada_post"/);
  assert.match(shippingSection, /environment:\s*"sandbox"/);
  assert.match(shippingSection, /labelPurchaseMode:\s*"proxy"/);
  assert.match(shippingSection, /apiKeyPrefix:\s*"Basic "/);
  assert.match(shippingSection, /const\s+CANADA_POST_LABEL_URL_TEMPLATE\s*=\s*"labels\/canada-post\/\{trackingNumber\}\/\{shipmentId\}\.pdf"/);
  assert.match(shippingSection, /labelUrlTemplate:\s*CANADA_POST_LABEL_URL_TEMPLATE/);
  assert.match(shippingSection, /customerNumber:\s*""/);
  assert.match(shippingSection, /contractId:\s*""/);
  assert.match(shippingSection, /originPostalCode:\s*""/);
  assert.match(shippingSection, /packageDimensionsCm:\s*\{/);
  assert.match(shippingSection, /Customer Number/);
  assert.match(shippingSection, /Contract ID/);
  assert.match(shippingSection, /Origin Postal/);
  assert.match(shippingSection, /Origin Address/);
  assert.match(shippingSection, /Origin City/);
  assert.match(shippingSection, /Origin Province/);
  assert.match(shippingSection, /Package L\/W\/H/);
  assert.match(shippingSection, /Canada Post Sandbox/);
  assert.match(shippingSection, /Canada Post Production/);
  assert.match(shippingSection, /Purchase Mode/);
  assert.match(shippingSection, /Native Canada Post/);
});

test("settings keeps shipping provider countries input as raw text", async () => {
  const shippingSection = await readFile(
    new URL("../src/components/settings/ShippingProviderConnectionsSection.jsx", import.meta.url),
    "utf8",
  );

  assert.match(shippingSection, /const\s+\[countriesText,\s*setCountriesText\]\s*=\s*useState\("CA"\)/);
  assert.match(shippingSection, /setNewConn\(cloneDefaultShippingProvider\(\)\);\s*setCountriesText\("CA"\);/s);
  assert.match(shippingSection, /value=\{countriesText\}/);
  assert.match(shippingSection, /const\s+val\s*=\s*e\.target\.value;\s*setCountriesText\(val\);/s);
  assert.match(shippingSection, /updateRate\(\{\s*countries:\s*val\.split\(","\)\.map\(\(entry\)\s*=>\s*entry\.trim\(\)\)\.filter\(Boolean\)\s*\}\)/s);
  assert.doesNotMatch(shippingSection, /value=\{rate\.countries\.join\(", "\)\}/);
});

test("settings exposes Canada Post manifest operations controls", async () => {
  const shippingSection = await readFile(
    new URL("../src/components/settings/ShippingProviderConnectionsSection.jsx", import.meta.url),
    "utf8",
  );

  assert.match(shippingSection, /const\s+\[manifestGroupText,\s*setManifestGroupText\]\s*=\s*useState\(""\)/);
  assert.match(shippingSection, /const\s+\[canadaPostValidation,\s*setCanadaPostValidation\]\s*=\s*useState\(null\)/);
  assert.match(shippingSection, /automationAPI\.canadaPostManifests\(\)/);
  assert.match(shippingSection, /automationAPI\.validateCanadaPost\(\{/);
  assert.match(shippingSection, /automationAPI\.transmitCanadaPostManifest\(\{/);
  assert.match(shippingSection, /automationAPI\.canadaPostManifestArtifactUrl\(run\.id,\s*artifact\.id\)/);
  assert.match(shippingSection, /Validate Setup/);
  assert.match(shippingSection, /Canada Post Validation/);
  assert.match(shippingSection, /canadaPostValidation\.checks/);
  assert.match(shippingSection, /Canada Post Manifests/);
  assert.match(shippingSection, /Transmit Manifest/);
  assert.match(shippingSection, /Group IDs/);
});

test("scan flow persists the item before server identification instead of racing the sync on a timer", async () => {
  const scanWorkflow = await readFile(new URL("../src/hooks/useScanWorkflow.js", import.meta.url), "utf8");

  assert.doesNotMatch(scanWorkflow, /setTimeout\(async/);
  const createIndex = scanWorkflow.indexOf("await itemsAPI.create(entry)");
  const identifyIndex = scanWorkflow.indexOf("identificationAPI.identify({ itemId: id");
  assert.ok(createIndex > -1, "item upsert before identification missing");
  assert.ok(identifyIndex > createIndex, "identify must run after the item create");
  assert.match(scanWorkflow, /scanItemRef\.current === id/);
  assert.match(scanWorkflow, /if \(useServer\) runIdentification\(\)/);

  const scanView = await readFile(new URL("../src/components/ScanView.jsx", import.meta.url), "utf8");
  assert.match(scanView, /identificationResult\.dismissed/);
  assert.match(scanView, /confirmIdentification\(result\.itemId,\s*result\.id\)/);
  assert.match(scanView, /applyIdentificationCorrection\(candidate\)/);
  assert.match(scanView, /candidate\.card\.id !== result\.finalCatalogCardId/);
});

test("sales flow persists listings server-side before publish and reports stub publishes honestly", async () => {
  const salesFlow = await readFile(new URL("../src/components/SalesFlow.jsx", import.meta.url), "utf8");

  assert.match(salesFlow, /listingsAPI\.create\(listing\)/);
  assert.match(salesFlow, /itemsAPI\s*\n?\s*\.create\(/);
  assert.match(salesFlow, /summarizePublishOutcome\(channel/);
  assert.match(salesFlow, /applyChannelToListing\(listing,\s*channel\)/);
  assert.doesNotMatch(salesFlow, /toast\.success\(`Published to \$\{marketplace\}`\)/);

  const activeListingCard = await readFile(new URL("../src/components/ActiveListingCard.jsx", import.meta.url), "utf8");
  assert.match(activeListingCard, /isStubChannel/);
  assert.match(activeListingCard, /!isStubPublish/);
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
