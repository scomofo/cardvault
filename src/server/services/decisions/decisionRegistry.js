import { pricingDecision } from "./pricingDecision.js";
import { listingReadinessDecision } from "./listingReadinessDecision.js";
import { workflowPriorityDecision } from "./workflowPriorityDecision.js";
import { gradingDecision } from "./gradingDecision.js";
import { profitDecision } from "./profitDecision.js";
import { shippingDecision } from "./shippingDecision.js";
import { identificationDecision } from "./identificationDecision.js";
import { sellingStrategyDecision } from "./sellingStrategyDecision.js";
import { marketplaceDecision } from "./marketplaceDecision.js";
import { acquisitionDecision } from "./acquisitionDecision.js";
import { catalogDecision } from "./catalogDecision.js";
import { exceptionDecision } from "./exceptionDecision.js";

export const decisionRegistry = [
  pricingDecision,
  listingReadinessDecision,
  workflowPriorityDecision,
  gradingDecision,
  profitDecision,
  shippingDecision,
  identificationDecision,
  sellingStrategyDecision,
  marketplaceDecision,
  acquisitionDecision,
  catalogDecision,
  exceptionDecision,
];
