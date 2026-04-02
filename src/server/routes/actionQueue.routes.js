import { getActionQueue } from "../services/dashboard/actionQueueService.js";

export function registerActionQueueRoutes(app) {
  app.get("/api/action-queue", (_req, res) => {
    try {
      res.json(getActionQueue());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
