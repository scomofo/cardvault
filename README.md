<p align="center">
  <img src="https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react" />
  <img src="https://img.shields.io/badge/Vite-6-646cff?style=flat-square&logo=vite" />
  <img src="https://img.shields.io/badge/SQLite-3-003b57?style=flat-square&logo=sqlite" />
  <img src="https://img.shields.io/badge/Claude_AI-Powered-d97706?style=flat-square&logo=anthropic" />
  <img src="https://img.shields.io/badge/Platform-macOS%20%2B%20iPhone-111827?style=flat-square&logo=apple" />
</p>

# CardVault

> Professional sports card cataloging, pricing, and sales management with AI-powered recognition

---

### Highlights

| Feature | Description |
|:--------|:------------|
| **AI Card Recognition** | Snap a photo — Claude identifies the card, set, year, and rarity |
| **AI Price Lookup** | Search-assisted price estimates; review the source evidence before listing |
| **AI Grade Prediction** | Photo-based condition suggestions, not professional grading or authentication |
| **Portfolio Dashboard** | Live portfolio value, P/L tracking, and collection analytics |
| **10-Platform Sales** | Track listings, fees, and profit across eBay, TCGplayer, Mercari, and more |
| **Batch Scanning** | Drag-and-drop bulk card photos for auto-identification |
| **Offline-First** | Works without internet; syncs to server when available |

---

### Tech Stack

```
Frontend        React 18  +  Vite 6  +  Modern Glass UI
Backend         Express.js  +  SQLite (better-sqlite3)
AI              Anthropic Claude (card recognition, pricing, grading)
Design          Glassmorphism  |  Cyan-to-violet neon accents  |  30+ SVG icons
Database        SCCD relational schema (16 tables, 90+ pre-seeded teams)
```

### Database Schema

```
leagues ── manufacturers ── teams
              |
          card_sets ── cards ── parallels
                                    |
                               user_items ── sales / listings / trades
```

Supports error taxonomy (ERR/COR/UER), parallel tiers, serial numbering (/99, /25, 1-of-1), and extensible JSON attributes.

---

### Quick Start

```bash
npm install                    # Install dependencies
cp .env.example .env           # Optionally add ANTHROPIC_API_KEY, or use Settings
npm start                      # Server :3001  +  Frontend :3000
```

`PROXY_TOKEN` is optional and intended for API-only deployments whose clients send
`Authorization: Bearer <token>`. Leave it blank when using CardVault's built-in UI.

Without a token, the API only answers requests whose `Host` header is `localhost`, a
loopback or LAN address of the machine, or `DEV_HOSTNAME`, and it rejects state-changing
requests from any other `Origin`. This blocks DNS-rebinding and cross-site pages from
driving the API; if you reach the API through another hostname, set `DEV_HOSTNAME` to it.

### Mac AirBook Card Studio (native `.app`)

CardVault ships as a native macOS app via Electron. Run it as a single double-clickable `CardVault.app` instead of opening a browser tab.

```bash
npm install                    # Install (rebuilds better-sqlite3 for your toolchain)
npm run mac:dev                # Dev: hot-reload Vite UI inside an Electron window
npm run mac:build              # Build: produces CardVault.app (universal arm64+x64)
npm run mac:build:arm64        # Apple Silicon only build (smaller, faster)
npm run mac:verify             # Sanity-check the built .app (Info.plist, asar, launch)
```

The packaged app lives in `dist-electron/`. SQLite data and your `.env` are stored in `~/Library/Application Support/CardVault/` so they survive app updates. The first launch copies `.env.example` there as a starting point.

Camera, microphone, photo library, and local-network permission strings are wired into `Info.plist` automatically; macOS will prompt the first time you scan a card. Continuity Camera with iPhone works out of the box.

The Python `cv-service` is **not** bundled — start it separately on `:8000` when you need centering analysis. The Mac app gracefully reports it as offline otherwise.

### MacBook Air + iPhone 15 Pro

