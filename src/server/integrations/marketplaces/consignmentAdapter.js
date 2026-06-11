import { MarketplaceAdapter } from "./marketplaceAdapter.js";

export class ConsignmentAdapter extends MarketplaceAdapter {
  constructor() {
    super("consignment");
  }

  mapForExport(listing) {
    const mapped = super.mapForExport(listing);
    return {
      Card: mapped.title,
      DeclaredValue: mapped.price,
      ReservePrice: mapped.price,
      Notes: mapped.description,
      Quantity: mapped.quantity,
      Marketplace: "Consignment",
    };
  }
}
