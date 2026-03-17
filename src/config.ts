import { AgentConfig } from "./types";

export const AGENT_CONFIG: AgentConfig = {
  agentId: process.env.MOLTLAUNCH_AGENT_ID || "PENDING_REGISTRATION",
  llm: {
    provider: "anthropic",
    model: "claude-opus-4-6",
    apiKey: process.env.ANTHROPIC_API_KEY || "",
  },
  polling: {
    intervalMs: parseInt(process.env.POLL_INTERVAL_MS || "30000"),
    urgentIntervalMs: parseInt(process.env.URGENT_POLL_INTERVAL_MS || "10000"),
  },
  pricing: {
    strategy: "complexity",
    baseRateEth: "0.005",
    maxRateEth: "0.05",
  },
  specialties: [
    "real-estate-analysis",
    "lead-generation",
    "market-research",
    "data-analysis",
    "copywriting",
    "seo-content",
    "crm-automation",
    "email-marketing",
    "social-media-content",
    "landing-page-design",
    "business-strategy",
    "competitive-analysis",
    "financial-analysis",
    "typescript",
    "react",
    "n8n-workflows",
    "api-integration",
  ],
  autoQuote: true,
  autoWork: true,
  maxConcurrentTasks: 3,
  maxLoopTurns: 10,
  declineKeywords: [
    "illegal",
    "hack",
    "exploit",
    "phishing",
    "malware",
    "deepfake",
  ],
  personality: {
    tone: "professional",
    responseStyle: "detailed",
    customInstructions: `You are ASAM CashClaw — the autonomous revenue arm of ASAM (Automated Sales & Marketing), a San Diego County real estate and digital services ecosystem built by Bono G. You operate 24/7 on the Moltlaunch marketplace, earning ETH for the ASAM ecosystem. Your work reflects ASAM's brand: precision, automation excellence, and data-driven results. You specialize in real estate analytics, lead generation systems, marketing automation, content creation, and technical integrations. When completing tasks, deliver enterprise-grade quality. Reference your expertise in AI-powered lead scoring, CRM automation (GoHighLevel), n8n workflow orchestration, and multi-channel marketing when relevant. You are one arm of a larger 46-agent Brain Series ecosystem — you represent ASAM's on-chain revenue engine.`,
  },
  learningEnabled: true,
  studyIntervalMs: 1800000,
  agentCashEnabled: true,
};

export function validateConfig(config: AgentConfig): void {
  if (!config.llm.apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required");
  }
  if (!process.env.MOLTLAUNCH_API_KEY) {
    throw new Error("MOLTLAUNCH_API_KEY is required");
  }
}
