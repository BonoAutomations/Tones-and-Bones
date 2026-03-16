import express, { Request, Response } from "express";
import { logger } from "../utils/logger";

export interface DashboardMetrics {
  agent: {
    id: string;
    status: "running" | "paused" | "error";
    uptime: number;
    lastActive: string;
  };
  tasks: {
    active: number;
    completed: number;
    failed: number;
    declined: number;
  };
  revenue: {
    ethEarned: string;
    usdEarned: number;
    monthlyUsd: number;
    whopOrders: number;
  };
  social: {
    tweetsPosted: number;
    scheduledNext: string;
    engagementReplies: number;
  };
  leads: {
    scraped: number;
    scored: number;
    qualified: number;
    nurtured: number;
  };
  learning: {
    studySessions: number;
    lastStudied: string;
    topicsResearched: number;
  };
}

let metricsStore: DashboardMetrics = {
  agent: { id: "PENDING", status: "running", uptime: 0, lastActive: new Date().toISOString() },
  tasks: { active: 0, completed: 0, failed: 0, declined: 0 },
  revenue: { ethEarned: "0", usdEarned: 0, monthlyUsd: 0, whopOrders: 0 },
  social: { tweetsPosted: 0, scheduledNext: "", engagementReplies: 0 },
  leads: { scraped: 0, scored: 0, qualified: 0, nurtured: 0 },
  learning: { studySessions: 0, lastStudied: "", topicsResearched: 0 },
};

const startTime = Date.now();

export function updateMetrics(patch: Partial<DashboardMetrics>): void {
  metricsStore = { ...metricsStore, ...patch };
}

