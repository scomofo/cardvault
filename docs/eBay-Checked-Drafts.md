# Checked eBay drafts

This increment recovers the account-aware checking design from historical PR #28
onto the current seller home and draft reviewer. It does not merge the older branch
over newer reliability fixes or add bulk publication, lots or order polling.

## Seller workflow

1. Connect eBay in Settings, selecting Sandbox for initial testing.
2. Open an eBay fixed-price draft with **Review & publish**. Add front and back photos.
3. Expand **Remembered eBay selling defaults**, load your policies, and choose
   shipping, payment and return policies. Enter your Canadian ship-from postal code
   and accurate sport/manufacturer fallbacks. Save once; later drafts reuse them.
4. Set buyer shipping to the amount charged by the chosen policy, including zero
   for free shipping. Click **Save & check with eBay**.
5. Inspect the exact checked photos, text, prices, condition, resolved sport and
   manufacturer, policy names, warnings, fee estimates and environment. Checking
   sends photos and listing details to eBay but does not create a listing.
6. Explicitly approve the checked version and click **Publish checked listing**.
   Production publication may create a real listing and incur fees.

Saving offline still works. Checking and publication require the CardVault server
and eBay connection. Policies must already exist in the selected eBay account.
Supported checks are raw sports-card singles, quantity one, fixed price, CAD and
one domestic flat-rate shipping service. International, calculated, promotional,
pickup and other unsupported policy combinations stop with an explanation. This
increment does not extend auction or graded-card publishing.

## Safeguards

The server generates the XML, stores the verification result and exact hosted photo
URLs, and issues a single-use check that expires after 15 minutes. It binds the
check to buyer-visible card/listing content, actual photo bytes, account/environment,
saved defaults and the selected policy definitions. Policy names alone are not proof
that terms have stayed the same. Policies are reloaded before publication and the
remaining local proof is checked again after token resolution, immediately before
the create request. Both operations use the same Trading compatibility version.

Edits invalidate the UI approval; other-device/server changes also fail the server
guard. Reloading the reviewer requires a new check. Verification ID zero is never a
live listing ID. The publisher submits the stored checked XML, not freshly generated
content, and never retries a create automatically. An explicit rejection or a known
pre-send failure remains a draft. Ambiguous transport or acknowledgement failures
remain uncertain. Concurrent sold/ended/confirmed state is preserved on failures.

For an unknown result, inspect Seller Hub first. Only explicit confirmation that
the listing was not published can recover it to a draft; an active publishing claim
cannot be overridden. Recovery clears the previous check and requires another check
and approval. Never confirm recovery when you cannot establish the remote outcome.

Relevant protected endpoints: `POST /api/ebay/selling-policies`,
`PUT /api/ebay/selling-setup`, `POST /api/listings/:id/ebay-check`, and
`POST /api/listings/:id/ebay-recover`. Saved setup GET never returns account tokens
or the private account binding. Check rows cascade away when their listing is deleted.

## Acceptance checklist — not yet performed with a real account

Use this PR's exact build and an eBay Sandbox account on your normal device:

- Save policies and origin once; close/reopen the review and confirm they remain.
- Check a complete draft: inspect the actual hosted front/back photos and returned
  details. Confirm checking creates no listing.
- Remove a back photo or use mismatched shipping: checking must stop with a useful
  reason and never create a listing.
- Change a checked price or photo: approval must clear and publishing must require
  another check. Switching eBay environment must invalidate the old account setup.
- Recheck, approve Sandbox explicitly and publish once. Confirm one listing in
  Sandbox, matching photos, price, postage and policies, with the same ID in CardVault.
- Refresh/reopen: there must be no automatic second create. Do not simulate an
  unknown result against production; automated tests cover that failure path.

Capture the build commit, device, returned messages and Sandbox listing ID. If any
step fails, stop before production and fix that specific discrepancy.

Automated coverage uses temporary databases and simulated providers. It exercises
account/config/policy changes, same-ID photo replacement, expiry, single use, final
pre-send guards, malformed acknowledgements, concurrent sales, recovery and route
authentication. Run `npm test`, `npm run lint`, `npm run build` and `git diff --check`.
The September 23 candidate passed all 510 tests, production build and whitespace
checks; ESLint reported zero errors and 34 existing warnings.
It does not establish camera/macOS usability or real account acceptance. Remote
policies can change after the final read; eBay still decides whether to accept the
create. Listing-fee estimates are not full sale costs or profit.

References: [VerifyAddFixedPriceItem](https://developer.ebay.com/devzone/xml/docs/Reference/ebay/VerifyAddFixedPriceItem.html),
[Account API policies](https://developer.ebay.com/api-docs/sell/account/overview.html),
and [trading-card condition descriptors](https://developer.ebay.com/api-docs/user-guides/static/mip-user-guide/mip-enum-condition-descriptor-ids-for-trading-cards.html).
