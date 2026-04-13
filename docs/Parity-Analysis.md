# CardVault Parity Analysis

Corrected review of the external report against current code state. Scope: verify claims about roadmap, grading schema, decision engine, validation, and handoff docs.

## Report claims vs. current code

| Report claim | Verified state | Status |
|---|---|---|
| Roadmap is only encoded in `dashboardService.js` | True — `src/server/services/dashboard/dashboardService.js:14-33` hardcodes `tier1`/`tier2` arrays. No `ROADMAP.md`. | Confirmed |
| Grade-vs-sell engine is aspirational / not implemented | **Outdated.** `src/server/services/decisions/gradingDecision.js` implements it using projected grade, PSA9/PSA10 comps, and a $25 grading cost. Emits `grade_now` / `maybe_grade` / `sell_raw` / `manual_grade_review`. | Incorrect |
| Marketplace routing not detailed | **Outdated.** `marketplaceDecision.js` routes across eBay / consignment / COMC / Shopify / crosspost / bundle based on price tier, age, strategy. | Incorrect |
| Repricing / bundle-lot suggestions missing | Partially outdated. `sellingStrategyDecision.js` emits `bundle_with_similar`; automation dir has `agingRepricingAutomation.js` and `bundleLotAutomation.js`. | Partially incorrect |
| `projected_grade` / `vault_status` / sub-grades not in schema | **Outdated.** `src/server/schema.js:48-54` defines `centering`, `corners`, `edges`, `surface`, `projected_grade`, `vault_status`. | Incorrect |
| No handoff docs between scan → grade → list → sell | True. No `Handoffs.md` exists; workflow only visible via `useScanWorkflow.js` and decision chaining. | Confirmed |
| Backend lacks typed interfaces (no TS) | True. All backend is plain JS with JSDoc hints. | Confirmed |
| Route handlers lack validation | Partially true. Validation present in 6 of ~15 route files (`items`, `listings`, `migration`, `sales`, `settings`, `shared`). Gap is coverage, not absence. | Partially incorrect |
| Files under 500 lines (CLAUDE.md) | Decision services average 40–150 lines; `decisionEngine.js` is the largest at 150. Compliant. | Confirmed |

## Real gaps (after correction)

1. **Roadmap drift** — `dashboardService.js` returns roadmap strings that no longer reflect implemented Tier 2 work. Either extract to a doc or mark items as `status: "implemented" | "planned"`.
2. **No specs for existing decision modules** — `gradingDecision`, `marketplaceDecision`, `sellingStrategyDecision` exist in code but have no design doc explaining thresholds, confidence values, or action mappings. Future contributors have to reverse-engineer them.
3. **Validation coverage incomplete** — 9 route files still lack input validation at the boundary.
4. **No workflow handoff doc** — scan → identification → grading → pricing → listing → shipping chain is implicit in `useScanWorkflow.js` and decision ordering.
5. **Confidence values are hardcoded constants** (0.69, 0.74, 0.65) with no documented calibration method.

## Recommended follow-ups

- Extract roadmap to `docs/Roadmap.md` and replace `dashboardService.js` roadmap block with a read from that file, or delete it from the dashboard payload entirely.
- Add `docs/decisions/Grade-vs-Sell-Engine.md` and `docs/decisions/Marketplace-Routing.md` to document the already-implemented logic (drafted alongside this review).
- Add validation to remaining route files before adding new endpoints.
- Draft `docs/Handoffs.md` mapping the scan → sell workflow with data contracts at each step.
