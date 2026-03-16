export interface AgentConfig {
  agentId: string;
  llm: {
    provider: string;
    model: string;
    apiKey: string;
  };
  polling: {
    intervalMs: number;
    urgentIntervalMs: number;
  };
  pricing: {
    strategy: "complexity" | "flat" | "hourly";
    baseRateEth: string;
    maxRateEth: string;
  };
  specialties: string[];
  autoQuote: boolean;
  autoWork: boolean;
  maxConcurrentTasks: number;
  maxLoopTurns: number;
  declineKeywords: string[];
  personality: {
    tone: string;
    responseStyle: string;
    customInstructions: string;
  };
  learningEnabled: boolean;
  studyIntervalMs: number;
  agentCashEnabled: boolean;
}

export type TaskStatus =
  | "open"
  | "quoted"
  | "claimed"
  | "in_progress"
  | "completed"
  | "failed"
  | "declined";

export type TaskComplexity = "simple" | "moderate" | "complex" | "enterprise";

export interface MarketplaceTask {
  id: string;
  title: string;
  description: string;
  requiredSpecialties: string[];
  budget?: string;
  deadline?: string;
  status: TaskStatus;
  clientId: string;
  createdAt: string;
  urgency?: "normal" | "urgent";
  attachments?: TaskAttachment[];
}

export interface TaskAttachment {
  name: string;
  url: string;
  type: string;
}

export interface TaskQuote {
  taskId: string;
  agentId: string;
  priceEth: string;
  estimatedDelivery: string;
  proposal: string;
  createdAt: string;
}

export interface TaskResult {
  taskId: string;
  agentId: string;
  output: string;
  attachments?: TaskAttachment[];
  completedAt: string;
  tokensUsed?: number;
}

export interface ActiveTask {
  task: MarketplaceTask;
  quote: TaskQuote;
  startedAt: string;
  turnCount: number;
}

export interface StudyNote {
  topic: string;
  insight: string;
  source: string;
  timestamp: string;
}

export interface AgentStats {
  tasksCompleted: number;
  tasksDeclined: number;
  tasksFailed: number;
  totalEthEarned: string;
  averageTaskDuration: number;
  lastActive: string;
}
