# CardVault — Agent Guide

CardVault is a single-user sports-card cataloging, pricing, and sales app: scan a card with the camera, identify and price it with Claude, track it in a SQLite-backed collection, publish listings to marketplaces, and manage orders/shipping (Canada-focused: CAD, Canada Post). It ships as a web app (Vite + Express) and a macOS Electron app.

Keep this file in sync with CLAUDE.md (same content, two filenames for different agents).

## Commands

```bash
npm start          # Express API :3001 + Vite dev server :3000 (concurrently)
npm test           # node --test over tests/**/*.test.js — run from repo root
npm run lint       # eslint (config/eslint.config.js) over src/, tests/, server.js
npm run build      # vite build → dist/
npm run mac:dev    # Electron dev shell (vite + api + electron)
```

Always run `npm test` and `npm run lint` after changes; run `npm run build` before considering work done.

## Layout

- `server.js` — Express entry: AI proxy (`/api/ai`), CV proxy, security headers, static dist serving. Routes register via `src/server/routes/index.js`.
- `src/server/` — backend. `routes/` (one file per resource), `services/` (decisions/, automation/, marketplaces/, pricing/, identification/, dashboard/, listings/), `integrations/` (ebay/, marketplaces/, shipping/), `schema.js` + `migrations.js` (SQLite via better-sqlite3, WAL; DB path `CARDVAULT_DB_PATH` or `./data/cardvault.db`).
- `src/components/` — React UI. `App.jsx` owns navigation; `scan/` is the 4-step scan flow; `settings/` holds connection sections + SetupWizard.
- `src/lib/` — client logic. `DataContext.jsx` (collections + sync), `sync/syncEngine.js`, `api.js` (all API wrappers), pure helper modules (testable without DOM).
- `src/hooks/` — `useScanWorkflow.js` (scan state machine), `useFeeModels.js`.
- `src/electron/` — macOS shell (deep links `cardvault://`, tray, Spotlight).
- `cv-service/` — optional Python centering-analysis service on :8000; app degrades gracefully when offline.
- `tests/` — node:test suites. `*.integration.test.js` boot the real server via `tests/helpers/testServer.js` (child process + temp SQLite file). Pure lib tests import `src/lib/*` directly.

## Architecture facts that bite

- **Offline-first sync**: client state lives in localStorage (`cv8_*` keys) + React state via `DataContext`. Setters schedule a **500ms-debounced** diff-by-id sync (`src/lib/sync/syncEngine.js`) against a boot-time snapshot; there is **no flush/await mechanism**. `POST /api/items` and `POST /api/listings` are **idempotent upserts by id** so redundant creates (engine retries, direct create + engine create) are harmless — the listings upsert path deliberately never touches server-managed columns (`publish_status`, `publish_error`, `external_listing_id`, `last_sync_at`).
- **diffById**: if both copies of a record have equal `updatedAt`, it is treated as unchanged even when other fields differ. Records without `updatedAt` fall back to shallow compare.
- **API casing is split**: `/api/items`, `/api/listings`, `/api/sales`, etc. return camelCase; `/api/marketplaces/*` channel endpoints return **raw snake_case DB rows** (and `overrides` is a JSON string). Consumers read both (`channel.externalListingId || channel.external_listing_id`).
- **Marketplace pipeline** (`src/server/services/marketplaces/publishService.js`): publish upserts a `listing_channels` row, appends a `listing_channel_events` audit event, and recomputes the listing's aggregate `status`/`publish_status`. Registry supports `ebay`, `comc`, `consignment`, `shopify`. eBay is the only live API (Trading/Inventory), and **silently falls back to a stub when not connected** — stub external ids look like `${marketplace}-${listingId.slice(0,12)}` (the client uses this to detect fake publishes, see `src/lib/scanPublish.js`). COMC/consignment use the handoff lifecycle (`handoff_ready → exported → submitted → accepted/settled`, `handoff_exception` on failure) driven by connection metadata URLs. eBay auth lives in the **settings table** (`ebay_access_token`…), not `marketplace_connections`.
- **Scan flow** (`src/hooks/useScanWorkflow.js` + `src/lib/scanPublish.js`): Save + List creates the item server-side first (listings POST 404s on missing `card_id`), then the listing, then publishes. Publish outcome is summarized honestly (stub detection → warning toast). saveCard also persists the item then runs server identification + learning deterministically (no timers) and only surfaces the result to the same scan session (`scanItemRef`). Duplicate detection runs at capture time via dHash (`src/lib/duplicateDetection.js`).
- **Navigation contract** (`App.jsx`): views are `dashboard | scan | cards | sales | dealer | tools | more | settings`; `handleNavigate` accepts a string or `{ view, toolsTab, focus }` (`toolsTab`: `batch|sets|grade|watch|trade`; `focus`: `{ type, id }` record deep-link held as `pendingFocus`, consumed by SalesFlow — tab switch + scroll/highlight via `sf-rec-<id>` element ids — and CatalogView — opens card detail). Queue/search→target mapping lives in `src/lib/search/searchNavigation.js`.
- **Dashboard action queue**: `GET /api/dashboard` returns `{ kpis, actionQueue, performance, roadmap }`; `GET /api/action-queue` returns the bare array. Entries are camelCase with `queue`, `item`, `reason`, `suggestedAction`, `priorityScore`, `subjectType`, `subjectId` (handoff-exception entries add `marketplace`/`listingId`/`submissionReference`/`handoffNote`).

## Testing conventions

- `import test from "node:test"` + `assert from "node:assert/strict"`, flat `test()` calls, no describe/it, no mocking libraries, no jsdom.
- Integration tests: `async (t)` signature, `startTestServer(t, { dirPrefix: "cardvault-<feature>-" })`, assert status codes before parsing JSON, create items before listings.
- New client logic goes in `src/lib/` as dependency-injection-style pure modules so it can be unit tested (pass APIs/idFactory/timestamps as parameters).
- Some suites assert on component **source text** via `readFile` (see `tests/batchServerSave.test.js`) — if you move code between files, update those paths.

## Working rules

- Do what was asked; prefer editing existing files; no speculative abstractions or unrequested features.
- Match surrounding style; keep files under ~500 lines; every changed line should trace to the request.
- Validate input at system boundaries; never hardcode or commit secrets/.env.
- State assumptions; if multiple interpretations exist, surface them before coding.
- Define verifiable success criteria (a test that fails before and passes after) and loop until green.
