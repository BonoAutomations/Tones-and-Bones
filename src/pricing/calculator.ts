import { MarketplaceTask, TaskComplexity } from "../types";
import { logger } from "../utils/logger";

const COMPLEXITY_MULTIPLIERS: Record<TaskComplexity, number> = {
  simple: 1.0,
  moderate: 2.5,
  complex: 6.0,
  enterprise: 10.0,
};

const SPECIALTY_PREMIUMS: Record<string, number> = {
  "real-estate-analysis": 1.3,
  "financial-analysis": 1.4,
  "n8n-workflows": 1.2,
  "api-integration": 1.2,
  "crm-automation": 1.15,
  "competitive-analysis": 1.25,
};

export function assessComplexity(task: MarketplaceTask): TaskComplexity {
  const descLen = task.description.length;
  const specialtyCount = task.requiredSpecialties?.length || 0;
  const hasAttachments = (task.attachments?.length || 0) > 0;
  const isUrgent = task.urgency === "urgent";

  let score = 0;
  if (descLen > 2000) score += 3;
  else if (descLen > 800) score += 2;
  else if (descLen > 200) score += 1;

  score += specialtyCount;
  if (hasAttachments) score += 1;
  if (isUrgent) score += 1;

  if (score >= 7) return "enterprise";
  if (score >= 4) return "complex";
  if (score >= 2) return "moderate";
  return "simple";
}

export function calculatePrice(
  task: MarketplaceTask,
  baseRateEth: string,
  maxRateEth: string
): string {
  const base = parseFloat(baseRateEth);
  const max = parseFloat(maxRateEth);

  const complexity = assessComplexity(task);
  let price = base * COMPLEXITY_MULTIPLIERS[complexity];

  for (const specialty of task.requiredSpecialties || []) {
    const premium = SPECIALTY_PREMIUMS[specialty.toLowerCase()];
    if (premium) {
      price *= premium;
    }
  }

  if (task.urgency === "urgent") {
    price *= 1.5;
  }

  const finalPrice = Math.min(Math.max(price, base), max);
  const rounded = Math.round(finalPrice * 10000) / 10000;

  logger.info(`Priced task ${task.id} at ${rounded} ETH (complexity: ${complexity})`);
  return rounded.toString();
}

export function estimateDelivery(task: MarketplaceTask): string {
  const complexity = assessComplexity(task);
  const hoursMap: Record<TaskComplexity, number> = {
    simple: 1,
    moderate: 4,
    complex: 24,
    enterprise: 72,
  };
  const hours = hoursMap[complexity];
  const deliveryDate = new Date(Date.now() + hours * 60 * 60 * 1000);
  return deliveryDate.toISOString();
}
