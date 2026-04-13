import { getActionQueue } from "../dashboard/actionQueueService.js";

/**
 * Build the automated action queue from the decision engine.
 * @returns {object[]}
 */
export function automateActionQueue() {
  return {
    generatedAt: new Date().toISOString(),
    queue: getActionQueue(),
  };
}
