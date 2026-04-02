import { getActionQueue } from "../dashboard/actionQueueService.js";

export function automateActionQueue() {
  return {
    generatedAt: new Date().toISOString(),
    queue: getActionQueue(),
  };
}
