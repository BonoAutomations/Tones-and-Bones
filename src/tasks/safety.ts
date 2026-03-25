import { MarketplaceTask } from "../types";
import { logger } from "../utils/logger";

export function isTaskSafe(task: MarketplaceTask, declineKeywords: string[]): boolean {
  const textToCheck = [
    task.title,
    task.description,
  ].join(" ").toLowerCase();

  for (const keyword of declineKeywords) {
    if (textToCheck.includes(keyword.toLowerCase())) {
      logger.warn(`Task ${task.id} declined — matched keyword: "${keyword}"`);
      return false;
    }
  }
  return true;
}

export function matchesSpecialties(
  task: MarketplaceTask,
  agentSpecialties: string[]
): boolean {
  if (!task.requiredSpecialties || task.requiredSpecialties.length === 0) {
    return true;
  }
  return task.requiredSpecialties.some((s) =>
    agentSpecialties.includes(s.toLowerCase())
  );
}
