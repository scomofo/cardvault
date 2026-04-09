// eBay Publisher (v1)
// NOTE: This is a stub for CSV + future API integration

import { generateCSV } from '../utils/csv'

export function buildEbayRows(listings) {
  return listings.map(l => ({
    Title: l.title,
    Description: l.description,
    Price: l.price,
    Category: 'Sports Trading Cards',
    Condition: l.condition,
    Format: l.strategy === 'auction' ? 'Auction' : 'FixedPrice',
    Duration: l.strategy === 'auction' ? '7' : ''
  }))
}

export function exportToEbayCSV(listings) {
  const rows = buildEbayRows(listings)
  return generateCSV(rows)
}

// Future: direct API publish
export async function publishToEbay(listings) {
  // Placeholder for OAuth + eBay Trading API / Sell API
  console.log('Publishing to eBay (stub):', listings.length)
  return {
    success: true,
    count: listings.length
  }
}
