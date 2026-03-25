import express, { Request, Response } from "express";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
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
    monthlyUsd: number;
    whopOrders: number;
    stripeMode: "test" | "live";
  };
  social: {
    tweetsPosted: number;
    xApiStatus: "active" | "depleted" | "manual";
    engagementReplies: number;
  };
  leads: {
    total: number;
    scored: number;
    qualified: number;
    nurtured: number;
  };
  learning: {
    studySessions: number;
    lastStudied: string;
    topicsResearched: number;
  };
  pantheon: {
    connected: boolean;
    pendingDirectives: number;
    lastHeartbeat: string;
  };
  scaling: {
    currentPhase: number;
    phaseName: string;
    kpiProgress: number;
    kpiTarget: number;
    kpiUnit: string;
    kpiPercent: number;
    pendingMilestones: string[];
  };
}

let metricsStore: DashboardMetrics = {
  agent: { id: "PENDING", status: "running", uptime: 0, lastActive: new Date().toISOString() },
  tasks: { active: 0, completed: 0, failed: 0, declined: 0 },
  revenue: { ethEarned: "0", monthlyUsd: 0, whopOrders: 0, stripeMode: "test" },
  social: { tweetsPosted: 0, xApiStatus: "depleted", engagementReplies: 0 },
  leads: { total: 0, scored: 0, qualified: 0, nurtured: 0 },
  learning: { studySessions: 0, lastStudied: "", topicsResearched: 0 },
  pantheon: { connected: false, pendingDirectives: 0, lastHeartbeat: "" },
  scaling: {
    currentPhase: 1,
    phaseName: "Lock San Diego",
    kpiProgress: 0,
    kpiTarget: 10,
    kpiUnit: "customers",
    kpiPercent: 0,
    pendingMilestones: [],
  },
};

const startTime = Date.now();

// ─── Event Queue (SSE + polling) ──────────────────────────────────────────────
interface DashEvent { level: string; message: string; ts: string }
const eventQueue: DashEvent[] = [];
const sseClients: Response[] = [];

export function pushDashboardEvent(level: "INFO" | "WARN" | "ERROR" | "EXEC", message: string): void {
  const ev: DashEvent = { level, message, ts: new Date().toISOString() };
  eventQueue.unshift(ev);
  if (eventQueue.length > 200) eventQueue.pop();
  const payload = `data: ${JSON.stringify(ev)}\n\n`;
  sseClients.forEach(c => { try { c.write(payload); } catch {} });
}

// ─── Research Store ───────────────────────────────────────────────────────────
interface ResearchItem { title: string; body: string; tag?: string }
interface ResearchStore {
  market: ResearchItem[];
  crypto: ResearchItem[];
  betting: ResearchItem[];
  updatedAt: string;
}
let researchStore: ResearchStore = {
  market: [
    { title: "Fed Policy Watch", body: "Rate trajectory signals key for risk asset allocation. Monitor PCE data.", tag: "Macro" },
    { title: "AI Sector Rotation", body: "Semi and infrastructure plays leading. NVDA, AVGO, TSM supply chain watch.", tag: "Equities" },
  ],
  crypto: [
    { title: "ETH Base L2 Activity", body: "On-chain activity growing. CashClaw wallet on Base — low fees for payouts.", tag: "On-chain" },
    { title: "BTC Institutional Flows", body: "ETF inflows watch. Whale accumulation zones near current levels.", tag: "Structure" },
  ],
  betting: [
    { title: "Line Value Framework", body: "Track closing line value. Bet only when edge exceeds vig. Log every bet.", tag: "Edge" },
    { title: "Prop Market Inefficiency", body: "Player props often mispriced early. Target before sharp action.", tag: "Specials" },
  ],
  updatedAt: new Date().toISOString(),
};

export function updateResearch(patch: Partial<ResearchStore>): void {
  researchStore = { ...researchStore, ...patch, updatedAt: new Date().toISOString() };
}

