import { requireProtectedConfigWrite } from "../auth.js";
import { requireJsonBody } from "../validation/common.js";
import { ebayListingChecks } from "../services/listings/ebayListingCheckService.js";
import { recoverEbayDraft } from "../services/marketplaces/publishService.js";
import { LISTING_FIELD_MAP } from "../mappers/fieldMaps.js";
import { toCamel } from "../mappers/recordMappers.js";

export function registerEbayListingCheckRoutes(app) {
  const handler = (work) => async (req, res) => {
    try { res.json(await work(req)); }
    catch (error) { res.status(error.status || 502).json({ error: error.message }); }
  };
  app.get("/api/ebay/selling-setup", handler(() => ebayListingChecks.setup()));
  app.post("/api/ebay/selling-policies", requireProtectedConfigWrite, requireJsonBody, handler(() => ebayListingChecks.loadPolicies()));
  app.put("/api/ebay/selling-setup", requireProtectedConfigWrite, requireJsonBody, handler((req) => ebayListingChecks.saveSetup(req.body.config)));
  app.post("/api/listings/:id/ebay-check", requireProtectedConfigWrite, requireJsonBody, handler((req) => ebayListingChecks.check(req.params.id)));
  app.post("/api/listings/:id/ebay-recover", requireProtectedConfigWrite, requireJsonBody,
    handler((req) => toCamel(recoverEbayDraft(req.params.id, req.body.confirmNotPublished), LISTING_FIELD_MAP)));
}
