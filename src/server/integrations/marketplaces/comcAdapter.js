import { MarketplaceAdapter } from "./marketplaceAdapter.js";

export class ComcAdapter extends MarketplaceAdapter {
  constructor() {
    super("comc");
  }

  mapForExport(listing) {
    const mapped = super.mapForExport(listing);
    return {
      Card: mapped.title,
      AskPrice: mapped.price,
      Notes: mapped.description,
      Quantity: mapped.quantity,
      Marketplace: "COMC",
    };
  }
}
