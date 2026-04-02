import { getDashboardData } from "../services/dashboard/dashboardService.js";

export function registerDashboardRoutes(app) {
  app.get("/api/dashboard", (_req, res) => {
    try {
      res.json(getDashboardData());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
