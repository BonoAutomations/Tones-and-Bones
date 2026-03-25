import axios, { AxiosInstance } from "axios";
import { MarketplaceTask, TaskQuote, TaskResult } from "../types";
import { logger } from "../utils/logger";

export class MoltlaunchClient {
  private http: AxiosInstance;
  private agentId: string;

  constructor(apiUrl: string, apiKey: string, agentId: string) {
    this.agentId = agentId;
    this.http = axios.create({
      baseURL: apiUrl,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        "X-Agent-Id": agentId,
      },
      timeout: 30000,
    });
  }

  async registerAgent(registration: {
    name: string;
    description: string;
    specialties: string[];
    walletAddress: string;
    baseRateEth: string;
  }): Promise<string> {
    const response = await this.http.post("/agents/register", registration);
    logger.info(`Agent registered with ID: ${response.data.agentId}`);
    return response.data.agentId;
  }

  async fetchOpenTasks(): Promise<MarketplaceTask[]> {
    try {
      const response = await this.http.get("/tasks", {
        params: { status: "open", limit: 50 },
      });
      return response.data.tasks || [];
    } catch (error) {
      logger.error("Failed to fetch open tasks", { error });
      return [];
    }
  }

  async fetchTask(taskId: string): Promise<MarketplaceTask | null> {
    try {
      const response = await this.http.get(`/tasks/${taskId}`);
      return response.data.task;
    } catch (error) {
      logger.error(`Failed to fetch task ${taskId}`, { error });
      return null;
    }
  }

  async submitQuote(quote: TaskQuote): Promise<boolean> {
    try {
      await this.http.post(`/tasks/${quote.taskId}/quotes`, quote);
      logger.info(`Quote submitted for task ${quote.taskId}: ${quote.priceEth} ETH`);
      return true;
    } catch (error) {
      logger.error(`Failed to submit quote for task ${quote.taskId}`, { error });
      return false;
    }
  }

  async claimTask(taskId: string, quoteId: string): Promise<boolean> {
    try {
      await this.http.post(`/tasks/${taskId}/claim`, { quoteId, agentId: this.agentId });
      logger.info(`Task ${taskId} claimed`);
      return true;
    } catch (error) {
      logger.error(`Failed to claim task ${taskId}`, { error });
      return false;
    }
  }

  async submitResult(result: TaskResult): Promise<boolean> {
    try {
      await this.http.post(`/tasks/${result.taskId}/complete`, result);
      logger.info(`Result submitted for task ${result.taskId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to submit result for task ${result.taskId}`, { error });
      return false;
    }
  }

  async updateTaskProgress(taskId: string, progress: string): Promise<void> {
    try {
      await this.http.patch(`/tasks/${taskId}/progress`, { progress, agentId: this.agentId });
    } catch (error) {
      logger.warn(`Failed to update progress for task ${taskId}`, { error });
    }
  }

  async fetchAgentStats(): Promise<Record<string, unknown>> {
    try {
      const response = await this.http.get(`/agents/${this.agentId}/stats`);
      return response.data;
    } catch (error) {
      logger.error("Failed to fetch agent stats", { error });
      return {};
    }
  }

  async fetchUrgentTasks(): Promise<MarketplaceTask[]> {
    try {
      const response = await this.http.get("/tasks", {
        params: { status: "open", urgency: "urgent", limit: 10 },
      });
      return response.data.tasks || [];
    } catch (error) {
      logger.error("Failed to fetch urgent tasks", { error });
      return [];
    }
  }
}
