# 🗃️ CardVault v7

The ultimate trading card collector's toolkit. Scan, identify, price, catalog, list, and sell your cards.

## Quick Start

### Prerequisites
- **Node.js 18+** — Download from [nodejs.org](https://nodejs.org/)
- A modern browser (Chrome, Firefox, Edge, Safari)

### Setup

```bash
# 1. Navigate to the project folder
cd cardvault-app

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

Then open **http://localhost:3000** in your browser.

### Access from your phone (same WiFi)

When you run `npm run dev`, Vite will show a "Network" URL like:
```
➜  Network: http://192.168.1.xxx:3000/
```
Open that URL on your phone's browser. The camera features work on mobile!

## Features

### Core Workflow
- 📸 **Camera Capture** — Photograph front & back of cards (lightbox-optimized)
- 🤖 **AI Card Recognition** — Send photo to Claude's vision API, auto-identifies card name, set, year, number, rarity
- 🔍 **Live Price Search** — Real eBay sold listings & TCGplayer market prices via AI web search
- 📊 **Price History Charts** — Interactive SVG charts with 6-month price trends
- 📋 **Catalog Management** — Binders, conditions (GM to Poor), card types, sorting, search

### Selling
- 💰 **10-Platform Listing Generator** — eBay, TCGplayer, Mercari, FB Marketplace, CollX, Poshmark, COMC, Alt, Goldin, Shopify
- 🛒 **eBay Bulk CSV Export** — File Exchange format for bulk listing
- 🛍️ **Shopify CSV Export** — Product import format
- 📬 **COMC Manifest** — Printable submission sheet
- 🏆 **Goldin/Alt Consignment Sheets** — For high-value cards
- 📦 **Multi-Channel Inventory Sync** — Track which platforms each card is listed on
- 💰 **Mark as Sold** — Log sales with price, fees, shipping cost, net profit

### Analysis
- 📈 **Profit/Loss Tracker** — Cost basis vs. market value with P/L badges
- 📊 **Set Completion** — Auto-grouped by set with progress tracking
- 💵 **Sales Log** — Full history with revenue, costs, fees, net profit (all CAD)
- 🛡️ **Insurance Valuation PDF** — Printable report for homeowner's/tenant's insurance

### Advanced
- ⚡ **Batch Scanning** — Queue multiple cards, set defaults, ID All, Price All, Save All
- 🏅 **Grading Tracker** — PSA, BGS, SGC, CGC submissions with status, cost, ROI
- 🤖 **AI Grade Predictor** — Predicts PSA grade from card photo (centering, corners, edges, surface)
- 👁️ **Watchlist** — Price alerts when cards drop below your target
- 🤝 **Trade Tracker** — Log trades with value balance
- 🇨🇦 **Canada Post Shipping** — Rates, recommendations, packaging guide
- ☁️ **Cloud Sync** — Persistent storage across sessions
- 👤 **Multi-User** — Per-user data stores
- 📡 **Offline Support** — Camera, catalog, exports work without internet

## AI Features (require internet)

The AI features call the Anthropic API. They work automatically in Claude.ai artifacts.

For local development, the API calls go to `https://api.anthropic.com/v1/messages`. In production, you'd want to proxy these through your own backend to keep your API key secure. For local dev/testing, the calls will work if you're running from an environment that has access.

### To add your own API key (for standalone use):

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Create an API key
3. In `src/App.jsx`, find the `aiCall` function and add your key:

```javascript
const aiCall = async (body) => {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "YOUR_API_KEY_HERE",        // add this
      "anthropic-version": "2023-06-01"          // add this
    },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1500, ...body }),
  });
  // ...
};
```

⚠️ **Never commit your API key to git.** Use environment variables in production.

## Build for Production

```bash
npm run build
```

This creates an optimized build in the `dist/` folder. Deploy it to Vercel, Netlify, or any static host.

## Tech Stack

- React 18
- Vite 6
- Anthropic Claude API (vision + web search)
- localStorage (swap for Firebase/Supabase for real cloud sync)
- Canada Post shipping data
- All CAD currency

## License

Personal use. Built with CardVault.
