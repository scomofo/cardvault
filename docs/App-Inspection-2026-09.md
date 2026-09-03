# App Inspection — September 2026

A deep read-through of the backend (`server.js`, `src/server/**`), the client (`src/components/**`, `src/hooks/**`, `src/lib/**`), and the surrounding tooling (tests, CI, Electron shell, `cv-service`, dependencies). `npm test` (407/407), `npm run lint` (0 errors, 24 pre-existing unused-var warnings), and `npm run build` all pass cleanly on this checkout as of this audit.

Findings are ranked within each area; fix suggestions are concrete enough to act on directly. Line numbers reflect the code at commit `b224807`.

## Fixed as part of this audit

- **CLAUDE.md / AGENTS.md documented the pre-fix `diffById` behavior.** Both files still said "if both copies of a record have equal `updatedAt`, it is treated as unchanged even when other fields differ" — that was true before commit `dda552d`, which deliberately removed the shortcut because it was silently dropping edits to previously-synced records. The current `src/lib/sync/diffById.js` always falls through to a field-by-field comparison (pinned by `tests/syncEngine.test.js:175-211`). Corrected the wording in both files so future readers (human or agent) don't reason about sync conflicts backwards.

## Security

1. **No auth on the data API by default — CORS is not a security boundary.** `server.js` only wires `authCheck`/`requireProtectedConfigWrite` onto `/api/ai*` and config-write endpoints (settings, connections, eBay credentials, migration). Every other route — items, listings, sales, orders, and marketplace publish/revise/end/crosspost/sync (`src/server/routes/marketplaces.routes.js`) — has no auth check at all. This relies entirely on `HOST=127.0.0.1` binding plus CORS, but CORS only blocks *browser*-issued cross-origin requests; it does nothing against curl or a script on another LAN host. The documented "opt-in to phone scanning" path (`HOST=0.0.0.0`) turns the entire inventory, and the ability to trigger real marketplace publishes, into an unauthenticated LAN-open surface unless `PROXY_TOKEN` is also set. **Fix**: apply `authCheck` (or a lighter general check) to all mutating routes, not just AI/config-write ones — especially the marketplace publish/revise/end endpoints — and consider defaulting `requireProtectedConfigWrite`-style gating whenever `HOST` isn't loopback.

2. **SSRF via user-supplied webhook/label URLs, with credential exfiltration risk.** `handoffStatusUrl`/`handoffSubmissionUrl`/`labelPurchaseUrl` in marketplace/shipping connection metadata (`src/server/integrations/marketplaces/handoffValidation.js:144-166`, `configuredProviderAdapter.js`) come straight from JSON a caller can set via `POST /api/marketplace-connections` / `.../shipping-provider-connections`. Only the URL scheme is checked — no host allowlist/denylist for loopback or link-local addresses (e.g. `169.254.169.254`). The server then `fetch()`s the endpoint with an `Authorization` header built from the connection's stored token. Anyone able to write a connection (which, per finding #1, may be anyone on the LAN) can point these URLs at an internal service or an external host and exfiltrate the token. **Fix**: resolve and reject loopback/private/link-local hosts before fetching, even though write access is already gated elsewhere — defense in depth given #1.

3. **`/api/cv/analyze` has no auth check at all** (`server.js:192`) and forwards arbitrary payloads to the CV service. Low risk today since the CV service does little with them, but worth closing alongside #1.

4. **`cv-service/main.py` binds `0.0.0.0` by default, not loopback**, and its CORS `allow_origin_regex` whitelists all of `10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`. The Electron shell always overrides this with `--host 127.0.0.1`, but the documented standalone workflow (`python main.py`, e.g. non-Electron/Linux dev) exposes it to the whole LAN with no auth and no upload size limit. **Fix**: default `CV_HOST` to `127.0.0.1` in `main.py` itself so the safe behavior doesn't depend on the caller remembering the flag.

5. **Migration import (`POST /api/migrate`) silently swallows all row-level errors** — every per-row insert in `src/server/routes/migration.routes.js` is wrapped in a bare `try { ... } catch {}` with no logging and no per-row error surfaced in the response, only a count. A backup/restore that fails to import a chunk of records reports success with a lower count and gives the user no way to find out what didn't import. **Fix**: collect `{row, error}` into the response, or at minimum `console.warn`.

## Data integrity & correctness

6. **`CardDetail.markSold` never creates an order**, unlike `SalesFlow.completeSale` which uses `buildManualSaleFulfillment` to create both a `sale` and an `order` (`src/components/CardDetail.jsx:68-84` vs `src/components/SalesFlow.jsx:158-202`). A card marked sold from the detail view can never appear in the Orders tab for shipping/tracking — a real gap against the app's core promise. **Fix**: route `markSold` through the same fulfillment helper.

