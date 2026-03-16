import { v4 as uuidv4 } from "uuid";
import { AgentConfig, ActiveTask, MarketplaceTask, TaskQuote, AgentStats } from "./types";
import { MoltlaunchClient } from "./marketplace/client";
import { TaskExecutor } from "./tasks/executor";
import { LearningModule } from "./learning/study";
import { calculatePrice, estimateDelivery } from "./pricing/calculator";
import { isTaskSafe, matchesSpecialties } from "./tasks/safety";
import { logger } from "./utils/logger";

export class CashClawAgent {
  private config: AgentConfig;
  private marketplace: MoltlaunchClient;
  private executor: TaskExecutor;
  private learner: LearningModule;
  private activeTasks: Map<string, ActiveTask> = new Map();
  private stats: AgentStats = {
    tasksCompleted: 0,
    tasksDeclined: 0,
    tasksFailed: 0,
    totalEthEarned: "0",
    averageTaskDuration: 0,
    lastActive: new Date().toISOString(),
  };
  private isRunning: boolean = false;
  private pollTimer?: NodeJS.Timeout;
  private studyTimer?: NodeJS.Timeout;

  constructor(config: AgentConfig) {
    this.config = config;
    this.marketplace = new MoltlaunchClient(
      process.env.MOLTLAUNCH_API_URL || "https://api.moltlaunch.io",
      process.env.MOLTLAUNCH_API_KEY || "",
      config.agentId
    );
    this.executor = new TaskExecutor(config);
    this.learner = new LearningModule(config);
  }

  async start(): Promise<void> {
    logger.info("ASAM CashClaw agent starting...");
    logger.info(`Agent ID: ${this.config.agentId}`);
    logger.info(`Specialties: ${this.config.specialties.join(", ")}`);

    this.isRunning = true;

    // Start polling for tasks
    await this.poll();
    this.schedulePolling();

    // Start learning module if enabled
    if (this.config.learningEnabled) {
      this.scheduleStudy();
    }

    logger.info("CashClaw agent is live and polling for tasks");
  }

  async stop(): Promise<void> {
    logger.info("CashClaw agent stopping...");
    this.isRunning = false;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.studyTimer) clearInterval(this.studyTimer);
    logger.info("CashClaw agent stopped");
  }

  private schedulePolling(): void {
    this.pollTimer = setInterval(async () => {
      if (!this.isRunning) return;
      await this.poll();
    }, this.config.polling.intervalMs);
  }

  private scheduleStudy(): void {
    this.studyTimer = setInterval(async () => {
      if (!this.isRunning) return;
      await this.learner.study();
    }, this.config.learningEnabled ? this.config.studyIntervalMs : Infinity);
  }

  private async poll(): Promise<void> {
    this.stats.lastActive = new Date().toISOString();

    const concurrentSlots =
      this.config.maxConcurrentTasks - this.activeTasks.size;
    if (concurrentSlots <= 0) {
      logger.debug(`At max concurrent tasks (${this.config.maxConcurrentTasks}), skipping poll`);
      return;
    }

    logger.debug(`Polling marketplace (${concurrentSlots} slots available)...`);

    try {
      const tasks = await this.marketplace.fetchOpenTasks();
      logger.info(`Found ${tasks.length} open tasks`);

      for (const task of tasks) {
        if (this.activeTasks.size >= this.config.maxConcurrentTasks) break;
        if (this.activeTasks.has(task.id)) continue;

        await this.evaluateAndHandle(task);
      }
    } catch (error) {
      logger.error("Poll cycle failed", { error });
    }
  }

  private async evaluateAndHandle(task: MarketplaceTask): Promise<void> {
    // Safety check
    if (!isTaskSafe(task, this.config.declineKeywords)) {
      this.stats.tasksDeclined++;
      return;
    }

    // Specialty match check
    if (!matchesSpecialties(task, this.config.specialties)) {
      logger.debug(`Task ${task.id} doesn't match specialties, skipping`);
      return;
    }

    // Auto-quote
    if (this.config.autoQuote) {
      await this.quoteTask(task);
    }

    // Auto-work (if the task is in a claimed/assigned state to us)
    if (this.config.autoWork && task.status === "claimed") {
      await this.workOnTask(task);
    }
  }

  private async quoteTask(task: MarketplaceTask): Promise<void> {
    const priceEth = calculatePrice(
      task,
      this.config.pricing.baseRateEth,
      this.config.pricing.maxRateEth
    );
    const estimatedDelivery = estimateDelivery(task);
    const proposal = await this.executor.generateProposal(task);

    const quote: TaskQuote = {
      taskId: task.id,
      agentId: this.config.agentId,
      priceEth,
      estimatedDelivery,
      proposal,
      createdAt: new Date().toISOString(),
    };

    const success = await this.marketplace.submitQuote(quote);
    if (success) {
      logger.info(`Quoted task "${task.title}" at ${priceEth} ETH`);
    }
  }

  private async workOnTask(task: MarketplaceTask): Promise<void> {
    const quote = this.buildActiveQuote(task);
    const activeTask: ActiveTask = {
      task,
      quote,
      startedAt: new Date().toISOString(),
      turnCount: 0,
    };

    this.activeTasks.set(task.id, activeTask);
    logger.info(`Starting work on task ${task.id}: "${task.title}"`);

    try {
      await this.marketplace.updateTaskProgress(task.id, "in_progress");
      const result = await this.executor.execute(activeTask);
      const submitted = await this.marketplace.submitResult(result);

      if (submitted) {
        this.stats.tasksCompleted++;
        this.accumulateEarnings(quote.priceEth);
        logger.info(`Task ${task.id} completed and submitted successfully`);
      }
    } catch (error) {
      this.stats.tasksFailed++;
      logger.error(`Task ${task.id} failed`, { error });
      await this.marketplace.updateTaskProgress(task.id, `failed: ${String(error)}`);
    } finally {
      this.activeTasks.delete(task.id);
    }
  }

  private buildActiveQuote(task: MarketplaceTask): TaskQuote {
    return {
      taskId: task.id,
      agentId: this.config.agentId,
      priceEth: calculatePrice(
        task,
        this.config.pricing.baseRateEth,
        this.config.pricing.maxRateEth
      ),
      estimatedDelivery: estimateDelivery(task),
      proposal: "",
      createdAt: new Date().toISOString(),
    };
  }

  private accumulateEarnings(amountEth: string): void {
    const current = parseFloat(this.stats.totalEthEarned);
    const amount = parseFloat(amountEth);
    this.stats.totalEthEarned = (current + amount).toFixed(6);
  }

  getStats(): AgentStats {
    return { ...this.stats };
  }

  getActiveTasks(): ActiveTask[] {
    return Array.from(this.activeTasks.values());
  }
}
