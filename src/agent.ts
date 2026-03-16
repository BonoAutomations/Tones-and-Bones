import {
  AgentConfig,
  ActiveTask,
  MarketplaceTask,
  TaskQuote,
  AgentStats,
} from "./types";
import { MoltlaunchClient } from "./marketplace/client";
import { TaskExecutor } from "./tasks/executor";
import { LearningModule } from "./learning/study";
import { calculatePrice, estimateDelivery } from "./pricing/calculator";
import { isTaskSafe, matchesSpecialties } from "./tasks/safety";
import { XAutoPoster } from "./social/poster";
import { WhopClient } from "./revenue/whop";
import { StripeRevenue } from "./revenue/stripe";
import { LeadPipeline } from "./leads/pipeline";
import { EthWallet } from "./wallet/eth";
import { ContentBriefGenerator } from "./content/brief";
import {
  createDashboardServer,
  updateNestedMetrics,
} from "./dashboard/server";
import { logger } from "./utils/logger";

export class CashClawAgent {
  private config: AgentConfig;
  private marketplace: MoltlaunchClient;
  private executor: TaskExecutor;
  private learner: LearningModule;
  private poster: XAutoPoster;
  private whop?: WhopClient;
  private stripe?: StripeRevenue;
  private leads: LeadPipeline;
  private wallet: EthWallet;
  private contentGen: ContentBriefGenerator;
  private dashboard: ReturnType<typeof createDashboardServer>;

  private activeTasks: Map<string, ActiveTask> = new Map();
  private stats: AgentStats = {
    tasksCompleted: 0,
    tasksDeclined: 0,
    tasksFailed: 0,
    totalEthEarned: "0",
    averageTaskDuration: 0,
    lastActive: new Date().toISOString(),
  };
  private isRunning = false;
  private pollTimer?: NodeJS.Timeout;
  private studyTimer?: NodeJS.Timeout;
  private leadTimer?: NodeJS.Timeout;
  private contentTimer?: NodeJS.Timeout;
  private dashMetricsTimer?: NodeJS.Timeout;

  constructor(config: AgentConfig) {
    this.config = config;

    this.marketplace = new MoltlaunchClient(
      process.env.MOLTLAUNCH_API_URL || "https://api.moltlaunch.io",
      process.env.MOLTLAUNCH_API_KEY || "",
      config.agentId
    );
    this.executor = new TaskExecutor(config);
    this.learner = new LearningModule(config);
    this.poster = new XAutoPoster(config);
    this.leads = new LeadPipeline(config);
    this.wallet = new EthWallet();
    this.contentGen = new ContentBriefGenerator(config);
    this.dashboard = createDashboardServer(
      parseInt(process.env.DASHBOARD_PORT || "3777")
    );

    if (process.env.WHOP_API_KEY && process.env.WHOP_COMPANY_ID) {
      this.whop = new WhopClient(
        process.env.WHOP_API_KEY,
        process.env.WHOP_COMPANY_ID
      );
    }

    if (process.env.STRIPE_SECRET_KEY) {
      this.stripe = new StripeRevenue(process.env.STRIPE_SECRET_KEY);
    }
  }

  async start(): Promise<void> {
    logger.info("==============================================");
    logger.info("  ASAM CashClaw — Autonomous Revenue Agent   ");
    logger.info("  Powered by ASAM | San Diego County         ");
    logger.info("==============================================");
    logger.info(`Agent ID: ${this.config.agentId}`);

    this.isRunning = true;

    // 1. Start monitoring dashboard
    this.dashboard.start();

    // 2. Log wallet status
    const walletStatus = await this.wallet.getStatus();
    logger.info(
      `Wallet: ${walletStatus.address} | ${walletStatus.balanceEth} ETH ($${walletStatus.balanceUsd})`
    );
    if (walletStatus.isLowBalance) {
      logger.warn("Wallet balance is low — fund before accepting ETH tasks");
    }

    // 3. Sync revenue products
    if (this.whop) {
      await this.whop.syncProducts().catch((e) =>
        logger.warn("WHOP sync failed — check store status", { e })
      );
    }
    if (this.stripe) {
      await this.stripe.syncProducts().catch((e) =>
        logger.warn("Stripe sync failed", { e })
      );
    }

    // 4. Start X auto-poster
    await this.poster.start();

    // 5. Generate first content brief
    await this.contentGen.generateDailyBrief().catch(() =>
      logger.warn("Initial content brief failed")
    );

    // 6. Start main task polling loop
    await this.poll();
    this.schedulePolling();

    // 7. Schedule learning sessions
    if (this.config.learningEnabled) {
      this.scheduleStudy();
    }

    // 8. Schedule lead pipeline runs (every 6 hours)
    this.scheduleleadPipeline();

    // 9. Schedule daily content brief (24h)
    this.scheduleContentBrief();

    // 10. Keep dashboard metrics fresh
    this.scheduleDashboardSync();

    logger.info("CashClaw fully operational — all systems running");
  }

  async stop(): Promise<void> {
    logger.info("CashClaw shutting down...");
    this.isRunning = false;
    this.poster.stop();
    this.dashboard.stop();
    [
      this.pollTimer,
      this.studyTimer,
      this.leadTimer,
      this.contentTimer,
      this.dashMetricsTimer,
    ].forEach((t) => t && clearInterval(t));
    logger.info("CashClaw stopped");
  }

  // ─── Scheduling ──────────────────────────────────────────────────────────────

  private schedulePolling(): void {
    this.pollTimer = setInterval(async () => {
      if (this.isRunning) await this.poll();
    }, this.config.polling.intervalMs);
  }

