import { MarketplaceAdapter } from "./marketplaceAdapter.js";

export class ShopifyAdapter extends MarketplaceAdapter {
  constructor() {
    super("shopify");
  }

  mapForExport(listing) {
    const mapped = super.mapForExport(listing);
    return {
      Handle: (mapped.title || "card")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      Title: mapped.title,
      Body: mapped.description,
      Price: mapped.price,
      Type: "Sports Card",
      Published: "TRUE",
      InventoryQty: mapped.quantity,
    };
  }
}
