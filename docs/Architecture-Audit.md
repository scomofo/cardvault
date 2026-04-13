# Architecture Audit — Client/Server Decision-Layer Fragmentation

Audit of overlapping decision/pricing/publishing modules that landed from two directions: server-side decision engine (this session's work) and client-side pricing/publishing stubs (commits `f574c86`, `1b32799`, `79eb8d9`, `478b996`, `e64a8ce`).

## The fragmentation

There are now two parallel decision-and-pricing stacks in the repo:

### Server stack (mature)

Located under `src/server/services/`:

- `decisions/pricingDecision.js` — pricing decision with confidence, persisted via `decisionStore`.
- `decisions/sellingStrategyDecision.js` — auction vs fixed vs hold logic.
- `decisions/gradingDecision.js` — grade-vs-sell EV via `gradeRiskModel`.
- `decisions/marketplaceDecision.js` — eligibility + max-expected-net selector with `marketplaceFees`.
- `decisions/confidenceCalibration.js` — Laplace-smoothed calibration from `decision_feedback`.
- `exports/marketplaceCsvExporter.js` — multi-marketplace CSV export.
- `marketplaces/syncService.js` + `syncReconciler.js` — adapter-driven sync with conflict detection.
- `integrations/marketplaces/ebayAdapter.js` — eBay-specific publish/revise/end/sync.

All of this is tested (31 of the 39 passing tests cover it) and backed by the `decisions`, `decision_feedback`, `listings`, `listing_channels`, `listing_channel_events` tables.

### Client stack (skeletal stubs)

Located under `src/services/`, `src/pipelines/`, `src/domains/`:

- `src/services/pricingEngine.js` — 37 lines, exports only `analyzePricing({comps, grade, card})`. Computes volatility, grade multiplier, suggested price. No persistence, no comps lookup.
- `src/services/pricingLearningEngine.js` — 40 lines, in-memory `historicalSales` array that resets on reload. Exports `recordSale`, `getHistoricalInsights`, `applyLearning`.
- `src/services/ebayPublisher.js` — 31 lines, exports `buildEbayRows`, `exportToEbayCSV`, `publishToEbay`. The publish function is a `console.log` stub.
- `src/pipelines/batchPipeline/useBatchListing.js` — 35 lines, imports `analyzePricing` and a non-existent `generateListing` from `../../services/listingService`.
- `src/domains/dealer/DealerModeView.jsx` — 60 lines, minimal table view consuming `useBatchListing`.

## The component mismatch

There is *also* a much larger, still-uncommitted `src/components/DealerModeView.jsx` in the working tree (pre-session WIP — ~400 lines based on git diff stats). It imports from the **same file paths** as the skeletal stack:

```js
import { recommendPrice, batchPrice, evaluateReprice, calculateProfit }
  from "../services/pricingEngine";
import { useBatchListing } from "../pipelines/batchPipeline/useBatchListing";
import { generateEbayCSV, downloadCSV } from "../services/ebayPublisher";
```

None of those names exist in the committed stub files. `pricingEngine.js` exports `analyzePricing`, not `recommendPrice`/`batchPrice`/`evaluateReprice`/`calculateProfit`. `ebayPublisher.js` exports `buildEbayRows`/`exportToEbayCSV`/`publishToEbay`, not `generateEbayCSV`/`downloadCSV`.

**This means the uncommitted `DealerModeView.jsx` currently won't run** — any import of it would throw at module load. Two things happened on different branches and collided:

1. Someone pushed skeletal stubs under `src/services/` and built a minimal `DealerModeView` around them in `src/domains/dealer/`.
2. Someone else (probably you, pre-session) built a much richer `DealerModeView` in `src/components/` that expects a richer pricing/publisher API that was never committed.

## Two DealerModeView files

- `src/components/DealerModeView.jsx` — pre-session WIP, uncommitted, ~400 lines, richer UI, broken imports.
- `src/domains/dealer/DealerModeView.jsx` — committed via `79eb8d9`, 60 lines, minimal, runnable.

The frontend has nothing routing to either today (neither `App.jsx` nor `main.jsx` imports Dealer Mode, per grep).

## Recommendation

Three paths, in order of work:

### 1. Drop the client stubs (smallest)

The client-side pricing/publishing modules duplicate logic that already exists on the server. The right pattern is: client calls `/api/decisions/evaluate` → server runs the decision engine → returns structured recommendations. The client shouldn't re-implement `analyzePricing`, grade multipliers, or fee math.

Action: delete `src/services/pricingEngine.js`, `src/services/pricingLearningEngine.js`, `src/services/ebayPublisher.js`, `src/pipelines/batchPipeline/`, `src/domains/dealer/`. Route the uncommitted `src/components/DealerModeView.jsx` against the existing `/api/decisions/evaluate`, `/api/listings`, `/api/marketplaces/export` endpoints instead.

### 2. Merge the two DealerModeViews (medium)

Keep the richer `src/components/DealerModeView.jsx` as the single source, fix its broken imports to hit the server API instead of the stub modules, and delete `src/domains/dealer/DealerModeView.jsx`.

### 3. Unify through a thin client adapter (largest)

Create `src/lib/decisionClient.js` that wraps the `/api/decisions/*` endpoints with the same function names the pre-session WIP expects (`recommendPrice`, `batchPrice`, `evaluateReprice`, `calculateProfit`, `generateEbayCSV`, `downloadCSV`). Keep both DealerModeView files working in parallel until one is chosen.

## Why this matters

The confidence calibration, fee model, and marketplace selector we built this session all live on the server and persist learned state. The client stubs run in-memory and reset on reload — any "learning" done there is lost on refresh, which defeats the point. If dealer mode goes through the stubs, it bypasses:

- Calibrated confidence from `decision_feedback`
- Fee-adjusted expected-net routing across all channels
- Grade-risk distribution (expected value across grade outcomes)
- Decision history / audit trail in the `decisions` table
- Sync reconciliation before applying remote state

## What I'm not recommending

- Don't "sync" the two pricingEngine.js files by copying server logic to the client. Duplication rots fast; the server is authoritative.
- Don't delete the pre-session WIP DealerModeView without reading it — it has real UI work that shouldn't be thrown away, just rewired.
