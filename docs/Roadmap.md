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

**Shipping partial notes:** automation module exists and wires into the order flow, but carrier rate lookups and label purchase are stubbed in the adapter layer. Canada Post integration mentioned in the README is not yet live.

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
| Cross-marketplace inventory sync reconciliation | **partial** | `services/marketplaces/syncReconciler.js` detects `external_id_mismatch`, `status_mismatch`, `price_mismatch`, and `missing_remote` conflicts. Blocking conflicts halt the apply step and log a `reconciliation_conflict` event. Adapter payloads are thin — richer remote data (updated timestamps, remote price history) is still needed for full parity. |
| Consignment / COMC integrations | planned | `marketplaceDecision` emits `send_to_comc` / `route_to_consignment` actions but the integrations are stubs. |

## How to propose a change

1. Edit `src/server/services/dashboard/roadmapData.js` and this file together.
2. If adding a Tier 2 module, add a spec under `docs/decisions/`.
3. Run `npm test` — the dashboard test will catch shape regressions in the roadmap payload.
