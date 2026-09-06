# Batch Sell v1 — reviewed drafts, not live publication

This change builds on the selling safety pass in PR #26. It connects the two
former batch entry points to one selling queue, accessible through **Sell**,
**Start / resume selling batch**, Scan's batch button, and the old Tools route.
Single-card scanning and the existing Sales publishing controls remain separate.

## Workflow

Photograph front/back pairs, import photos, add a manual card, or select existing
inventory. Front/back import pairing is explicit and follows selection order;
unpaired files are fronts, not guessed pairs. Existing inventory cards are reused,
not cloned, and cards that are sold, listed, drafted or already selected are blocked.

Review the exact identity/variant and inspected raw condition. AI identification
fills empty fields, preserves corrections and retains unverified pricing sources;
it never confirms an identity for you. Enter a price and postage estimate, then
review/edit the generated title and description. Saved presets remember selling
cost assumptions and location defaults, not a claim about inspected condition.
Applying defaults or an inspected condition to selected cards is explicit.

Filter by Needs review, Ready, Lot / low return or Saved drafts. A card below the
chosen minimum proceeds stays held unless you explicitly allow individual selling.
Save the selected ready cards together. Failed and unresolved cards remain in the
queue, and saved rows link to their existing Sales draft. Saving never calls a
marketplace API. This release does not run eBay verification or bulk publication.

Estimated proceeds use the configured fee percentage on price plus buyer-paid
shipping, minus estimated postage and packaging. They are not profit: acquisition
cost, tax, flat fees, promotional charges and other unmodelled costs are excluded.
The postage default is deliberately blank rather than presented as a current rate.

## Durability and boundaries

Queue metadata lives in IndexedDB's existing `batch_sessions` store under `selling`.
Photos are stored separately in `images`, so editing a title does not rewrite a
batch of full-size photos. Legacy `scan` and `tools` queues and their photos move in
one transaction. A malformed legacy entry aborts migration without deleting it.
Queue revision checks reject stale writes from another tab. Reloading recovers the
last saved queue after a storage or conflict error.

A completed capture pair is queued durably before capture clears it. Capture's
Review / Save and pause controls also save a pending front-only frame. Navigating
away using global navigation or closing the browser while a front is still an
unsaved camera frame does not guarantee its recovery. Queued photos and completed
edits survive ordinary navigation and reload. No cross-device queue synchronization
or new backup/restore format is introduced. Browser data clearing can delete queues.

The new `POST /api/listings/draft` creates an item and a draft atomically and is
create-only. It reuses its stable item/draft IDs after lost responses, rejects
conflicting listings/marketplace activity, requires both photos to be stored,
and never overwrites existing inventory records or live listing content. Existing
inventory photos are not re-uploaded over their server copies. Edit an existing
card in Collection and reselect it to change identity, condition or photos.

Offline saves use the existing local catalog/listing persistence; partial failures
retain queued entries and stable IDs. Reconnect and reconcile the latest inventory
before publishing. The endpoint is available only on a server running this change.

## Validation

Node tests cover readiness, lot holds, immutable text overrides, preservation of
AI evidence/manual corrections, inventory exclusions, mixed-batch and retry
behavior, serialized edits, storage failure recovery, transactional legacy
migration, stale tab rejection, atomic draft creation, repeated/concurrent saves,
missing photos/confirmation, unchanged existing inventory and invalid input.

Browser navigation to the local app was attempted and blocked by
`net::ERR_BLOCKED_BY_ADMINISTRATOR`. Interactive browser, iPhone camera and packaged
macOS checks remain required. No live marketplace calls, postage purchases or
production account transactions were performed. Tests use temporary databases and
synthetic records/photos.

On the actual device, check a mixed batch through capture/import, edits, pause,
reload, saving only ready entries, and opening its saved drafts in Sales. Confirm
that failed/review/lot entries remain and that existing inventory isn't duplicated.

## Next independent increment

Marketplace preflight validation, reviewed bulk publication with per-item outcomes,
a task-first dashboard and actual lot listing creation are not included here.