- Run the app on the MacBook Air with `HOST=0.0.0.0` so Vite and Express are reachable over your local network.
- Open `http://<your-macbook-lan-ip>:3000` on the iPhone when both devices are on the same Wi-Fi.
- iPhone Safari only allows `getUserMedia()` on `https://` or `localhost`. When testing over a LAN IP, use the app's `Upload` buttons to open the rear camera instead of the live camera preview.
- If you use eBay OAuth, set `EBAY_CALLBACK_URL` to the same host you opened in Safari and use your app's RuName for `EBAY_RU_NAME`.

### Trusted HTTPS For Live Camera

- One-command Mac setup:

```bash
npm run setup:mac-iphone-https
```

- Install `mkcert` on the MacBook Air and trust its local CA.
- Generate a cert that covers your Mac's Bonjour hostname and local IP. Example:

```bash
mkdir -p certs
mkcert -key-file certs/cardvault-key.pem -cert-file certs/cardvault-cert.pem localhost 127.0.0.1 ::1 cardvault.local 192.168.1.25
```

- Copy the generated file paths into `.env` using `SSL_KEY_FILE` and `SSL_CERT_FILE`.
- Keep `HOST=0.0.0.0`, then run `npm run start:secure`.
- Open `https://cardvault.local:3000` or the exact host covered by the cert on the iPhone.
- For the iPhone to trust the site, install and trust the mkcert root CA on the phone as well. After that, Safari should allow the live rear camera path.
- The setup script auto-detects the Mac's Bonjour hostname and LAN IP, writes the HTTPS env vars into `.env`, and prints the `rootCA.pem` path you need to AirDrop to the iPhone.

### API

| Endpoint | Description |
|:---------|:------------|
| `GET/POST /api/items` | Collection catalog |
| `GET/POST /api/sales` | Sales records |
| `GET/POST /api/listings` | Active listings |
| `CRUD /api/trades` | Trade log |
| `CRUD /api/watchlist` | Price alerts |
| `CRUD /api/gradings` | Grading submissions |
| `GET/POST /api/ref/*` | Reference data (leagues, sets, players, parallels) |
| `POST /api/migrate` | Import localStorage data to SQLite |
| `POST /api/ai` | Claude AI proxy |

### All Features

- **Sell a batch** — One resumable photo-to-draft queue with existing-inventory selection, editable previews, saved selling presets and per-card results. Nothing is published by this screen. See [Batch Sell v1](docs/Batch-Sell-V1.md).

- **Scan** — 4-step workflow: photograph, AI identify, edit details, create listing
- **Collection** — Search across card details, filter by binder and status, sort by value/date/name, and browse in list or photo-grid view
- **Sales Flow** — Create listings, track auctions with countdown timers, log purchases
- **Batch** — Camera and drag-and-drop photo intake share the selling queue, preserving unresolved work and reviewed drafts
- **Sets** — Completion tracking with progress bars per set
- **Grading** — PSA/BGS/SGC/CGC submission tracker with status pipeline
- **Watchlist** — Price target alerts with one-click refresh
- **Trades** — Log trades, calculate net balance per partner
- **Export** — CSV, eBay File Exchange bulk upload, printable insurance reports
- **Backup** — Full JSON backup/restore of all app data

Collection value covers cards still owned. Estimated gain/loss compares only owned
cards with both a price estimate and a recorded cost; the overview shows how many
cards are included. Unpriced cards stay at the end when sorting by value. Collection
exports always include all cards, even when search or filters are active.

### Canadian Focus

All prices in CAD. Canada Post shipping rates built in. eBay listing generator with Canadian options.

---

*Built by Scott Morley*

### Selling workflow safety

Batch sessions now retain unfinished scans on the same device and save cards with
stable retry IDs. Choose the inspected condition explicitly; AI prices remain
unverified estimates. New listings are drafts until a marketplace confirms them.

Shipping preparation does not buy a label or mark an order shipped. After a real
label purchase (or using your own postage), use **Confirm dispatched** only after
handing the package to the carrier. Check eBay/carrier history before retrying an
uncertain publish or label purchase. See [the safety notes](docs/Selling-Workflow-Safety.md)
for state contracts, test coverage, and remaining work.
