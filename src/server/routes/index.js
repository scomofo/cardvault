import { registerCollectionRoutes } from "./collections.routes.js";
import { registerItemRoutes } from "./items.routes.js";
import { registerListingRoutes } from "./listings.routes.js";
import { registerMigrationRoutes } from "./migration.routes.js";
import { registerReferenceRoutes } from "./reference.routes.js";
import { registerSalesRoutes } from "./sales.routes.js";
import { registerSettingsRoutes } from "./settings.routes.js";

export function registerRoutes(app) {
  registerItemRoutes(app);
  registerSalesRoutes(app);
  registerListingRoutes(app);
  registerCollectionRoutes(app);
  registerSettingsRoutes(app);
  registerReferenceRoutes(app);
  registerMigrationRoutes(app);
}
