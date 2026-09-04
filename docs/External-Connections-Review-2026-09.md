# External Connections Review — September 2026

A deep read of every path where CardVault talks to something outside its own process: the Anthropic proxy, the CV service proxy, eBay (OAuth, Trading, Inventory, Fulfillment, Browse), the COMC/consignment handoff partners, the shipping providers (Canada Post native + generic HTTP), the Vite dev proxy, and the Electron shell's loopback calls. Findings were verified on this checkout (`92ad670`, the merge of PR #19); every claim marked **verified** was reproduced with a command or a script, not just read from the code.

Ranked most severe first within each section. Line numbers refer to `92ad670`.

## 0. Master does not run (blocks everything below)

The merge commit `013aad0` (master → `fix/review-findings`, landed as PR #19) mis-resolved three conflicts. `npm test` still passes (414/414) because no test imports the two broken files, which is why this shipped.

1. **Every client API call throws.** `src/lib/api.js:13` reads `DEFAULT_TIMEOUT_MS`, but the merge dropped the `const DEFAULT_TIMEOUT_MS = 15_000;` line that PR #18 added. `request()` throws `ReferenceError` on first use, so items/listings/sales/orders/marketplaces/shipping never load. **Verified**: `npm run lint` reports `'DEFAULT_TIMEOUT_MS' is not defined (no-undef)`; `git show 013aad0 -- src/lib/api.js` shows the removed line.
2. **`vite build` fails.** `src/components/CardDetail.jsx:6` and `:9` both import from `../lib/api` (four duplicate bindings) and `:17`/`:20` declare `useServer` twice (prop + `useData()` destructure). **Verified**: esbuild reports five "already been declared" errors; the dev server fails to transform the file the same way.
3. **`npm ci` fails, so CI is red on master.** `package.json` lists `concurrently` in both `dependencies` (`^10.0.5`) and `devDependencies` (`^9.1.0`); the lockfile pins 10.0.5 and is missing `micromatch`/`braces`/`picomatch`/`fill-range`/`to-regex-range`. **Verified**: `npm ci` exits with "lock file's concurrently@10.0.5 does not satisfy concurrently@9.2.4"; the CI run for `92ad670` (run #20) failed in 15 seconds; `mac-build.yml` also runs `npm ci`.

Fix: restore the constant, dedupe the CardDetail imports (keep the wider line 9 import and the `useData()` form of `useServer`), remove `concurrently` from `dependencies`, run `npm install` and commit the lockfile.

## 1. Security of outbound connections

4. **The SSRF guard has bypasses that reach loopback with the partner token attached.** `src/server/networkTrust.js` treats only `127.0.0.1` and `::1` as loopback; `isNonPublicIpv4` does not cover `127.0.0.0/8`. `assertPublicOutboundUrl` therefore accepts:
   - `http://127.0.0.2/…` (and any other `127.x.y.z`). **Verified**: a script pointing a handoff URL at `127.0.0.2:<port>` reached a loopback-bound HTTP server via `fetchPublic` with `Authorization: Bearer SECRET` intact.
   - `http://[::ffff:127.0.0.1]/…`, which the URL parser serialises as `[::ffff:7f00:1]`; `normalizeAddress` strips the `::ffff:` prefix and is left with `7f00:1`, which matches nothing. Passes the guard (**verified**); could not be connection-tested because this sandbox has no IPv6, but on a Mac it connects to 127.0.0.1.
   - `http://[::]/…`, `100.64.0.0/10` (CGNAT), `192.0.0.0/24`, and any hostname whose DNS lookup fails (the lookup error is swallowed and the fetch proceeds; a resolver that only answers on the second query gets through).
   
   Fix in `networkTrust.js`: treat all of `127.0.0.0/8` and `0.0.0.0/8` as loopback; parse IPv4-mapped IPv6 (`::ffff:a.b.c.d` and the hex form) back to IPv4 before classifying; reject `::` explicitly. In `outboundUrlGuard.js`: fail closed when the lookup throws, and pass the resolved address to `fetch` (undici `connect.lookup` or a custom dispatcher) so the check and the connection use the same answer.

5. **Express accepts any `Host` and any `Origin`, so a DNS-rebinding page can drive the API.** `server.js` never checks `Host`, and the `cors` callback returning `false` only omits CORS headers, it does not reject the request. Every non-config route (items, settings read, marketplace publish/revise/end/sync/crosspost/handoff submit, `POST /api/automation/shipping/:orderId`) has no auth without `PROXY_TOKEN`. **Verified**: with the server on 127.0.0.1, `GET /api/settings` with `Host: attacker.example.com` returned 200, and `POST /api/marketplaces/sync` with a foreign `Host` and `Origin` returned 200. A website the user visits can rebind its hostname to 127.0.0.1 and then read the collection and trigger real eBay publishes/syncs and partner handoff submissions using the stored tokens. Fix: reject requests whose `Host` is not in `getTrustedDevHosts()` (the same set CORS uses), reject state-changing requests with a disallowed `Origin` with 403, and put the marketplace/handoff/shipping mutation routes behind `requireProtectedConfigWrite` (the previous audit's finding #1 is still open for these routes).

6. **`fetchPublic` forwards credentials across cross-origin redirects.** `src/server/outboundUrlGuard.js:96-108` re-validates each hop as non-private but keeps the original `init` (including `Authorization` / the configured API-key header and the body). A partner endpoint that 302s to another public host hands that host the connection token. Fix: drop auth headers (and the body for 301/302/303) when `new URL(location).origin !== target.origin`, or refuse cross-origin redirects outright.

7. **The eBay OAuth callback is inside the bearer-auth boundary.** `app.use("/api", authCheck)` runs before `GET /api/ebay/callback`, and eBay's browser redirect carries no `Authorization` header. With `PROXY_TOKEN` set, OAuth can never complete (401 on the callback). Exempt the callback (state is already validated) or mount it outside `/api`.

8. **The bearer token is only sent by half the client.** `src/lib/api.js` attaches `cv_proxy_token`, but `EbayConnectionSection.jsx`, `ApiKeySection.jsx`, `SetupWizard.jsx`, `Settings.jsx` (settings load/save), `useScanWorkflow.js` (`/ebay/status`), `src/lib/ai.js`, `src/lib/cvApi.js`, `checkBackend()`, and all three loopback fetches in `src/electron/main.js` use bare `fetch`. With `PROXY_TOKEN` set, the AI proxy, eBay setup, API-key setup, settings, and Electron onboarding all 401. Either route everything through `request()` or document that `PROXY_TOKEN` is incompatible with the UI (the README says so, but the UI ships a token field).

## 2. eBay

9. **No timeouts on any eBay call.** Token exchange and refresh (`ebayAuth.js:115,143`), Trading (`ebayClient.js:25,123`), Inventory (`:67`) and Fulfillment (`:84`) all use bare `fetch`. Only Browse has a timeout (2 s). Once finding #1 is fixed the client aborts after 15 s while the server keeps going, so a retry of a slow `AddItem` creates a second live listing (Trading `AddItem` is not idempotent). Fix: `AbortSignal.timeout(...)` on every eBay call, and persist the ItemID to the channel as soon as eBay returns it rather than after picture uploads + response.

10. **Sync reverts ended and sold channels to `active`.** `EbayAdapter.sync` (`ebayAdapter.js:206-235`) returns `status: "active"` whenever no fulfillment order matches, ignoring `channel_status`. `syncReconciler.compareStatus` only flags this as a `warning`, so `syncService` writes `active` back. **Verified**: a channel with `channel_status: "ended"` and no matching order came back `active`. Fix: return the existing terminal status (`ended`, `sold`, `revised`) when no order is found, and treat `ended → active` as a blocking conflict in the reconciler.

11. **Sync re-downloads the whole 90-day order history once per listing.** `fetchRemoteOrderForListing` paginates `getOrders` from scratch for every channel; a sync of N listings makes N × pages Fulfillment calls. Fetch orders once per `syncMarketplaceListings` run and match locally.

12. **Fixed-price publish always fails its first path and swallows the reason.** `listingToOffer` sends empty `fulfillmentPolicyId`/`paymentPolicyId`/`returnPolicyId`, so `publishOffer` is rejected every time; the `catch {}` in `ebayAdapter.js:60-63` then falls back to `AddFixedPriceItem`. Net effect: three failed calls per publish, an orphaned inventory item + offer left in the seller account, and no log of why. Either look up the seller's policy IDs via the Account API (the `sell.account` scope is already requested) or remove the Inventory path.

13. **Token bookkeeping gaps.** `expires_in` missing from a token response makes `new Date(NaN).toISOString()` throw after a successful exchange; the refresh token's own expiry (`refresh_token_expires_in`, ~18 months) is never stored, so `getEbayStatus().connected` stays true after it dies and the UI keeps saying "Connected" while every publish fails with the generic "Token refresh failed" (the response body is discarded).

14. **Unescaped values in Trading XML.** `ebayMapper.js` puts the description in CDATA without splitting `]]>`, and interpolates `price`, `shipping`, `duration`, and (in `endItem`) `itemId`/`reason` raw. Low today because those are server-side numbers/ids, but a listing description containing `]]>` breaks the request.

## 3. Handoff partners (COMC / consignment) and shipping providers

15. **Shipping automation fabricates tracking numbers and marks orders shipped.** With no provider connection, or a connection without a label endpoint, `automateShipment` (`shippingAutomation.js:31-34,101-116`) generates `TRK<timestamp>`, sets `label_url` to `labels/<id>.pdf`, inserts a `shipped` shipment with `shipped_at = now`, flips the order to `shipped`, and copies the fake tracking into `sales.tracking_number`. The same happens through `configuredProviderAdapter.buildTracking` when a provider has rates but no `labelPurchaseUrl`. Fix: a `labelStatus` of `created` should leave `tracking_number` null and fulfillment `pending` (or a new `label_pending`), and only a purchased label should mark `shipped`.

16. **"Test connection" performs a live POST to the submission/label endpoint.** Both `testHandoffSubmissionEndpoint` and the shipping test send a real POST with `dryRun: true`; a partner that ignores that flag creates a real submission or buys a label. The shipping test route also sets `auth_status = "connected"` when `endpointValidation.attempted` is false (no client resolved), so a connection with no endpoint at all reads as connected. Prefer a GET/HEAD/OPTIONS probe, or clearly label the test as a live dry-run submission and never mark connected without an attempted call.

17. **Marketplace connections cannot be edited or deleted.** `marketplaces.routes.js` exposes only GET/POST/`:id/test`; there is no PUT/DELETE (shipping has PUT but also no DELETE). A partner token cannot be rotated and a wrong URL cannot be fixed; `defaultConnectionIdFor` picks the newest row so old ones silently linger. The marketplace name is also not validated against the registry, and handoff URLs are not syntax-checked at write time (shipping does call `validateOutboundUrlSyntax`; marketplaces should too).

18. **Canada Post Basic auth needs a pre-encoded key.** `providerAuthHeaders` sends `Basic <api_key>` verbatim, so the user has to paste `base64(username:password)`; nothing in the UI says so. Encode `user:password` server-side or document the format.

## 4. CV service and dev proxy

19. **Centering analysis is broken in `npm start` dev mode.** `vite.config.js` proxies `/api/cv/*` straight to the CV service and rewrites `/api/cv/analyze` → `/analyze`. In `cv-service/main.py` the `/analyze` route declares `image_b64: str = None`, which FastAPI binds as a query parameter, while `src/lib/cvApi.js` sends `{ image_b64 }` as a JSON body, so every call returns 400 "No image provided". `/health` succeeds, so `cvOnline` is true and every capture toasts "Couldn't detect card edges". Express (used in production/Electron) calls `/analyze-json` and works. Fix: rewrite to `/analyze-json`, or drop the special Vite rule so `/api/cv` goes through Express like everything else (which also restores the auth check and timeouts on that path).

20. **Vite blocks the documented Bonjour hostname.** Vite 6.4.3 enforces `server.allowedHosts`; `scripts/setup-macos-iphone-https.sh` writes `DEV_HOSTNAME=cardvault.local` and the README says to open `https://<mac>.local:3000`, but `vite.config.js` never adds it. **Verified**: with `HOST=0.0.0.0 DEV_HOSTNAME=cardvault.local`, a request with `Host: cardvault.local:3100` returns "Blocked request. This host ("cardvault.local") is not allowed." Fix: `server.allowedHosts: [env.DEV_HOSTNAME].filter(Boolean)` (or `[".local"]`).

21. **The Anthropic proxy has no upstream timeout.** `server.js:177` uses bare `fetch`; the AI rate limiter and the client both time out, but the server request stays open. Use the existing `fetchWithTimeout`.

## 5. Smaller items

- `GET /api/ebay/auth` and the callback redirect to `/#settings`; in Electron the callback lands in the system browser at `127.0.0.1:3001/#settings` (a second copy of the UI), which works only because the settings section re-fetches status on window focus. Consider a dedicated "you can close this tab" page.
- `pricingService.lookupPricingByCatalogCard` is unreferenced and still returns SportsCardsPro *simulated* data when credentials are absent.
- `http-proxy-middleware` remains an unused production dependency (previous audit #23).
- Vite's `/api/cv` proxy target (`CARDVAULT_CV_URL`) and Express's `CV_SERVICE_URL` are two env vars for the same service.

## What is solid

- OAuth `state` is random, persisted, single-use and TTL-bound; the RuName/callback distinction is validated on save.
- The redirect-revalidation idea in `fetchPublic` is the right shape; it only needs the credential-stripping rule and the tighter address classifier.
- Every handoff and shipping call has a timeout and truncates provider error text before storing it.
- Electron navigation/permission/external-URL gating is correct and tested; eBay login never loads inside the app window.
- The handoff lifecycle lock (`LOCKED_HANDOFF_STATUSES`) stops a stray republish from regressing partner-owned state.

## Suggested order

1. Section 0 (three one-line fixes) so master builds and CI is green again.
2. #4, #5, #6: SSRF classifier, Host/Origin enforcement + auth on mutation routes, redirect credential stripping.
3. #10 and #15: the two paths that silently corrupt order/listing state.
4. #19 and #20: the dev-mode CV and iPhone HTTPS breakages.
5. #9, #12, #7/#8, then the rest.
