import { requireProtectedConfigWrite } from "../auth.js";
import { createBatchPublishService } from "../services/batchPublish/service.js";
import { loadBatchPolicies } from "../integrations/ebay/batchPublishClient.js";

export function registerBatchPublishRoutes(app) {
  const service = createBatchPublishService();
  const handle = (operation) => async (req, res) => {
    try { res.json(await operation(req)); }
    catch (error) { res.status(error.status || 500).json({ error: error.message }); }
  };
  const guard = requireProtectedConfigWrite;
  app.get("/api/publish-batches/policies", guard, handle(() => loadBatchPolicies()));
  app.get("/api/publish-batches", handle(() => service.recent()));
  app.post("/api/publish-batches", guard, handle((req) => service.create(req.body)));
  app.get("/api/publish-batches/:id", handle((req) => service.view(req.params.id)));
  app.post("/api/publish-batches/:id/check/:row", guard, handle((req) => service.check(req.params.id, req.params.row)));
  app.post("/api/publish-batches/:id/approve", guard, handle((req) => service.approve(req.params.id, req.body)));
  app.post("/api/publish-batches/:id/process-next", guard, handle((req) => service.processNext(req.params.id)));
  app.post("/api/publish-batches/:id/cancel", guard, handle((req) => service.cancelApproval(req.params.id)));
}
