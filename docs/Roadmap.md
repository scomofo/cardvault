# CardVault Roadmap

Authoritative roadmap. Source of truth for the data structure is `src/server/services/dashboard/roadmapData.js` — the dashboard API reads that module and this document mirrors it for humans. When updating one, update the other.

Status values:
- **implemented** — feature is in the codebase and reachable from the UI or an API route.
- **partial** — core logic exists but has known gaps (see notes).
- **planned** — not yet started.

## Tier 1 — Core intake-to-sale pipeline

| Feature | Status | Module |
|---|---|---|
| Bulk scan intake | implemented | `services/automation/scanIntakeBulkAutomation.js` |
| Auto identification | implemented | `services/identification/identificationService.js` |
| Auto pricing | implemented | `services/automation/identificationPricingAutomation.js` |
| Bulk listing generator | implemented | `services/automation/listingGenerationAutomation.js` |
| eBay integration | implemented | `integrations/marketplaces/ebayAdapter.js` |
| Shipping label integration | **partial** | `services/automation/shippingAutomation.js` |
| Profit tracking | implemented | `services/dashboard/kpiService.js` |
| Inventory aging alerts | implemented | `services/dashboard/actionQueueService.js` |

**Shipping partial notes:** automation module wires into the order flow, uses configured `shipping_provider_connections` rate/label metadata when available, and can execute live label purchases through a registered provider client or generic HTTP label endpoint. Canada Post now has first-class sandbox/production profile defaults, Basic-auth dry-run validation, redacted diagnostics, and retry queue context. The deterministic Canada Post fallback remains for offline use. A native Canada Post XML Create Shipment adapter still requires full origin/destination shipment data and carrier certification.

## Tier 2 — Decision engine and automation

| Feature | Status | Module |
|---|---|---|
| Grade vs sell engine | implemented | `services/decisions/gradingDecision.js` |
| Marketplace routing | implemented | `services/decisions/marketplaceDecision.js` |
| Dashboard action queue | implemented | `services/dashboard/actionQueueService.js` |
| Pricing automation rules | implemented | `services/decisions/pricingDecision.js` |
| Stale inventory automation | implemented | `services/automation/agingRepricingAutomation.js` |
| Repricing suggestions | implemented | `services/automation/agingRepricingAutomation.js` |
| Bundle / lot suggestions | implemented | `services/automation/bundleLotAutomation.js` |

Specs for the non-obvious Tier 2 modules:
- [Grade-vs-Sell Engine](./decisions/Grade-vs-Sell-Engine.md)
- [Marketplace Routing](./decisions/Marketplace-Routing.md)

## Tier 3 — Quality and intelligence

Items in this tier are planned but unscoped. They address the known limitations documented in the decision-engine specs.

| Feature | Status | Notes |
|---|---|---|
| Grade risk distribution EV model | **implemented** | `services/decisions/gradeRiskModel.js` — 0.25/0.5/0.25 distribution around projected grade, value interpolated from PSA9/PSA10 comps. |
| Marketplace fee model for routing | **implemented** | `services/decisions/marketplaceFees.js` — default rates for eBay (13.35%+$0.40), TCGplayer (10.25%), Shopify (2.9%+$0.30), COMC (20%), consignment (20%). `marketplaceDecision` now emits `expectedNet` in inputs/explanation. |
| Confidence calibration from outcome history | **implemented** | `services/decisions/confidenceCalibration.js` — Laplace-smoothed acceptance rate per decision type, blended by `decisionStore.saveDecisions`. Falls back to the hardcoded prior until ≥5 resolved feedback rows exist. `GET /api/decisions/calibration` reports per-type samples. |
| Cross-marketplace inventory sync reconciliation | **implemented** | `services/marketplaces/syncReconciler.js` detects `external_id_mismatch`, `status_mismatch`, `price_mismatch`, and `missing_remote` conflicts. Blocking conflicts halt the apply step and log a `reconciliation_conflict` event. Adapter-provided remote update timestamps and price history are normalized into sync results and persisted on `listing_channels`. |
| Consignment / COMC integrations | **partial** | `integrations/marketplaces/comcAdapter.js` and `consignmentAdapter.js` now publish handoff-ready channels and export CardVault listing IDs plus submission status metadata for CSV handoff tracking. External marketplace APIs are still stubbed. |

## How to propose a change

1. Edit `src/server/services/dashboard/roadmapData.js` and this file together.
2. If adding a Tier 2 module, add a spec under `docs/decisions/`.
3. Run `npm test` — the dashboard test will catch shape regressions in the roadmap payload.
