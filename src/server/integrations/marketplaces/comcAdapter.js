import { MarketplaceAdapter } from "./marketplaceAdapter.js";

export class ComcAdapter extends MarketplaceAdapter {
  constructor() {
    super("comc");
  }

  async publish(listing) {
    return {
      marketplace: this.marketplace,
      externalListingId: `comc-handoff-${String(listing.id).slice(0, 12)}`,
      status: "handoff_ready",
      payload: {
        ...listing,
        handoff: {
          submissionType: "comc_submission",
          submissionStatus: "ready_to_ship",
        },
      },
      syncedAt: new Date().toISOString(),
    };
  }

  async sync(listing, options = {}) {
    return (await this.syncHandoffStatus(listing, options)) || super.sync(listing);
  }

  mapForExport(listing) {
    const mapped = super.mapForExport(listing);
    const submissionStatus = listing.handoff?.submissionStatus || "ready_to_ship";
    return {
      Card: mapped.title,
      AskPrice: mapped.price,
      Notes: mapped.description,
      Quantity: mapped.quantity,
      Marketplace: "COMC",
      CardVaultListingId: listing.id,
      SubmissionType: "comc_submission",
      SubmissionStatus: submissionStatus,
    };
  }
}
