# Selling: draft review and publish preparation

This follows the seller home and bulk draft preparation in PR #29. A seller can
now open **Review & publish** from an eBay draft, inspect front/back photos, edit
the title, description, condition and prices, and save or publish from one place.
The editor opens automatically when the seller home links directly to a draft.

## Less repeated work

New bulk and manual drafts receive factual titles and descriptions from the card
record. Existing empty drafts get the same defaults when opened. Copy excludes
private notes and makes no invented packing, grading or returns promises. Draft
edits persist on the current device. Photos can be added or replaced in the editor;
server-only photos load through the authenticated image API.

Offline drafts can save locally. Once online, review recovers a missing server
draft only after a confirmed 404, saves its item first, and reuses the original IDs.
Timeouts do not trigger replacement records. Publishing waits for saved content and
photos and an explicit review confirmation.

## Publication behavior

Basic preflight checks require card identity, a title of up to 80 characters, a
description, an inspected condition, a positive price, a shipping amount, and the
stored front photo. A linked back photo must also exist. Current automatic eBay
publication supports sports-card singles. Sold inventory cannot be published.

Every referenced photo must upload successfully before the listing-create call.
A preparation failure returns to draft and can be retried; a possibly submitted
listing retains the existing uncertain-publication review requirement. Background
listing sync cannot erase channel publication evidence or a recorded manual sale.
Live, finished and uncertain listings cannot use the draft editor.

Zero shipping remains zero in Trading XML. Inspected raw conditions map to
Ungraded and its card-condition descriptor; a “mint” selection does not claim a
professional grade. The editor displays the eBay condition label, including the
coarser mapping for lower-condition cards.

References: [eBay trading-card condition descriptors](https://developer.ebay.com/api-docs/user-guides/static/mip-user-guide/mip-enum-condition-descriptor-ids-for-trading-cards.html),
[Trading listing fields](https://developer.ebay.com/devzone/xml/docs/reference/ebay/AddFixedPriceItem.html),
and [shipping service availability](https://developer.ebay.com/devzone/xml/docs/reference/ebay/types/ShippingServiceCodeType.html).

## Verification and limits

All 485 Node tests pass. ESLint reports zero errors and 34 existing warnings; the
production Vite build passes. Coverage includes real-server draft review and
photo linkage, same-ID offline recovery, preservation of private card fields, stale-sync protection, manual
sales, free shipping, condition descriptors, safe XML descriptions, authenticated
photo retrieval, photo-upload failure, and uncertain/repeated publication.

This preflight does not guarantee eBay acceptance. The existing integration still
uses category 261328, CAD/Canada, three-day handling, 30-day buyer-paid returns and
its hardcoded international flat-rate shipping service. The editor discloses those
terms. Account-specific shipping-service availability, required item specifics,
seller policies, location and real marketplace acceptance still need verification.
There is no new professionally graded-card or non-sports-category publishing flow.

Browser interaction, camera use and packaged macOS behavior were not exercised in
this increment. No live listings or postage purchases were made. Tests use
isolated temporary databases and simulated marketplace responses.