// ─── Journal Store (in-memory fallback) ──────────────────────────────────────
interface JournalEntry { id: string; name: string; thesis: string; risk: string; ts: string }
const journalStore: JournalEntry[] = [];

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
<title>ASAM CashClaw — Unified Command</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', sans-serif; background: #0d0d0f; color: #e0e0e0; }
  header { background: linear-gradient(135deg,#0f0c29,#302b63,#24243e); padding: 16px 32px; border-bottom: 1px solid #2a2a4a; display: flex; align-items: center; justify-content: space-between; }
  header h1 { font-size: 1.4rem; color: #00d4ff; }
  header .subtitle { font-size: 0.75rem; color: #888; }
  header .pantheon-badge { font-size: 0.75rem; padding: 4px 10px; border-radius: 12px; background: {{PANTHEON_BG}}; color: {{PANTHEON_COLOR}}; }
  .phase-banner { background: #1a1a2e; border-bottom: 2px solid #01696F; padding: 10px 32px; display: flex; align-items: center; gap: 20px; }
  .phase-banner .phase-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; color: #888; }
  .phase-banner .phase-name { font-size: 1rem; font-weight: 700; color: #00d4ff; }
  .phase-banner .progress-bar { flex: 1; background: #0d0d0f; border-radius: 4px; height: 8px; overflow: hidden; }
  .phase-banner .progress-fill { height: 100%; background: linear-gradient(90deg,#00ff87,#00d4ff); border-radius: 4px; width: {{KPI_PERCENT}}%; }
  .phase-banner .kpi-text { font-size: 0.8rem; color: #aaa; white-space: nowrap; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; padding: 24px 32px; }
  .card { background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 8px; padding: 20px; }
  .card.highlight { border-color: #01696F; }
  .card h2 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 16px; }
  .metric { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .metric .label { font-size: 0.85rem; color: #aaa; }
  .metric .value { font-size: 1rem; font-weight: 600; }
  .green { color: #00ff87; } .yellow { color: #ffd700; } .red { color: #ff4d4d; } .blue { color: #00d4ff; } .gray { color: #666; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
  .dot-green { background: #00ff87; box-shadow: 0 0 6px #00ff87; } .dot-yellow { background: #ffd700; } .dot-red { background: #ff4d4d; } .dot-blue { background: #00d4ff; box-shadow: 0 0 6px #00d4ff; }
  .milestones { margin-top: 8px; }
  .milestone { font-size: 0.78rem; padding: 3px 0; color: #aaa; }
  .milestone::before { content: "◯ "; color: #ffd700; }
  footer { text-align: center; padding: 16px; font-size: 0.75rem; color: #555; }
</style>
</head>
<body>
<header>
  <div>
    <h1>⚡ ASAM CashClaw — Unified Command</h1>
    <span class="subtitle">Autonomous Revenue Agent · San Diego County · Part of the 46-agent Brain Series</span>
  </div>
  <span class="pantheon-badge">Pantheon: {{PANTHEON_STATUS}}</span>
</header>
<div class="phase-banner">
  <div>
    <div class="phase-label">Scaling Phase {{PHASE_ID}} of 5</div>
    <div class="phase-name">{{PHASE_NAME}}</div>
  </div>
  <div class="progress-bar"><div class="progress-fill"></div></div>
  <div class="kpi-text">{{KPI_PROGRESS}} / {{KPI_TARGET}} {{KPI_UNIT}} ({{KPI_PERCENT}}%)</div>
</div>
<div class="grid">
  <div class="card">
    <h2>Agent Status</h2>
    <div class="metric"><span class="label">Status</span><span class="value green"><span class="status-dot dot-green"></span>{{STATUS}}</span></div>
    <div class="metric"><span class="label">Agent ID</span><span class="value blue">{{AGENT_ID}}</span></div>
    <div class="metric"><span class="label">Uptime</span><span class="value">{{UPTIME}}</span></div>
    <div class="metric"><span class="label">Last Active</span><span class="value">{{LAST_ACTIVE}}</span></div>
  </div>
  <div class="card highlight">
    <h2>Pantheon Bridge</h2>
    <div class="metric"><span class="label">PaperClip</span><span class="value {{PANTHEON_COLOR_CLASS}}"><span class="status-dot {{PANTHEON_DOT}}"></span>{{PANTHEON_STATUS}}</span></div>
    <div class="metric"><span class="label">Pending Directives</span><span class="value {{DIRECTIVES_COLOR}}">{{PENDING_DIRECTIVES}}</span></div>
    <div class="metric"><span class="label">Last Heartbeat</span><span class="value">{{LAST_HB}}</span></div>
    <div class="metric"><span class="label">Reports to</span><span class="value blue">Hermes (CFO)</span></div>
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
    <div class="metric"><span class="label">USD (this month)</span><span class="value green">\${{MONTHLY_USD}}</span></div>
    <div class="metric"><span class="label">Whop Orders</span><span class="value">{{WHOP_ORDERS}}</span></div>
    <div class="metric"><span class="label">Stripe Mode</span><span class="value {{STRIPE_COLOR}}">{{STRIPE_MODE}}</span></div>
  </div>
  <div class="card">
    <h2>Social Engine</h2>
    <div class="metric"><span class="label">Tweets Posted</span><span class="value">{{TWEETS}}</span></div>
    <div class="metric"><span class="label">X API</span><span class="value {{X_COLOR}}">{{X_STATUS}}</span></div>
    <div class="metric"><span class="label">Replies Sent</span><span class="value">{{REPLIES}}</span></div>
  </div>
  <div class="card">
    <h2>Lead Pipeline</h2>
    <div class="metric"><span class="label">Total Leads</span><span class="value">{{TOTAL_LEADS}}</span></div>
    <div class="metric"><span class="label">AI Scored</span><span class="value blue">{{SCORED}}</span></div>
    <div class="metric"><span class="label">Hot Leads</span><span class="value green">{{QUALIFIED}}</span></div>
    <div class="metric"><span class="label">Warm (nurture)</span><span class="value yellow">{{NURTURED}}</span></div>
  </div>
  <div class="card">
    <h2>Learning Engine</h2>
    <div class="metric"><span class="label">Study Sessions</span><span class="value">{{SESSIONS}}</span></div>
    <div class="metric"><span class="label">Last Studied</span><span class="value">{{LAST_STUDIED}}</span></div>
    <div class="metric"><span class="label">Topics Covered</span><span class="value blue">{{TOPICS}}</span></div>
  </div>
  <div class="card">
    <h2>Phase {{PHASE_ID}} — Open Milestones</h2>
    <div class="milestones">{{MILESTONES_HTML}}</div>
  </div>
</div>
<footer>ASAM CashClaw · PaperClip Pantheon Arm · whop.com/real-estate-automations · Auto-refreshes every 30s</footer>
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
  app.use(express.json({ limit: "5mb" }));

  // Serve Wealth Command Center UI from public/
  const publicDir = path.join(process.cwd(), "public");
  app.use(express.static(publicDir));

  // ── Legacy CashClaw ops dashboard (kept at /ops for direct access) ────────
  app.get("/ops", (_req: Request, res: Response) => {
    const m = metricsStore;
    const pantheonConnected = m.pantheon.connected;
    const xStatusColor = m.social.xApiStatus === "active" ? "green" : m.social.xApiStatus === "depleted" ? "red" : "yellow";
    const stripeLive = m.revenue.stripeMode === "live";

    const milestonesHtml = m.scaling.pendingMilestones.length
      ? m.scaling.pendingMilestones
          .slice(0, 5)
          .map((ms) => `<div class="milestone">${ms}</div>`)
          .join("")
      : '<div class="milestone" style="color:#00ff87">All milestones complete!</div>';

    const html = HTML_TEMPLATE
      .replace(/{{STATUS}}/g, m.agent.status)
      .replace(/{{AGENT_ID}}/g, m.agent.id.slice(0, 20))
      .replace(/{{UPTIME}}/g, formatUptime(Date.now() - startTime))
      .replace(/{{LAST_ACTIVE}}/g, new Date(m.agent.lastActive).toLocaleTimeString())
      .replace(/{{PANTHEON_STATUS}}/g, pantheonConnected ? "CONNECTED" : "STANDALONE")
      .replace(/{{PANTHEON_BG}}/g, pantheonConnected ? "#003300" : "#1a1a00")
      .replace(/{{PANTHEON_COLOR}}/g, pantheonConnected ? "#00ff87" : "#ffd700")
      .replace(/{{PANTHEON_COLOR_CLASS}}/g, pantheonConnected ? "green" : "yellow")
      .replace(/{{PANTHEON_DOT}}/g, pantheonConnected ? "dot-green" : "dot-yellow")
      .replace(/{{PENDING_DIRECTIVES}}/g, String(m.pantheon.pendingDirectives))
      .replace(/{{DIRECTIVES_COLOR}}/g, m.pantheon.pendingDirectives > 0 ? "yellow" : "gray")
      .replace(/{{LAST_HB}}/g, m.pantheon.lastHeartbeat ? new Date(m.pantheon.lastHeartbeat).toLocaleTimeString() : "—")
      .replace(/{{ACTIVE_TASKS}}/g, String(m.tasks.active))
      .replace(/{{COMPLETED}}/g, String(m.tasks.completed))
      .replace(/{{FAILED}}/g, String(m.tasks.failed))
      .replace(/{{DECLINED}}/g, String(m.tasks.declined))
      .replace(/{{ETH_EARNED}}/g, m.revenue.ethEarned)
      .replace(/{{MONTHLY_USD}}/g, m.revenue.monthlyUsd.toFixed(2))
      .replace(/{{WHOP_ORDERS}}/g, String(m.revenue.whopOrders))
      .replace(/{{STRIPE_MODE}}/g, m.revenue.stripeMode.toUpperCase())
      .replace(/{{STRIPE_COLOR}}/g, stripeLive ? "green" : "yellow")
      .replace(/{{TWEETS}}/g, String(m.social.tweetsPosted))
      .replace(/{{X_STATUS}}/g, m.social.xApiStatus.toUpperCase())
      .replace(/{{X_COLOR}}/g, xStatusColor)
      .replace(/{{REPLIES}}/g, String(m.social.engagementReplies))
      .replace(/{{TOTAL_LEADS}}/g, String(m.leads.total))
      .replace(/{{SCORED}}/g, String(m.leads.scored))
      .replace(/{{QUALIFIED}}/g, String(m.leads.qualified))
      .replace(/{{NURTURED}}/g, String(m.leads.nurtured))
      .replace(/{{SESSIONS}}/g, String(m.learning.studySessions))
      .replace(/{{LAST_STUDIED}}/g, m.learning.lastStudied ? new Date(m.learning.lastStudied).toLocaleTimeString() : "—")
      .replace(/{{TOPICS}}/g, String(m.learning.topicsResearched))
      .replace(/{{PHASE_ID}}/g, String(m.scaling.currentPhase))
      .replace(/{{PHASE_NAME}}/g, m.scaling.phaseName)
      .replace(/{{KPI_PROGRESS}}/g, String(m.scaling.kpiProgress))
      .replace(/{{KPI_TARGET}}/g, String(m.scaling.kpiTarget))
      .replace(/{{KPI_UNIT}}/g, m.scaling.kpiUnit)
      .replace(/{{KPI_PERCENT}}/g, String(m.scaling.kpiPercent))
      .replace(/{{MILESTONES_HTML}}/g, milestonesHtml);

    res.send(html);
  });

  app.get("/api/metrics", (_req: Request, res: Response) => {
    res.json({ ...metricsStore, uptime: Date.now() - startTime });
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", agentId: metricsStore.agent.id });
  });

  // ── Research Cards ─────────────────────────────────────────────────────────
  app.get("/api/research", (_req: Request, res: Response) => {
    res.json(researchStore);
  });

  // ── File Summarizer ────────────────────────────────────────────────────────
  app.post("/api/summarize", async (req: Request, res: Response) => {
    const { content, filenames } = req.body as { content: string; filenames: string[] };
    if (!content) { res.status(400).json({ error: "No content provided" }); return; }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.json({ summary: "⚠️  ANTHROPIC_API_KEY not set — agent must be running to summarize files." });
      return;
    }

    try {
      const client = new Anthropic({ apiKey });
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: "You are a concise financial and business analyst. Summarize the provided documents in bullet points. Focus on key insights, numbers, risks, and action items. Be brief.",
        messages: [{ role: "user", content: `Summarize these files (${(filenames || []).join(", ")}):\n\n${content.slice(0, 8000)}` }],
      });
      const text = message.content.find(b => b.type === "text")?.text ?? "No summary generated.";
      pushDashboardEvent("INFO", `Summarized: ${(filenames || []).join(", ")}`);
      res.json({ summary: text });
    } catch (e) {
      logger.error("[Dashboard] Summarize error", { e });
      res.status(500).json({ error: "Summarization failed", detail: String(e) });
    }
  });

  // ── Idea Journal (server-side backup; client also writes to localStorage) ──
  app.get("/api/journal", (_req: Request, res: Response) => {
    res.json({ entries: journalStore });
  });

  app.post("/api/journal", (req: Request, res: Response) => {
    const { name, thesis, risk } = req.body as { name: string; thesis: string; risk: string };
    if (!name || !thesis || !risk) { res.status(400).json({ error: "name, thesis, risk required" }); return; }
    const entry: JournalEntry = {
      id: Date.now().toString(),
      name: String(name).slice(0, 200),
      thesis: String(thesis).slice(0, 500),
      risk: String(risk).slice(0, 500),
      ts: new Date().toISOString(),
    };
    journalStore.unshift(entry);
    if (journalStore.length > 500) journalStore.pop();
    pushDashboardEvent("INFO", `Journal entry saved: "${entry.name}"`);
    res.json({ entry });
  });

  // ── SSE Event Stream ───────────────────────────────────────────────────────
  app.get("/api/events/stream", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.flushHeaders();

    // Send last 20 events on connect
    eventQueue.slice(0, 20).reverse().forEach(ev => {
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
    });

    sseClients.push(res);

    // Keep-alive ping every 15s
    const ping = setInterval(() => {
      try { res.write(": ping\n\n"); } catch {}
    }, 15000);

    req.on("close", () => {
      clearInterval(ping);
      const idx = sseClients.indexOf(res);
      if (idx !== -1) sseClients.splice(idx, 1);
    });
  });

  app.get("/api/events/latest", (req: Request, res: Response) => {
    const limit = Math.min(parseInt(String(req.query.limit) || "20"), 50);
    res.json({ events: eventQueue.slice(0, limit) });
  });

  let server: ReturnType<typeof app.listen> | null = null;

  return {
    start: () => {
      server = app.listen(port, () => {
        logger.info(`[Dashboard] Wealth Command Center: http://localhost:${port}`);
        logger.info(`[Dashboard] Ops view: http://localhost:${port}/ops`);
        logger.info(`[Dashboard] API metrics: http://localhost:${port}/api/metrics`);
      });
    },
    stop: () => {
      sseClients.forEach(c => { try { c.end(); } catch {} });
      server?.close();
    },
  };
}
