import { getActionQueue } from "./actionQueueService.js";
import { getKpis } from "./kpiService.js";
import { getPerformancePanels } from "./performanceService.js";

export function getDashboardData() {
  return {
    kpis: getKpis(),
    actionQueue: getActionQueue(),
    performance: getPerformancePanels(),
    roadmap: {
      tier1: [
        "Bulk scan intake",
        "Auto identification",
        "Auto pricing",
        "Bulk listing generator",
        "eBay integration",
        "Shipping label integration",
        "Profit tracking",
        "Inventory aging alerts",
      ],
      tier2: [
        "Grade vs sell engine",
        "Marketplace routing",
        "Dashboard action queue",
        "Pricing automation rules",
        "Stale inventory automation",
        "Repricing suggestions",
        "Bundle / lot suggestions",
      ],
    },
  };
}
