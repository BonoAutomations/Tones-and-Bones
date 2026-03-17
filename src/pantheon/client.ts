import axios, { AxiosInstance } from "axios";
import { AgentStats, ActiveTask } from "../types";
import { logger } from "../utils/logger";

/**
 * PaperClip Pantheon — 9-agent executive layer running at localhost:3100
 * Company ID: d08afd51-83c7-4505-8669-436e382e0939
 *
 * CashClaw reports to Hermes (CFO) and receives task routing from Apollo (PM).
 * Socrates (CEO) has top-level visibility via the heartbeat endpoint.
 *
 * This bridge is the Vegeta+Goku fusion:
 *   Pantheon = strategic intelligence
 *   CashClaw = autonomous execution muscle
 */

export type PantheonAgent =
  | "socrates"   // CEO — strategic oversight
  | "hermes"     // CFO — revenue ops, CashClaw execution
  | "artemis"    // Researcher — market intelligence, lead scoring
  | "athena"     // Researcher — competitive analysis
  | "apollo"     // PM — task routing
  | "hephaestus" // CTO — infrastructure
  | "aphrodite"  // Designer — brand/UX
  | "daedalus"   // Engineer — build/deploy
  | "prometheus"; // CMO — content strategy

export interface PantheonDirective {
  id: string;
  from: PantheonAgent;
  type:
    | "task_assignment"
    | "pricing_override"
    | "phase_advance"
    | "content_push"
    | "lead_priority"
    | "shutdown"
    | "status_request";
  payload: Record<string, unknown>;
  issuedAt: string;
  priority: "low" | "normal" | "high" | "critical";
}

export interface CashClawHeartbeat {
  agentId: string;
  timestamp: string;
  status: "running" | "paused" | "error";
  activeTasks: number;
  tasksCompleted: number;
  ethEarned: string;
  currentPhase: number;
  uptime: number;
  blockers: string[];
}

export class PantheonClient {
  private http: AxiosInstance;
  private companyId: string;
  private isConnected = false;
  private startTime = Date.now();
  private pendingDirectives: PantheonDirective[] = [];

  constructor() {
    const baseURL =
      process.env.PANTHEON_URL || "http://localhost:3100";
    this.companyId =
      process.env.PANTHEON_COMPANY_ID ||
      "d08afd51-83c7-4505-8669-436e382e0939";

    this.http = axios.create({
      baseURL,
      headers: {
        "Content-Type": "application/json",
        "X-Agent-Id": "cashclaw",
        "X-Company-Id": this.companyId,
      },
      timeout: 5000,
    });
  }

  /** Test connectivity to the Pantheon */
  async connect(): Promise<boolean> {
    try {
      await this.http.get("/health");
      this.isConnected = true;
      logger.info("[Pantheon] Connected to PaperClip Pantheon");
      return true;
    } catch {
      this.isConnected = false;
      logger.warn(
        "[Pantheon] Pantheon not reachable — CashClaw running in standalone mode"
      );
      return false;
    }
  }

  /** Send heartbeat to Hermes (CFO) with current stats */
  async heartbeat(
    stats: AgentStats,
    activeTasks: ActiveTask[],
    currentPhase: number,
    blockers: string[] = []
  ): Promise<void> {
    if (!this.isConnected) return;

    const payload: CashClawHeartbeat = {
      agentId: "cashclaw",
      timestamp: new Date().toISOString(),
      status: "running",
      activeTasks: activeTasks.length,
      tasksCompleted: stats.tasksCompleted,
      ethEarned: stats.totalEthEarned,
      currentPhase,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      blockers,
    };

    try {
      await this.http.post("/agents/cashclaw/heartbeat", payload);
      logger.debug("[Pantheon] Heartbeat sent to Hermes");
    } catch {
      this.isConnected = false;
      logger.warn("[Pantheon] Lost connection during heartbeat");
    }
  }

  /**
   * Poll Apollo (PM) for pending directives to CashClaw.
   * Called on each main poll cycle.
   */
  async fetchDirectives(): Promise<PantheonDirective[]> {
    if (!this.isConnected) return [];

    try {
      const resp = await this.http.get(
        "/agents/cashclaw/directives?status=pending"
      );
      const directives: PantheonDirective[] = resp.data?.directives || [];
      if (directives.length > 0) {
        logger.info(`[Pantheon] ${directives.length} directive(s) from Pantheon`);
      }
      return directives;
    } catch {
      return [];
    }
  }

  /** Acknowledge a directive after processing */
  async ackDirective(directiveId: string, result: string): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.http.post(`/agents/cashclaw/directives/${directiveId}/ack`, {
        result,
        ackedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.warn(`[Pantheon] Failed to ack directive ${directiveId}`, { error });
    }
  }

  /**
   * Report a revenue event to Hermes (CFO).
   * Called on every completed gig or Whop/Stripe sale.
   */
  async reportRevenue(event: {
    source: "moltlaunch" | "whop" | "stripe";
    amountEth?: string;
    amountUsd?: number;
    productId?: string;
    taskId?: string;
  }): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.http.post("/revenue/events", {
        reporter: "cashclaw",
        ...event,
        timestamp: new Date().toISOString(),
      });
      logger.info(
        `[Pantheon] Revenue reported to Hermes: ${event.source} ${
          event.amountEth ? event.amountEth + " ETH" : "$" + event.amountUsd
        }`
      );
    } catch {
      // Non-critical — silently fail
    }
  }

  /**
   * Push content brief to Prometheus (CMO) for distribution.
   * Prometheus owns the multi-account X posting strategy.
   */
  async pushContentBrief(brief: {
    theme: string;
    tweetThreads: string[];
    linkedInPost: string;
    emailSubjectLines: string[];
  }): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.http.post("/agents/prometheus/content-brief", {
        source: "cashclaw",
        brief,
        createdAt: new Date().toISOString(),
      });
      logger.info("[Pantheon] Content brief sent to Prometheus");
    } catch {
      // Non-critical
    }
  }

  /**
   * Notify Artemis (Researcher) of new scored leads.
   * Artemis can enrich and re-score with deeper market intelligence.
   */
  async forwardLeads(leads: Array<{
    name: string;
    email?: string;
    score: string;
    context: string;
  }>): Promise<void> {
    if (!this.isConnected || leads.length === 0) return;
    try {
      await this.http.post("/agents/artemis/leads", {
        source: "cashclaw",
        leads,
        forwardedAt: new Date().toISOString(),
      });
      logger.info(`[Pantheon] ${leads.length} leads forwarded to Artemis`);
    } catch {
      // Non-critical
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}