7. **AI Identify / Visual Search silently discard user edits.** In `src/hooks/useScanWorkflow.js`, `doRecognize` (325-352) and `doVisualSearch` (258-294) overwrite `card.name/set/year/number/rarity/type` unconditionally from the AI response, while `doSearch` (296-323) correctly merges with `previous.x || response.x`. Re-running ID or visual search after a manual correction clobbers it. **Fix**: apply the same merge pattern to `doRecognize`/`doVisualSearch`.

8. **"Delete ALL data" can silently fail to clear the server.** `Settings.jsx:413-433` clears local state/localStorage immediately and shows an "All data cleared" toast, but server-side deletion only happens through the 500ms-debounced sync engine, which has no flush-on-unmount. Closing the tab in that window leaves server data intact while the UI claims success. **Fix**: await the delete sync (or add an explicit bulk-delete endpoint) before showing success.

9. **`CardDetail.quickList` skips the explicit-persist ordering used elsewhere.** It creates a listing via `setListings` only, relying on the debounced sync — but `SalesFlow.createListing` explicitly calls `itemsAPI.create` then `listingsAPI.create` specifically because listings POST 404s on a missing `card_id` (documented in CLAUDE.md). A card quick-listed immediately after scanning can hit that same 404 and silently drop the listing. **Fix**: reuse the explicit-persist pattern before quick-listing.

10. **Batch-saved cards never get a `frontImgPhash`.** `saveBatchCards` (`useScanWorkflow.js:597-627`) doesn't compute the dHash that `saveCard` (364-379) does, so duplicate detection (`src/lib/duplicateDetection.js`, which only matches records with `frontImgPhash`) can never catch a batch-scanned duplicate. **Fix**: compute the dHash in `saveBatchCards` the same way.

11. **`saveAndList` silently no-ops the listing half.** If `entry` saves but `listing.price` is falsy, `useScanWorkflow.js:512-559`'s `if (entry && listing.price)` guard skips listing creation entirely and resets with no toast — a user who clicks "Save + List" with an empty price believes they listed the card.

## Performance

12. **Missing indexes on several actually-queried FK columns**, despite `migrations.js`'s `createIndexes` already covering the common hot paths (39 indexes — the app is not index-free). Confirmed gaps: `listing_channel_events.listing_channel_id` (joined in a correlated subquery per shipping-exception order in `actionQueueService.js:44-52`, which will table-scan the events log as it grows), plus `orders.sale_id`/`orders.listing_id`, `listing_channels.connection_id`, `price_comps.item_id`, `purchase_items.purchase_id`/`item_id`, `cv_scans.item_id`, `user_items.purchase_id`/`parallel_id`. **Fix**: add these to `createIndexes` in `migrations.js`.

13. **Unbounded result sets, no pagination** on `GET /api/items`, `/api/listings`, `/api/sales`, `/api/orders` — fine at hundreds of rows but no ceiling as sales history accumulates over years.

14. **No request timeout on outbound pricing calls.** `src/server/services/pricing/sportscardspro.js:62-76` uses a bare `fetch` with no `AbortController`, unlike the CV proxy in `server.js` which correctly uses `fetchWithTimeout`. A hung upstream stalls `refreshPricingForAllOwned` indefinitely per item since it's awaited sequentially.

15. **`GlobalSearch` rescans every collection on every keystroke with no debounce** (`GlobalSearch.jsx:51-112`) — fine today, will visibly lag as catalogs grow.

## Reliability & UX

16. **A single top-level `ErrorBoundary` takes down the whole app.** `App.jsx:239-245` wraps the entire router in one boundary; a render crash in the 866-line `SalesFlow.jsx` replaces the whole UI instead of just that tab. **Fix**: wrap each view in the router with its own boundary, keyed by view name.

17. **No timeout/retry/AbortController in the API client.** `src/lib/api.js`'s `request()` has none of the three — a hung fetch on flaky Wi-Fi (this app is explicitly used from an iPhone over LAN) blocks forever with no user feedback.

18. **Broad accessibility gaps.** Only 7 of 39 component files reference `aria-label`/`role` at all. `GlobalSearch` (a Ctrl+K-triggered modal) has no `role="dialog"`, no listbox/option roles, and no arrow-key navigation. Icon-only controls (e.g. the eye-toggle in `settings/ApiKeySection.jsx:74-80`) have no `aria-label`. Chip-row "tabs" across `SalesFlow.jsx`/`CardDetail.jsx` use plain buttons with no `role="tablist"`.

19. **Camera capture is duplicated wholesale** between `Camera.jsx` (114 lines) and `BatchCaptureMode.jsx` (157 lines) — identical `getUserMedia` start/stop/snap/upload logic that must be kept in sync by hand. Also requests only `width: { ideal: 1920 }` with no downscale before `canvas.toDataURL`, which can produce multi-MB base64 JPEGs feeding directly into uncapped localStorage blobs. **Fix**: extract a shared `useCameraStream` hook and add client-side downscaling.

## Tooling, CI, and dependencies

