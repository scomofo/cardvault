import { getActionQueue } from "./actionQueueService.js";
import { getKpis } from "./kpiService.js";
import { getPerformancePanels } from "./performanceService.js";
import { ROADMAP } from "./roadmapData.js";

/**
 * Aggregate all dashboard data including KPIs, action queue, and performance.
 * @returns {{ kpis: object, actionQueue: object[], performance: object[], roadmap: object }}
 */
export function getDashboardData() {
  return {
    kpis: getKpis(),
    actionQueue: getActionQueue(),
    performance: getPerformancePanels(),
    roadmap: ROADMAP,
  };
}
