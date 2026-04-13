/**
 * Map a listing record to eBay File Exchange CSV row format.
 * @param {object} listing
 * @returns {object}
 */
export function mapListingToEbayRow(listing) {
  const specifics = typeof listing.item_specifics === "string"
    ? JSON.parse(listing.item_specifics || "{}")
    : listing.item_specifics || {};

  return {
    Title: listing.listing_title || listing.card_name,
    Description: listing.listing_description || "",
    Price: listing.buy_now_price || listing.start_price || 0,
    Format: listing.format === "auction" ? "Auction" : "FixedPrice",
    Category: listing.category_path || "",
    Condition: specifics.Condition || "",
    Quantity: listing.quantity || 1,
    "Shipping Cost": listing.shipping || 0,
    "Shipping Weight Oz": listing.shipping_weight_oz || 0,
    Player: specifics.Player || "",
    Set: specifics.Set || "",
    Year: specifics.Year || "",
    Parallel: specifics.Parallel || "",
  };
}
