# Reviewed batch publication — eBay Canada

This increment builds on corrected Batch Sell v1 (PR #27). It adds **Check and
publish saved drafts** inside Sell. Saving inventory or drafts remains separate
and never publishes automatically.

## Workflow

Connect eBay, load existing shipping/payment/return business policies, and select
1–25 saved fixed-price drafts. Choose a Canadian ship-from postal code and explicit
sport/manufacturer fallbacks for cards missing those saved attributes. Separate
mixed groups as necessary. No sport or brand is inferred without your choice.

V1 supports raw sports-card singles, quantity one, CAD, and one domestic flat-rate
shipping service. Rate tables, international/multiple service options, variable
rates and promotions are rejected rather than silently substituted. Buyer shipping
must match the selected policy, including free shipping. Policies must already
exist on eBay; this feature does not create them.

Checking uploads both stored photos to eBay Picture Services and calls
`VerifyAddFixedPriceItem`. It sends photos/listing data to eBay but does not publish
a listing. Verification's ItemID zero is never used as a publication ID. Returned
fees are estimated listing fees, not full selling cost or profit, and can differ
at publication. Errors and warnings are retained per draft. Checked hosted photos,
prices, descriptions and policy names appear in the review panel.

Select ready rows and explicitly confirm their definitions, photos, prices,
policies and sandbox/production environment. The server approves only matching
check proofs and revalidates availability, content, actual photo bytes, account
and policies. It checks again before the create request. Checks expire after
15 minutes. Edits or expiration require a fresh check and approval. Verification
does not guarantee that a later publication succeeds.

One approved row is processed per request through the existing protected publisher.
It sends the checked XML, not a newly regenerated description. JSON callers cannot
supply the internal definition capability. Explicit eBay Failure acknowledgements
are distinguished from ambiguous transport failures. Missing/zero publication IDs
and unknown acknowledgements never count as successful publication.

## Recovery

Configuration, review evidence, approvals and outcomes persist in server SQLite.
Use the saved-batch dropdown and refresh after a lost response. Returning to the
screen does not automatically process pending approvals: Resume is explicit.
No startup worker or automatic background publishing service is installed.

Pause stops scheduling after the current request. Closing a browser cannot cancel
an already submitted eBay request. Unknown results never re-enter the batch retry
loop; check Seller Hub and use existing recovery controls in Sales. Rejected rows
can be checked again, but are not implicitly approved. Cancel unprocessed approvals
does not undo submitted listings. Confirmed historical publication IDs stay visible
if a related listing later ends or sells; inspect current availability in Sales.

Checks cannot lock remote eBay business policies or freeze future fees. Avoid
editing policies during publication. A detected policy/account/content change
blocks the next submission and requires a new review.

Batch tables are additive. Deleting a listing clears its publication snapshots,
and deleting the last row clears empty batch metadata. Existing JSON export does
not include publication history; back up SQLite for that history. The intake
queue remains browser/device-local as before.

## Validation and scope

Tests use temporary databases, synthetic photos and simulated eBay responses.
They exercise strict definitions, verification IDs, proof/environment/expiry,
changed content/photos/policies/accounts, partial results, concurrency, service
reload, cancellation, real publisher persistence, definite versus unknown errors,
failed photos and deletion cleanup. Full test, lint and build checks run in CI.

Browser navigation was blocked here by `net::ERR_BLOCKED_BY_ADMINISTRATOR`.
Interactive browser, camera, iPhone and packaged macOS acceptance tests remain
unverified. No live verification, eBay listing, AI request or postage purchase
was used for testing. Start with sandbox and include an invalid draft, pause and
reload before considering production.

This does not implement auctions, lot creation, multiple marketplaces, a new
backup format, a task-first dashboard or automatic reconciliation of missing eBay
responses. The older Batch-Sell-V1 document describes the preceding draft-only
increment; this document describes the added explicit publication panel.

Primary API references:
- https://developer.ebay.com/devzone/xml/docs/reference/ebay/VerifyAddFixedPriceItem.html
- https://developer.ebay.com/api-docs/sell/account/resources/fulfillment_policy/methods/getFulfillmentPolicies
- https://developer.ebay.com/api-docs/user-guides/static/mip-user-guide/mip-enum-condition-descriptor-ids-for-trading-cards.html
