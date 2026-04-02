import { MarketplaceAdapter } from "./marketplaceAdapter.js";

export class EbayAdapter extends MarketplaceAdapter {
  constructor() {
    super("ebay");
  }

  getShippingProfile(country = "CA") {
    return {
      originCountry: country,
      shippingService: country === "CA" ? "CA_StandardInternationalFlat" : "USPSFirstClass",
      shippingCost: country === "CA" ? 4.99 : 3.99,
      dispatchDays: 3,
    };
  }

  mapForExport(listing) {
    const mapped = super.mapForExport(listing);
    return {
      Action: "Add",
      Format: listing.format === "auction" ? "Auction" : "FixedPrice",
      Title: mapped.title,
      Description: mapped.description,
      StartPrice: mapped.price,
      Category: mapped.category,
      Quantity: mapped.quantity,
      "Shipping Service": mapped.shippingService,
      "Shipping Cost": mapped.shippingCost,
      Condition: mapped.condition,
    };
  }
}
