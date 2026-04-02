import { all, get } from "../../database.js";
import { publishListingToMarketplace } from "./publishService.js";

export async function crosspostListing(listingId, marketplaces) {
  const listing = get(`SELECT * FROM listings WHERE id = ?`, [listingId]);
  if (!listing) throw new Error("Listing not found");
  if (!Array.isArray(marketplaces) || marketplaces.length === 0) {
    throw new Error("marketplaces required");
  }

  const results = [];
  for (const marketplace of marketplaces) {
    results.push(await publishListingToMarketplace(listingId, marketplace));
  }
  return results;
}

export function getListingChannelState(listingId) {
  const listing = get(`SELECT * FROM listings WHERE id = ?`, [listingId]);
  if (!listing) throw new Error("Listing not found");
  const channels = all(`SELECT * FROM listing_channels WHERE listing_id = ? ORDER BY created_at DESC`, [listingId]);
  return { listing, channels };
}