20. **No CI job ever runs on macOS.** `ci.yml` is ubuntu-only; `mac-build.yml` (macOS runner) does `checkout → npm ci → npm run build → electron-builder → upload-artifact` with **no `npm test` step**, and `scripts/verify-mac-app.sh` (purpose-built to sanity-check the packaged `.app`) is never invoked in CI. Electron-specific code and `better-sqlite3` native rebuilds are exactly the macOS/arm64-specific risk areas this would catch. **Fix**: add `npm test` and `npm run mac:verify` to `mac-build.yml`.

21. **`mac-build.yml` only produces an arm64 DMG.** `package.json`'s `build.mac.target` declares both `arm64` and `x64`, but the workflow explicitly builds `dmg:arm64` only (a deliberate, commented tradeoff since `macos-latest` is Apple Silicon) — meaning any tagged release currently ships Apple-Silicon-only with no Intel artifact.

22. **`concurrently` is a production dependency, not a devDependency**, despite only orchestrating dev-time npm scripts. Its transitive `shell-quote` carries a critical ReDoS/injection CVE that shows up in `npm audit --omit=dev`. **Fix**: move it to `devDependencies` — this alone clears the one critical audit finding.

23. **`http-proxy-middleware` is a declared production dependency with no actual import anywhere** (Vite's dev proxy uses its own bundled copy) and carries high-severity CVEs (CRLF injection, host-header bypass). Looks like dead weight — worth removing.

24. **No `eslint-plugin-react-hooks`.** For a 42K-line React codebase, missing/incorrect `useEffect`/`useCallback` dependency arrays go completely undetected by lint — exactly the class of bug fixed in commit `dda552d` (an unstable `setOrders` reference retriggering an effect loop). **Fix**: add the plugin; it would have caught that bug automatically.

25. **Thin test coverage on money-adjacent and listing-generation code.** `kpiService.js`/`performanceService.js` (portfolio value, P/L) have exactly one integration test with a single happy-path scenario; `sportscardspro.js` (external price parsing) has no test referencing it at all; `services/listings/{titleBuilder,descriptionBuilder,itemSpecificsBuilder,listingGenerator}.js` (real marketplace-facing listing content) have zero direct tests. By contrast the decision engine (`pricingDecision`, `marketplaceFees`, `gradeRiskModel`, etc.) is broadly and directly unit-tested — this is the gap to close, not the whole suite.

26. **`migrations.js` (376 lines, including a destructive-sounding table-rebuild for the FK-cascade fix) has no dedicated test running the migration path against a seeded *legacy* schema** — only `database.schema.test.js` asserts final-state shape.

27. **No `engines` field in `package.json`**, despite CI pinning Node 22 and `better-sqlite3` native bindings being version-sensitive — a contributor on the wrong Node version gets a confusing native-module error instead of a clear failure.

28. **No auto-update mechanism**, and the app is unsigned/unnotarized (`hardenedRuntime: false`, `identity: null`, `gatekeeperAssess: false` in `package.json`). Every release requires a fresh manual DMG download, and Gatekeeper will quarantine the app on other Macs. Reasonable for a personal single-user tool today; worth a deliberate decision if distribution ever widens beyond one machine.

## What's done well

- **Transactional discipline** in the sales/orders/listings routes: multi-table writes are correctly wrapped in `runInImmediateTransaction`, with referential-consistency checks between linked records before committing.
- **Upsert semantics for server-managed columns are honored exactly as CLAUDE.md documents** — `listings.routes.js` and `items.routes.js` explicitly protect `status`/`publish_status` from being clobbered by a stale client retry.
- **The FK `ON DELETE` migration (`migrations.js:162-327`) is unusually careful** — it rebuilds tables to add `ON DELETE SET NULL`, guards against re-running via live schema inspection, and preserves dependent views across the rebuild.
- **Electron security posture is textbook-correct**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, a narrow preload API, origin-gated navigation, and an allowlisted external-URL scheme — and it's test-covered (`electronHardening.test.js`).
- **The scan→publish and marketplace-decision pipeline is unusually well tested** for its complexity — `decisionBranches.test.js` alone exercises all 11 decision modules, and stub-publish detection, handoff lifecycle, and fee-negotiation edge cases each have dedicated suites.
- **`scanPublish.js` and `duplicateDetection.js`** are small, dependency-injected, well-commented pure modules — easy to reason about and test, a good pattern to extend to more of `src/lib/`.
- **Node↔cv-service integration degrades gracefully** exactly as documented, with proper timeouts and clean offline fallback on the Node-mediated path.

## Suggested priority order

1. Auth gap on mutating routes (#1) + the SSRF/token-exfiltration path it compounds (#2) — the two together are the most consequential given `HOST=0.0.0.0` is a documented, expected configuration for this app.
2. The two silent-data-loss UX bugs: markSold skipping order creation (#6), and Delete All not confirming server-side completion (#8).
3. `concurrently`/`http-proxy-middleware` dependency cleanup (#22, #23) — small, mechanical, clears real CVE noise.
4. `eslint-plugin-react-hooks` (#24) and the missing FK indexes (#12) — cheap, durable wins.
5. Everything else, roughly in the order listed above.
