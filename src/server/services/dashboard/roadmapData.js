/**
 * Roadmap data consumed by the dashboard API and mirrored in docs/Roadmap.md.
 * Status values: "implemented" | "partial" | "planned".
 * When editing, keep docs/Roadmap.md in sync.
 */
export const ROADMAP = {
  tier1: [
    { name: "Bulk scan intake", status: "implemented", module: "services/automation/scanIntakeBulkAutomation.js" },
    { name: "Auto identification", status: "implemented", module: "services/identification/identificationService.js" },
    { name: "Auto pricing", status: "implemented", module: "services/automation/identificationPricingAutomation.js" },
    { name: "Bulk listing generator", status: "implemented", module: "services/automation/listingGenerationAutomation.js" },
    { name: "eBay integration", status: "implemented", module: "integrations/marketplaces/ebayAdapter.js" },
    { name: "Shipping label integration", status: "partial", module: "services/automation/shippingAutomation.js" },
    { name: "Profit tracking", status: "implemented", module: "services/dashboard/kpiService.js" },
    { name: "Inventory aging alerts", status: "implemented", module: "services/dashboard/actionQueueService.js" },
  ],
  tier2: [
    { name: "Grade vs sell engine", status: "implemented", module: "services/decisions/gradingDecision.js" },
    { name: "Marketplace routing", status: "implemented", module: "services/decisions/marketplaceDecision.js" },
    { name: "Dashboard action queue", status: "implemented", module: "services/dashboard/actionQueueService.js" },
    { name: "Pricing automation rules", status: "implemented", module: "services/decisions/pricingDecision.js" },
    { name: "Stale inventory automation", status: "implemented", module: "services/automation/agingRepricingAutomation.js" },
    { name: "Repricing suggestions", status: "implemented", module: "services/automation/agingRepricingAutomation.js" },
    { name: "Bundle / lot suggestions", status: "implemented", module: "services/automation/bundleLotAutomation.js" },
  ],
  tier3: [
    { name: "Grade risk distribution EV model", status: "implemented", module: "services/decisions/gradeRiskModel.js" },
    { name: "Marketplace fee model for routing", status: "implemented", module: "services/decisions/marketplaceFees.js" },
    { name: "Confidence calibration from outcome history", status: "implemented", module: "services/decisions/confidenceCalibration.js" },
    { name: "Cross-marketplace inventory sync reconciliation", status: "implemented", module: "services/marketplaces/syncReconciler.js" },
    { name: "Consignment / COMC integrations", status: "partial", module: "integrations/marketplaces/comcAdapter.js + consignmentAdapter.js" },
  ],
};
