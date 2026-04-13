import { registerActionQueueRoutes } from "./actionQueue.routes.js";
import { registerAutomationRoutes } from "./automation.routes.js";
import { registerCollectionRoutes } from "./collections.routes.js";
import { registerDecisionRoutes } from "./decisions.routes.js";
import { registerDashboardRoutes } from "./dashboard.routes.js";
import { registerIdentificationRoutes } from "./identification.routes.js";
import { registerItemRoutes } from "./items.routes.js";
import { registerListingRoutes } from "./listings.routes.js";
import { registerMarketplaceRoutes } from "./marketplaces.routes.js";
import { registerMigrationRoutes } from "./migration.routes.js";
import { registerOrderRoutes } from "./orders.routes.js";
import { registerReferenceRoutes } from "./reference.routes.js";
import { registerSalesRoutes } from "./sales.routes.js";
import { registerSettingsRoutes } from "./settings.routes.js";
import { registerEbayRoutes } from "./ebay.routes.js";

export function registerRoutes(app) {
  registerItemRoutes(app);
  registerAutomationRoutes(app);
  registerSalesRoutes(app);
  registerOrderRoutes(app);
  registerListingRoutes(app);
  registerMarketplaceRoutes(app);
  registerIdentificationRoutes(app);
  registerDecisionRoutes(app);
  registerDashboardRoutes(app);
  registerActionQueueRoutes(app);
  registerCollectionRoutes(app);
  registerSettingsRoutes(app);
  registerReferenceRoutes(app);
  registerMigrationRoutes(app);
  registerEbayRoutes(app);
}
