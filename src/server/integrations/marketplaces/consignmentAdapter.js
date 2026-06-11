import { MarketplaceAdapter } from "./marketplaceAdapter.js";

export class ConsignmentAdapter extends MarketplaceAdapter {
  constructor() {
    super("consignment");
  }

  async publish(listing) {
    return {
      marketplace: this.marketplace,
      externalListingId: `consignment-handoff-${String(listing.id).slice(0, 12)}`,
      status: "handoff_ready",
      payload: {
        ...listing,
        handoff: {
          submissionType: "broker_consignment",
          submissionStatus: "ready_for_review",
        },
      },
      syncedAt: new Date().toISOString(),
    };
  }

  mapForExport(listing) {
    const mapped = super.mapForExport(listing);
    const submissionStatus = listing.handoff?.submissionStatus || "ready_for_review";
    return {
      Card: mapped.title,
      DeclaredValue: mapped.price,
      ReservePrice: mapped.price,
      Notes: mapped.description,
      Quantity: mapped.quantity,
      Marketplace: "Consignment",
      CardVaultListingId: listing.id,
      SubmissionType: "broker_consignment",
      SubmissionStatus: submissionStatus,
    };
  }
}
