# CardVault

A professional sports card cataloging, pricing, and sales management app with AI-powered card recognition and a full relational database backend.

## Features

- **AI Card Recognition** — Snap a photo and let Claude identify the card, set, year, and rarity automatically
- **AI Price Lookup** — Real-time market pricing with eBay sold data, price trends, and low/mid/high estimates
- **AI Grade Prediction** — Get PSA grade predictions with sub-scores for centering, corners, edges, and surface
- **Full Collection Management** — Catalog cards with photos, conditions, binders, and cost basis tracking
- **Sales Flow** — Track active listings, completed sales, platform fees, and net profit across eBay, TCGplayer, Mercari, and 7 more platforms
- **Batch Scanning** — Drag-and-drop multiple card photos for bulk identification and pricing
- **Set Completion** — Track progress across sets with visual completion bars
- **Grading Tracker** — Log PSA/BGS/SGC/CGC submissions and track status from sent to returned
- **Price Watchlist** — Monitor cards with target price alerts
- **Trade Tracker** — Log trades with partners and track your running balance
- **Portfolio Dashboard** — Real-time portfolio value, P/L tracking, and collection analytics
- **Export Tools** — CSV export, eBay File Exchange bulk upload, and printable insurance reports
- **Offline Support** — Works without internet using localStorage; syncs to server when available

## Tech Stack

**Frontend:**
- React 18 + Vite 6
- Modern Glass UI — glassmorphism design with neon cyan-to-violet accents
- SVG icon system (30+ custom icons, no emoji dependencies)
- Responsive mobile-first layout with bottom navigation

**Backend:**
- Express.js REST API
- SQLite via better-sqlite3
- Full SCCD (Sports Card Collection Database) relational schema
- Anthropic Claude API proxy with rate limiting

**Database Schema (SCCD Spec):**
- `leagues` / `manufacturers` / `teams` — Reference data
- `card_sets` — Hierarchical set structure with parent sets
- `cards` — Master checklist with error taxonomy (ERR/COR/UER)
- `parallels` — Variation tracking with print runs, tiers, and 1-of-1 flags
- `user_items` — Physical collection with grading, pricing, and listing status
- `sales` / `listings` / `trades` / `purchases` — Transaction history
- `watchlist` / `gradings` — Tracking tools

Pre-seeded with 6 leagues, 6 manufacturers, and 90+ teams.

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env

# Start both server and frontend
npm start
```

- Frontend: http://localhost:3000
- API Server: http://localhost:3001

## API Endpoints

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/items` | GET, POST | Collection catalog |
| `/api/items/:id` | GET, PUT, DELETE | Single card |
| `/api/sales` | GET, POST | Sales records |
| `/api/listings` | GET, POST | Active/completed listings |
| `/api/listings/:id` | PUT, DELETE | Manage listings |
| `/api/trades` | GET, POST, PUT, DELETE | Trade log |
| `/api/watchlist` | GET, POST, PUT, DELETE | Price watch |
| `/api/gradings` | GET, POST, PUT, DELETE | Grading submissions |
| `/api/purchases` | GET, POST | Purchase history |
| `/api/settings` | GET, PUT | User settings |
| `/api/ref/*` | GET, POST | Reference data (leagues, sets, players, parallels) |
| `/api/migrate` | POST | Import localStorage data to SQLite |
| `/api/ai` | POST | Claude AI proxy |

## Project Structure

```
cardvault/
  index.html              # App entry point
  server.js               # Express API server
  vite.config.js          # Vite configuration
  src/
    main.jsx              # React entry
    App.jsx               # Root component + navigation
    styles/
      app.css             # Design system (Modern Glass theme)
    components/
      Icons.jsx           # 30+ SVG icons + Spinner/Skeleton
      ScanView.jsx        # 4-step card scanning workflow
      CatalogView.jsx     # Collection list + detail views
      SalesFlow.jsx       # Listings, sales, purchases
      BatchView.jsx       # Bulk drag-and-drop scanning
      GradeTracker.jsx    # PSA/BGS/SGC submission tracking
      Watchlist.jsx       # Price alerts
      TradeTracker.jsx    # Trade logging
      SetsView.jsx        # Set completion dashboard
      Settings.jsx        # Profile, stats, backup/restore
      Camera.jsx          # Photo capture + upload
      PriceChart.jsx      # SVG price trend chart
      Toast.jsx           # Notification system
      ErrorBoundary.jsx   # Error handling
    lib/
      api.js              # REST API client
      DataContext.jsx      # State management + server sync
      storage.js          # IndexedDB (images) + localStorage
      ai.js               # AI integration (recognize, price, grade)
      constants.js        # Enums (conditions, types, platforms)
      utils.js            # Helpers (formatting, uid)
      exports.js          # CSV/PDF generation
      grading.js          # PSA grade calculation
      notifications.js    # Browser notifications
    server/
      database.js         # SQLite schema + initialization
      routes.js           # REST API route handlers
      seed.js             # Reference data seeding
  data/
    cardvault.db          # SQLite database (auto-created)
```

## Canadian Focus

- All prices in CAD
- Canada Post shipping rates built in (Lettermail, Tracked Packet, Xpresspost)
- eBay listing generator with Canadian shipping options

## License

Private project by Scott Morley.
