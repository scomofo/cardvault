<p align="center">
  <img src="https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react" />
  <img src="https://img.shields.io/badge/Vite-6-646cff?style=flat-square&logo=vite" />
  <img src="https://img.shields.io/badge/SQLite-3-003b57?style=flat-square&logo=sqlite" />
  <img src="https://img.shields.io/badge/Claude_AI-Powered-d97706?style=flat-square&logo=anthropic" />
  <img src="https://img.shields.io/badge/Platform-Windows-0078d4?style=flat-square&logo=windows" />
</p>

# CardVault

> Professional sports card cataloging, pricing, and sales management with AI-powered recognition

---

### Highlights

| Feature | Description |
|:--------|:------------|
| **AI Card Recognition** | Snap a photo — Claude identifies the card, set, year, and rarity |
| **AI Price Lookup** | Real-time market pricing from eBay sold data with trend charts |
| **AI Grade Prediction** | PSA grade predictions with centering, corners, edges, surface sub-scores |
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
cp .env.example .env           # Add ANTHROPIC_API_KEY
npm start                      # Server :3001  +  Frontend :3000
```

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

- **Scan** — 4-step workflow: photograph, AI identify, edit details, create listing
- **Collection** — Search, filter by binder, sort by value/date/name, thumbnails
- **Sales Flow** — Create listings, track auctions with countdown timers, log purchases
- **Batch** — Drag-and-drop multi-photo scanning with bulk ID and pricing
- **Sets** — Completion tracking with progress bars per set
- **Grading** — PSA/BGS/SGC/CGC submission tracker with status pipeline
- **Watchlist** — Price target alerts with one-click refresh
- **Trades** — Log trades, calculate net balance per partner
- **Export** — CSV, eBay File Exchange bulk upload, printable insurance reports
- **Backup** — Full JSON backup/restore of all app data

### Canadian Focus

All prices in CAD. Canada Post shipping rates built in. eBay listing generator with Canadian options.

---

*Built by Scott Morley*