  private scheduleStudy(): void {
    this.studyTimer = setInterval(async () => {
      if (!this.isRunning) return;
      const before = this.learner.getRecentInsights(1).length;
      await this.learner.study();
      const after = this.learner.getRecentInsights(1).length;
      if (after > before) {
        updateNestedMetrics("learning", {
          studySessions: this.learner.getRecentInsights(100).length,
          lastStudied: new Date().toISOString(),
          topicsResearched: this.learner.getRecentInsights(100).length,
        });
      }
    }, this.config.studyIntervalMs);
  }

  private scheduleleadPipeline(): void {
    this.leadTimer = setInterval(async () => {
      if (!this.isRunning) return;
      await this.runLeadPipeline();
    }, 6 * 60 * 60 * 1000);
  }

  private scheduleContentBrief(): void {
    this.contentTimer = setInterval(async () => {
      if (!this.isRunning) return;
      await this.contentGen.generateDailyBrief().catch(() =>
        logger.warn("Scheduled content brief failed")
      );
    }, 24 * 60 * 60 * 1000);
  }

  private scheduleDashboardSync(): void {
    this.dashMetricsTimer = setInterval(async () => {
      await this.syncDashboardMetrics();
    }, 60000);
  }

  // ─── Core Poll Loop ───────────────────────────────────────────────────────────

  private async poll(): Promise<void> {
    this.stats.lastActive = new Date().toISOString();
    const slots = this.config.maxConcurrentTasks - this.activeTasks.size;
    if (slots <= 0) return;

    try {
      const tasks = await this.marketplace.fetchOpenTasks();
      for (const task of tasks) {
        if (this.activeTasks.size >= this.config.maxConcurrentTasks) break;
        if (this.activeTasks.has(task.id)) continue;
        await this.evaluateAndHandle(task);
      }
    } catch (error) {
      logger.error("Poll cycle error", { error });
    }
  }

  private async evaluateAndHandle(task: MarketplaceTask): Promise<void> {
    if (!isTaskSafe(task, this.config.declineKeywords)) {
      this.stats.tasksDeclined++;
      return;
    }
    if (!matchesSpecialties(task, this.config.specialties)) return;

    if (this.config.autoQuote) await this.quoteTask(task);
    if (this.config.autoWork && task.status === "claimed")
      await this.workOnTask(task);
  }

  private async quoteTask(task: MarketplaceTask): Promise<void> {
    const priceEth = calculatePrice(
      task,
      this.config.pricing.baseRateEth,
      this.config.pricing.maxRateEth
    );
    const proposal = await this.executor.generateProposal(task);
    const quote: TaskQuote = {
      taskId: task.id,
      agentId: this.config.agentId,
      priceEth,
      estimatedDelivery: estimateDelivery(task),
      proposal,
      createdAt: new Date().toISOString(),
    };
    await this.marketplace.submitQuote(quote);
  }

  private async workOnTask(task: MarketplaceTask): Promise<void> {
    const quote: TaskQuote = {
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

    const activeTask: ActiveTask = {
      task,
      quote,
      startedAt: new Date().toISOString(),
      turnCount: 0,
    };
    this.activeTasks.set(task.id, activeTask);

    try {
      await this.marketplace.updateTaskProgress(task.id, "in_progress");
      const result = await this.executor.execute(activeTask);
      const ok = await this.marketplace.submitResult(result);
      if (ok) {
        this.stats.tasksCompleted++;
        this.accumulateEarnings(quote.priceEth);
      }
    } catch (error) {
      this.stats.tasksFailed++;
      logger.error(`Task ${task.id} failed`, { error });
    } finally {
      this.activeTasks.delete(task.id);
      await this.syncDashboardMetrics();
    }
  }

  // ─── Lead Pipeline ────────────────────────────────────────────────────────────

  private async runLeadPipeline(): Promise<void> {
    logger.info("[Leads] Running scheduled lead pipeline...");
    await this.leads.scrapeFromApify({
      query: "AI sales automation CRM #SalesTech",
      platform: "twitter",
      maxResults: 50,
    });
    await this.leads.scoreLeads();
    await this.leads.syncToGHL("warm");
    await this.syncDashboardMetrics();
  }

  // ─── Dashboard Sync ───────────────────────────────────────────────────────────

  private async syncDashboardMetrics(): Promise<void> {
    const walletStatus = await this.wallet.getStatus().catch(() => null);
    const leadStats = this.leads.getStats();
    const postHistory = this.poster.getPostHistory(100);
    const monthlyUsd = this.stripe
      ? await this.stripe.getMonthlyRevenue().catch(() => 0)
      : 0;

    updateNestedMetrics("agent", {
      id: this.config.agentId,
      status: "running",
      lastActive: this.stats.lastActive,
    });
    updateNestedMetrics("tasks", {
      active: this.activeTasks.size,
      completed: this.stats.tasksCompleted,
      failed: this.stats.tasksFailed,
      declined: this.stats.tasksDeclined,
    });
    updateNestedMetrics("revenue", {
      ethEarned: this.stats.totalEthEarned,
      usdEarned: walletStatus?.balanceUsd ?? 0,
      monthlyUsd,
    });
    updateNestedMetrics("social", {
      tweetsPosted: postHistory.length,
    });
    updateNestedMetrics("leads", {
      scraped: leadStats.total,
      scored: leadStats.scored,
      qualified: leadStats.hot,
      nurtured: leadStats.warm,
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private accumulateEarnings(amountEth: string): void {
    const sum = parseFloat(this.stats.totalEthEarned) + parseFloat(amountEth);
    this.stats.totalEthEarned = sum.toFixed(6);
  }

  getStats(): AgentStats {
    return { ...this.stats };
  }

  getActiveTasks(): ActiveTask[] {
    return Array.from(this.activeTasks.values());
  }
}