export function updateNestedMetrics<K extends keyof DashboardMetrics>(
  section: K,
  patch: Partial<DashboardMetrics[K]>
): void {
  metricsStore[section] = { ...metricsStore[section], ...patch } as DashboardMetrics[K];
}

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="30">
<title>ASAM CashClaw Dashboard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', sans-serif; background: #0d0d0f; color: #e0e0e0; }
  header { background: #1a1a2e; padding: 16px 32px; border-bottom: 1px solid #2a2a4a; display: flex; align-items: center; gap: 12px; }
  header h1 { font-size: 1.4rem; color: #00d4ff; }
  header span { font-size: 0.8rem; color: #888; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; padding: 24px 32px; }
  .card { background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 8px; padding: 20px; }
  .card h2 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 16px; }
  .metric { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .metric .label { font-size: 0.85rem; color: #aaa; }
  .metric .value { font-size: 1rem; font-weight: 600; color: #e0e0e0; }
  .value.green { color: #00ff87; }
  .value.yellow { color: #ffd700; }
  .value.red { color: #ff4d4d; }
  .value.blue { color: #00d4ff; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
  .dot-green { background: #00ff87; box-shadow: 0 0 6px #00ff87; }
  .dot-yellow { background: #ffd700; }
  .dot-red { background: #ff4d4d; }
  footer { text-align: center; padding: 16px; font-size: 0.75rem; color: #555; }
</style>
</head>
<body>
<header>
  <div>
    <h1>⚡ ASAM CashClaw</h1>
    <span>Autonomous Revenue Agent · San Diego County</span>
  </div>
</header>
<div class="grid">
  <div class="card">
    <h2>Agent Status</h2>
    <div class="metric"><span class="label">Status</span><span class="value green"><span class="status-dot dot-green"></span>{{STATUS}}</span></div>
    <div class="metric"><span class="label">Agent ID</span><span class="value blue">{{AGENT_ID}}</span></div>
    <div class="metric"><span class="label">Uptime</span><span class="value">{{UPTIME}}</span></div>
    <div class="metric"><span class="label">Last Active</span><span class="value">{{LAST_ACTIVE}}</span></div>
  </div>
  <div class="card">
    <h2>Task Performance</h2>
    <div class="metric"><span class="label">Active Now</span><span class="value blue">{{ACTIVE_TASKS}}</span></div>
    <div class="metric"><span class="label">Completed</span><span class="value green">{{COMPLETED}}</span></div>
    <div class="metric"><span class="label">Failed</span><span class="value red">{{FAILED}}</span></div>
    <div class="metric"><span class="label">Declined</span><span class="value yellow">{{DECLINED}}</span></div>
  </div>
  <div class="card">
    <h2>Revenue</h2>
    <div class="metric"><span class="label">ETH Earned</span><span class="value green">{{ETH_EARNED}} ETH</span></div>
    <div class="metric"><span class="label">USD (all time)</span><span class="value green">${{USD_EARNED}}</span></div>
    <div class="metric"><span class="label">USD (this month)</span><span class="value blue">${{MONTHLY_USD}}</span></div>
    <div class="metric"><span class="label">WHOP Orders</span><span class="value">{{WHOP_ORDERS}}</span></div>
  </div>
  <div class="card">
    <h2>Social Automation</h2>
    <div class="metric"><span class="label">Tweets Posted</span><span class="value">{{TWEETS}}</span></div>
    <div class="metric"><span class="label">Next Post</span><span class="value blue">{{NEXT_POST}}</span></div>
    <div class="metric"><span class="label">Replies Sent</span><span class="value">{{REPLIES}}</span></div>
  </div>
  <div class="card">
    <h2>Lead Pipeline</h2>
    <div class="metric"><span class="label">Scraped</span><span class="value">{{SCRAPED}}</span></div>
    <div class="metric"><span class="label">AI Scored</span><span class="value blue">{{SCORED}}</span></div>
    <div class="metric"><span class="label">Qualified (hot)</span><span class="value green">{{QUALIFIED}}</span></div>
    <div class="metric"><span class="label">In Nurture</span><span class="value yellow">{{NURTURED}}</span></div>
  </div>
  <div class="card">
    <h2>Learning Engine</h2>
    <div class="metric"><span class="label">Study Sessions</span><span class="value">{{SESSIONS}}</span></div>
    <div class="metric"><span class="label">Last Studied</span><span class="value">{{LAST_STUDIED}}</span></div>
    <div class="metric"><span class="label">Topics Covered</span><span class="value blue">{{TOPICS}}</span></div>
  </div>
</div>
<footer>ASAM CashClaw · Part of the 46-agent Brain Series · Auto-refreshes every 30s</footer>
</body>
</html>`;

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

export function createDashboardServer(port = 3777): { start: () => void; stop: () => void } {
  const app = express();

  app.get("/", (_req: Request, res: Response) => {
    const m = metricsStore;
    const html = HTML_TEMPLATE
      .replace("{{STATUS}}", m.agent.status)
      .replace("{{AGENT_ID}}", m.agent.id.slice(0, 16))
      .replace("{{UPTIME}}", formatUptime(Date.now() - startTime))
      .replace("{{LAST_ACTIVE}}", new Date(m.agent.lastActive).toLocaleTimeString())
      .replace("{{ACTIVE_TASKS}}", String(m.tasks.active))
      .replace("{{COMPLETED}}", String(m.tasks.completed))
      .replace("{{FAILED}}", String(m.tasks.failed))
      .replace("{{DECLINED}}", String(m.tasks.declined))
      .replace("{{ETH_EARNED}}", m.revenue.ethEarned)
      .replace("{{USD_EARNED}}", m.revenue.usdEarned.toFixed(2))
      .replace("{{MONTHLY_USD}}", m.revenue.monthlyUsd.toFixed(2))
      .replace("{{WHOP_ORDERS}}", String(m.revenue.whopOrders))
      .replace("{{TWEETS}}", String(m.social.tweetsPosted))
      .replace("{{NEXT_POST}}", m.social.scheduledNext || "Scheduled")
      .replace("{{REPLIES}}", String(m.social.engagementReplies))
      .replace("{{SCRAPED}}", String(m.leads.scraped))
      .replace("{{SCORED}}", String(m.leads.scored))
      .replace("{{QUALIFIED}}", String(m.leads.qualified))
      .replace("{{NURTURED}}", String(m.leads.nurtured))
      .replace("{{SESSIONS}}", String(m.learning.studySessions))
      .replace("{{LAST_STUDIED}}", m.learning.lastStudied
        ? new Date(m.learning.lastStudied).toLocaleTimeString()
        : "—")
      .replace("{{TOPICS}}", String(m.learning.topicsResearched));

    res.send(html);
  });

  app.get("/api/metrics", (_req: Request, res: Response) => {
    res.json({ ...metricsStore, uptime: Date.now() - startTime });
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", agentId: metricsStore.agent.id });
  });

  let server: ReturnType<typeof app.listen> | null = null;

  return {
    start: () => {
      server = app.listen(port, () => {
        logger.info(`[Dashboard] Live at http://localhost:${port}`);
      });
    },
    stop: () => {
      server?.close();
    },
  };
}
