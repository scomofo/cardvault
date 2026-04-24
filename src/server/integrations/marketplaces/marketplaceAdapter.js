export class MarketplaceAdapter {
  constructor(marketplace) {
    this.marketplace = marketplace;
  }

  buildExternalId(listingId) {
    return `${this.marketplace}-${listingId.slice(0, 12)}`;
  }

  async publish(listing) {
    return {
      marketplace: this.marketplace,
      externalListingId: this.buildExternalId(listing.id),
      status: "active",
      payload: listing,
      syncedAt: new Date().toISOString(),
    };
  }

  async revise(listing, overrides = {}) {
    return {
      marketplace: this.marketplace,
      externalListingId: listing.external_listing_id || this.buildExternalId(listing.id),
      status: "revised",
      payload: { ...listing, ...overrides },
      syncedAt: new Date().toISOString(),
    };
  }

  async end(listing) {
    return {
      marketplace: this.marketplace,
      externalListingId: listing.external_listing_id || this.buildExternalId(listing.id),
      status: "ended",
      payload: listing,
      syncedAt: new Date().toISOString(),
    };
  }

  async sync(listing) {
    const channelStatus = String(listing.channel_status || listing.channelStatus || "").toLowerCase();
    const isPrimaryMarketplace = this.marketplace === String(listing.platform || "").toLowerCase();
    const status = isPrimaryMarketplace && listing.sold_price
      ? "sold"
      : (channelStatus || "active");

    return {
      marketplace: this.marketplace,
      externalListingId: listing.external_listing_id || this.buildExternalId(listing.id),
      status,
      payload: listing,
      syncedAt: new Date().toISOString(),
    };
  }

  getShippingProfile(country = "CA") {
    return {
      originCountry: country,
      shippingService: country === "CA" ? "Canada Post Tracked Packet" : "USPS Ground Advantage",
      shippingCost: country === "CA" ? 4.99 : 3.99,
      dispatchDays: 2,
    };
  }

  mapForExport(listing) {
    const specifics = typeof listing.item_specifics === "string"
      ? JSON.parse(listing.item_specifics || "{}")
      : listing.item_specifics || {};

    return {
      title: listing.listing_title || listing.card_name,
      description: listing.listing_description || "",
      price: listing.buy_now_price || listing.start_price || 0,
      category: listing.category_path || "",
      condition: specifics.Condition || "",
      quantity: listing.quantity || 1,
      shippingService: this.getShippingProfile().shippingService,
      shippingCost: listing.shipping || this.getShippingProfile().shippingCost,
      marketplace: this.marketplace,
    };
  }
}
