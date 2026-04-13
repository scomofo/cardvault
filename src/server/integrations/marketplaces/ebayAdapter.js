import { MarketplaceAdapter } from "./marketplaceAdapter.js";
import { getEbayStatus } from "../ebay/ebayAuth.js";
import { addItem, addFixedPriceItem, reviseItem, endItem, createInventoryItem, createOffer, publishOffer } from "../ebay/ebayClient.js";
import { listingToTradingXml, listingToInventoryItem, listingToOffer } from "../ebay/ebayMapper.js";

export class EbayAdapter extends MarketplaceAdapter {
  constructor() { super("ebay"); }

  getShippingProfile(country = "CA") {
    return {
      originCountry: country,
      shippingService: country === "CA" ? "CA_StandardInternationalFlat" : "USPSFirstClass",
      shippingCost: country === "CA" ? 4.99 : 3.99,
      dispatchDays: 3,
    };
  }

  /**
   * Publish a listing to eBay. Uses real API if connected, falls back to stub.
   * @param {object} listing
   * @param {object} [item]
   * @returns {Promise<object>}
   */
  async publish(listing, item = {}) {
    const status = getEbayStatus();
    if (!status.connected) return super.publish(listing);

    const isAuction = listing.format === "auction";
    let externalId;

    if (isAuction) {
      const xml = listingToTradingXml(listing, item);
      externalId = await addItem(xml);
    } else {
      try {
        const sku = "CV-" + listing.id;
        await createInventoryItem(sku, listingToInventoryItem(listing, item));
        const offer = await createOffer(listingToOffer(listing, sku));
        const pub = await publishOffer(offer.offerId);
        externalId = pub.listingId || offer.offerId;
      } catch {
        const xml = listingToTradingXml(listing, item);
        externalId = await addFixedPriceItem(xml);
      }
    }

    return {
      marketplace: this.marketplace,
      externalListingId: externalId,
      status: "active",
      payload: listing,
      syncedAt: new Date().toISOString(),
    };
  }

  /**
   * Revise a listing on eBay.
   */
  async revise(listing, overrides = {}) {
    const status = getEbayStatus();
    if (!status.connected) return super.revise(listing, overrides);
    const merged = { ...listing, ...overrides };
    const xml = listingToTradingXml(merged, merged);
    const itemXml = xml.replace("</Item>", "<ItemID>" + (listing.external_listing_id || listing.externalListingId) + "</ItemID></Item>");
    await reviseItem(itemXml);
    return { marketplace: this.marketplace, externalListingId: listing.external_listing_id || listing.externalListingId, status: "revised", syncedAt: new Date().toISOString() };
  }

  /**
   * End a listing on eBay.
   */
  async end(listing) {
    const status = getEbayStatus();
    if (!status.connected) return super.end(listing);
    const itemId = listing.external_listing_id || listing.externalListingId;
    if (itemId) await endItem(itemId);
    return { marketplace: this.marketplace, externalListingId: itemId, status: "ended", syncedAt: new Date().toISOString() };
  }

  mapForExport(listing) {
    const mapped = super.mapForExport(listing);
    return {
      Action: "Add", Format: listing.format === "auction" ? "Auction" : "FixedPrice",
      Title: mapped.title, Description: mapped.description,
      StartPrice: mapped.price, Category: mapped.category,
      Quantity: mapped.quantity, "Shipping Service": mapped.shippingService,
      "Shipping Cost": mapped.shippingCost, Condition: mapped.condition,
    };
  }
}
