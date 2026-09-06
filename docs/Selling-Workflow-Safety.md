# Selling workflow safety

This reliability pass keeps the existing Scan, Batch, Sales, and Orders screens.
It does not implement the larger unified Batch Sell redesign or enable automatic
marketplace publication. Default-branch data is not edited by developing this PR.

## Intake and recovery

Both intake paths persist unfinished queues in IndexedDB on the current browser
and device. The version-2 upgrade adds `batch_sessions` without clearing `images`.
Scan results and Tools intake remain separate queues; they are not cross-device
session sync. A photograph must finish its queue save before capture clears it.
An unsaved frame still open in the camera is not a durable queued scan.

Saving removes only successfully persisted cards. Unidentified cards, review
matches, failed identifications and failed saves remain. Stable intake IDs are
also used for item/image writes, so a retry upserts rather than intentionally
creating another inventory record. Server saves wait for actual photo uploads.
Local storage errors are shown rather than presented as complete saves.

High model-confidence matches can be ready for inventory; medium/low confidence
requires review. This is not calibrated probability or authentication. Select the
condition inspected for the ready cards explicitly. Parallel and price-source
results are retained. AI price results are labeled unverified estimates, not
verified sold transactions. Optional storage location follows cards into order
picking. Unknown acquisition costs are flagged in estimate metadata; the existing
numeric cost schema and all historical profit analytics have not been redesigned.

## Draft versus live

New local listings from Scan, Sales, or card-detail quick creation are drafts.
Creating a draft does not mark the card live. The active sales workspace includes
both drafts and live listings with separate labels. A real, non-stub external ID
and appropriate publish status are required for the client to call a listing live.
Disconnected eBay publishes leave drafts and a queue action, not fake live success.

Fixed-price eBay publication uses the existing Trading create operation directly;
it never falls back to another create API after an uncertain response. Outbound
eBay requests have timeouts. The server records `publishing` before calling eBay,
reuses confirmed IDs and retains ambiguous outcomes as `publish_unknown`.

**Before retrying an unknown outcome, check eBay Seller Hub for the listing.** The
review-and-retry action requires explicit confirmation that it was not published.
An active publishing claim cannot be overridden for 120 seconds. This prevents
ordinary overlap/retry duplicates; it does not reconcile an unknown remote listing
by itself or guarantee safety when someone incorrectly confirms a retry.

Missing order results preserve existing channel states. Sync reconciliation
blocks a sold/ended channel from reverting to active, revised, or draft.

## Shipping and fulfillment

| Evidence | Stored state | What it does not mean |
| --- | --- | --- |
| Rate/planning service only | Label `pending`, shipment `pending` | No purchase, tracking, real label or dispatch |
| Provider-confirmed label artifact | Label `purchased`, shipment `label_purchased` | Not handed to the carrier |
| Ambiguous purchase result | `purchase_unknown` / exception | Not proof that the carrier did not charge |
| User confirms actual carrier handoff | Shipment/order `shipped` with dispatch timestamp | Not proof of delivery |

No fallback tracking number or example label path is generated. Untracked postage
remains untracked. Planning rates are estimates and are not posted as actual costs.
Label requests require payment. A durable purchasing claim prevents overlapping
requests from buying twice, including across separate API requests.

After an uncertain or failed purchase, check the provider purchase history before
using **Review and retry label**. The API requires both a retry request and an
explicit no-existing-label confirmation. Active claims have a 120-second guard.
The **Confirm dispatched** action is separate and requires explicit physical
handoff confirmation. Entering a tracking number while recording a sale no longer
marks the order shipped. Dispatch confirmation is local state; this change does
not implement new carrier tracking or eBay fulfillment-upload integrations.

Legacy shipment rows, including any old synthetic labels/tracking, are **not**
automatically identified or repaired. Review suspicious existing records against
the carrier before relying on them. Existing provider connection-test behavior is
not generally converted into a side-effect-free probe in this change.

## Validation

The final local candidate passes 461 Node tests, the production Vite build, and
ESLint with zero errors (35 warnings remain). Tests cover mixed/partial batch
saves, stable retry IDs, source/parallel retention, draft/live interpretation,
terminal-state sync protection, overlapping eBay publishes, disconnects after an
unknown publish, quote versus purchase versus dispatch, overlapping carrier calls,
missing label artifacts, payment gates, explicit dispatch, and dispatch retries.
Existing integration expectations that counted quotes as shipments or drafts as
live inventory were updated to assert the safer behavior.

An attempted real Chromium smoke run could not navigate to the local app:
`net::ERR_BLOCKED_BY_ADMINISTRATOR`. Browser interaction, camera use, iPhone Safari,
and the packaged macOS app therefore remain unverified in this environment. No
real eBay listings, postage purchases, or production account transactions were
performed. Tests use temporary SQLite databases and simulated providers.

Before merging, manually check a mixed batch through pause/reload/partial save,
a local draft through publication review, and a paid order through preparation
and explicit dispatch. Start with non-production integrations.

## Deliberately separate follow-up work

A single end-to-end Batch Sell screen, bulk approve/publish, a simpler task-first
home screen, complete cost-basis/profit modeling, verified sold-data sourcing,
automatic unknown-publication reconciliation, and wider marketplace expansion
are not part of this reliability pass.
