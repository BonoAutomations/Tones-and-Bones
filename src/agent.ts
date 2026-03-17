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
import { PantheonClient, PantheonDirective } from "./pantheon/client";
import { PhaseTracker } from "./scaling/phases";
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
  private pantheon: PantheonClient;
  private phaseTracker: PhaseTracker;
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
  private heartbeatTimer?: NodeJS.Timeout;

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
    this.pantheon = new PantheonClient();
    this.phaseTracker = new PhaseTracker();
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
    logger.info("  Agent ID: 32180 | moltlaunch.com/agent/32180");
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

    // 3. Connect to PaperClip Pantheon (non-blocking — runs standalone if unreachable)
    const pantheonConnected = await this.pantheon.connect();
    updateNestedMetrics("pantheon", {
      connected: pantheonConnected,
      lastHeartbeat: pantheonConnected ? new Date().toISOString() : "",
    });

    // 4. Sync Stripe products (WHOP is read-only — managed at whop.com/real-estate-automations)
    if (this.stripe) {
      await this.stripe.syncProducts().catch((e) =>
        logger.warn("Stripe sync failed", { e })
      );
    }

    // 5. Start X auto-poster
    await this.poster.start();

    // 6. Generate first content brief
    await this.contentGen.generateDailyBrief().catch(() =>
      logger.warn("Initial content brief failed")
    );

    // 7. Start main task polling loop
    await this.poll();
    this.schedulePolling();

    // 8. Schedule Pantheon heartbeat (every 5 minutes)
    this.schedulePantheonHeartbeat();

    // 9. Schedule learning sessions
    if (this.config.learningEnabled) {
      this.scheduleStudy();
    }

    // 10. Schedule lead pipeline runs (every 6 hours)
    this.scheduleleadPipeline();

    // 11. Schedule daily content brief (24h)
    this.scheduleContentBrief();

    // 12. Keep dashboard metrics fresh (every 60s)
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
      this.heartbeatTimer,
    ].forEach((t) => t && clearInterval(t));
    logger.info("CashClaw stopped");
  }

  // ─── Scheduling ──────────────────────────────────────────────────────────────

  private schedulePolling(): void {
    this.pollTimer = setInterval(async () => {
      if (this.isRunning) await this.poll();
    }, this.config.polling.intervalMs);
  }

  private schedulePantheonHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      if (!this.isRunning) return;
      await this.pantheon.heartbeat(
        this.stats,
        Array.from(this.activeTasks.values()),
        this.phaseTracker.getPhaseId()
      );
      updateNestedMetrics("pantheon", {
        connected: this.pantheon.getConnectionStatus(),
        lastHeartbeat: new Date().toISOString(),
      });
    }, 5 * 60 * 1000);
  }

  private scheduleStudy(): void {
    this.studyTimer = setInterval(async () => {
      if (!this.isRunning) return;
      await this.learner.study();
      updateNestedMetrics("learning", {
        studySessions: this.learner.getRecentInsights(100).length,
        lastStudied: new Date().toISOString(),
        topicsResearched: this.learner.getRecentInsights(100).length,
      });
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
      const brief = await this.contentGen.generateDailyBrief().catch(() => null);
      if (brief) {
        await this.pantheon.pushContentBrief({
          theme: brief.theme,
          tweetThreads: brief.tweetThreads,
          linkedInPost: brief.linkedInPost,
          emailSubjectLines: brief.emailSubjectLines,
        }).catch(() => {});
      }
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

    // Process Pantheon directives first
    const directives = await this.pantheon.fetchDirectives();
    if (directives.length > 0) {
      updateNestedMetrics("pantheon", { pendingDirectives: directives.length });
      for (const directive of directives) {
        await this.processDirective(directive);
      }
    }

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

  private async processDirective(directive: PantheonDirective): Promise<void> {
    logger.info(
      `[Pantheon] Processing directive ${directive.id} (${directive.type}) from ${directive.from}`
    );

    try {
      switch (directive.type) {
        case "phase_advance": {
          const { milestone } = directive.payload as { milestone?: string };
          if (milestone) this.phaseTracker.completeMilestone(milestone);
          break;
        }
        case "shutdown":
          logger.warn("[Pantheon] Shutdown directive received — stopping agent");
          await this.stop();
          break;
        case "status_request":
          // Heartbeat will handle this on next cycle
          break;
        default:
          logger.info(`[Pantheon] Directive type "${directive.type}" noted`);
      }

      await this.pantheon.ackDirective(directive.id, "processed");
      updateNestedMetrics("pantheon", { pendingDirectives: 0 });
    } catch (error) {
      logger.warn(`[Pantheon] Failed to process directive ${directive.id}`, { error });
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
    const priceEth = calculatePrice(
      task,
      this.config.pricing.baseRateEth,
      this.config.pricing.maxRateEth
    );
    const quote: TaskQuote = {
      taskId: task.id,
      agentId: this.config.agentId,
      priceEth,
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
        this.accumulateEarnings(priceEth);

        // Report revenue to Hermes (CFO) via Pantheon
        await this.pantheon.reportRevenue({
          source: "moltlaunch",
          amountEth: priceEth,
          taskId: task.id,
        });

        // Update phase tracker with latest ETH earnings
        this.phaseTracker.updateMetrics(this.stats.tasksCompleted, 0);
        this.syncScalingMetrics();
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

    // Score any unscored leads (ingest happens via GHL webhooks / Whop purchases)
    const scored = await this.leads.scoreLeads();

    // Sync warm/hot leads to GHL CRM
    await this.leads.syncToGHL("warm");

    // Forward hot leads to Artemis (Researcher) for enrichment
    const hotLeads = this.leads.getLeads({ score: "hot" }).map((l) => ({
      name: l.name,
      email: l.email,
      score: l.score!,
      context: l.rawContext,
    }));
    if (hotLeads.length > 0) {
      await this.pantheon.forwardLeads(hotLeads);
    }

    if (scored.length > 0) {
      logger.info(`[Leads] Pipeline complete — ${scored.length} leads scored`);
    }

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

    const whopOrderCount = this.whop
      ? (await this.whop.fetchOrders(50).catch(() => [])).length
      : 0;

    const stripeMode = process.env.STRIPE_MODE === "live" ? "live" : "test";
    const xApiStatus = (
      process.env.X_API_KEY ? "active" : "depleted"
    ) as "active" | "depleted" | "manual";

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
      monthlyUsd,
      whopOrders: whopOrderCount,
      stripeMode,
    });
    updateNestedMetrics("social", {
      tweetsPosted: postHistory.length,
      xApiStatus,
      engagementReplies: 0,
    });
    updateNestedMetrics("leads", {
      total: leadStats.total,
      scored: leadStats.scored,
      qualified: leadStats.hot,
      nurtured: leadStats.warm,
    });

    this.syncScalingMetrics();
  }

  private syncScalingMetrics(): void {
    const progress = this.phaseTracker.getProgress();
    updateNestedMetrics("scaling", {
      currentPhase: progress.phase.id,
      phaseName: progress.phase.name,
      kpiProgress: progress.kpiProgress,
      kpiTarget: progress.phase.kpiTarget,
      kpiUnit: progress.phase.kpiUnit,
      kpiPercent: progress.kpiPercent,
      pendingMilestones: progress.pendingMilestones,
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

  /** Ingest a GHL webhook payload as a lead */
  ingestGhlWebhook(payload: Record<string, unknown>): void {
    this.leads.ingestGhlWebhook(payload);
  }

  /** Ingest a Whop purchase as a lead for upsell nurturing */
  ingestWhopPurchase(email: string, productName: string, priceUsd: number): void {
    this.leads.ingestWhopPurchase({ email, productName, priceUsd });
  }

  /** Mark a scaling milestone as complete (e.g. "First Whop sale") */
  completeMilestone(milestone: string): void {
    this.phaseTracker.completeMilestone(milestone);
    this.syncScalingMetrics();
  }
}
