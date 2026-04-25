import { registerActionQueueRoutes } from "./actionQueue.routes.js";
import { registerAuthRoutes } from "./auth.routes.js";
import { registerAutomationRoutes } from "./automation.routes.js";
import { registerCollectionRoutes } from "./collections.routes.js";
import { registerDecisionRoutes } from "./decisions.routes.js";
import { registerDashboardRoutes } from "./dashboard.routes.js";
import { registerEarlyAccessRoutes } from "./earlyAccess.routes.js";
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
import { requireSession } from "../auth.js";

export function registerRoutes(app) {
  // Public routes — no session required
  registerAuthRoutes(app);
  registerEarlyAccessRoutes(app);

  // All routes registered after this point require a valid session
  // (requireSession passes through when no seller_password is configured — open mode)
  app.use("/api", requireSession);

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

