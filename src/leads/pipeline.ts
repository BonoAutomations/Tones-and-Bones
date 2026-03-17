import Anthropic from "@anthropic-ai/sdk";
import axios from "axios";
import { AgentConfig } from "../types";
import { logger } from "../utils/logger";

export type LeadScore = "cold" | "warm" | "hot";

export interface Lead {
  id: string;
  name: string;
  title?: string;
  company?: string;
  email?: string;
  twitterHandle?: string;
  linkedinUrl?: string;
  /** How this lead entered the pipeline */
  source: "manual" | "ghl-webhook" | "whop-purchase" | "referral";
  rawContext: string;
  score?: LeadScore;
  scoreReason?: string;
  scoredAt?: string;
  tags: string[];
  createdAt: string;
}

export class LeadPipeline {
  private anthropic: Anthropic;
  private config: AgentConfig;
  private leads: Lead[] = [];
  private ghlApiKey: string;

  constructor(config: AgentConfig) {
    this.config = config;
    this.anthropic = new Anthropic({ apiKey: config.llm.apiKey });
    this.ghlApiKey = process.env.GHL_API_KEY || "";
  }

  /** Add a lead manually or from a webhook payload */
  addLead(lead: Omit<Lead, "createdAt">): Lead {
    const full: Lead = { ...lead, createdAt: new Date().toISOString() };
    this.leads.push(full);
    logger.info(`[Leads] Added: ${full.name} (${full.source})`);
    return full;
  }

  /** Parse a GHL webhook body and add the contact as a lead */
  ingestGhlWebhook(payload: Record<string, unknown>): Lead {
    const name =
      [payload.firstName, payload.lastName].filter(Boolean).join(" ") ||
      "Unknown";
    return this.addLead({
      id: String(payload.id || payload.contactId || Date.now()),
      name,
      email: String(payload.email || ""),
      company: String(payload.companyName || ""),
      source: "ghl-webhook",
      rawContext: JSON.stringify(payload).slice(0, 600),
      tags: ["ghl-inbound"],
    });
  }

  /** Mark a Whop buyer as a lead for upsell nurturing */
  ingestWhopPurchase(payload: {
    email: string;
    productName: string;
    priceUsd: number;
  }): Lead {
    return this.addLead({
      id: `whop-${Date.now()}`,
      name: payload.email.split("@")[0],
      email: payload.email,
      source: "whop-purchase",
      rawContext: `Purchased: ${payload.productName} ($${payload.priceUsd})`,
      tags: ["whop-buyer", "upsell-candidate"],
    });
  }

  /** AI-score all unscored leads */
  async scoreLeads(): Promise<Lead[]> {
    const toScore = this.leads.filter((l) => !l.score);
    if (toScore.length === 0) return [];

    logger.info(`[Leads] Scoring ${toScore.length} leads with AI`);
    const scored: Lead[] = [];

    for (const lead of toScore) {
      const result = await this.scoreSingleLead(lead);
      scored.push(result);
      const idx = this.leads.findIndex((l) => l.id === lead.id);
      if (idx >= 0) this.leads[idx] = result;
    }

    return scored;
  }

  private async scoreSingleLead(lead: Lead): Promise<Lead> {
    const prompt = `Score this lead (hot/warm/cold) for ASAM — AI-powered sales & marketing for real estate agents.

Profile:
- Name: ${lead.name}
- Title: ${lead.title || "Unknown"}
- Company: ${lead.company || "Unknown"}
- Source: ${lead.source}
- Context: ${lead.rawContext.slice(0, 500)}

Respond ONLY with valid JSON: {"score":"hot"|"warm"|"cold","reason":"one sentence"}`;

    try {
      const stream = this.anthropic.messages.stream({
        model: this.config.llm.model,
        max_tokens: 128,
        messages: [{ role: "user", content: prompt }],
      });

      let raw = "";
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          raw += event.delta.text;
        }
      }

      const parsed = JSON.parse(raw.trim()) as { score: LeadScore; reason: string };
      return { ...lead, score: parsed.score, scoreReason: parsed.reason, scoredAt: new Date().toISOString() };
    } catch {
      return { ...lead, score: "cold", scoreReason: "Scoring failed", scoredAt: new Date().toISOString() };
    }
  }

  /** Push hot/warm leads to GoHighLevel CRM */
  async syncToGHL(minScore: LeadScore = "warm"): Promise<number> {
    if (!this.ghlApiKey) {
      logger.warn("[Leads] GHL_API_KEY not set — skipping CRM sync");
      return 0;
    }

    const order: LeadScore[] = ["cold", "warm", "hot"];
    const minIdx = order.indexOf(minScore);
    const eligible = this.leads.filter(
      (l) => l.score && order.indexOf(l.score) >= minIdx
    );

    let synced = 0;
    for (const lead of eligible) {
      try {
        await axios.post(
          "https://rest.gohighlevel.com/v1/contacts",
          {
            firstName: lead.name.split(" ")[0],
            lastName: lead.name.split(" ").slice(1).join(" "),
            email: lead.email,
            companyName: lead.company,
            tags: [...lead.tags, `score-${lead.score}`, lead.source],
          },
          { headers: { Authorization: `Bearer ${this.ghlApiKey}` } }
        );
        synced++;
      } catch (error) {
        logger.warn(`[Leads] GHL sync failed for ${lead.id}`, { error });
      }
    }

    logger.info(`[Leads] Synced ${synced}/${eligible.length} to GHL`);
    return synced;
  }

  getLeads(filter?: { score?: LeadScore }): Lead[] {
    if (!filter?.score) return [...this.leads];
    return this.leads.filter((l) => l.score === filter.score);
  }

  getStats() {
    return {
      total: this.leads.length,
      scored: this.leads.filter((l) => l.score).length,
      hot: this.leads.filter((l) => l.score === "hot").length,
      warm: this.leads.filter((l) => l.score === "warm").length,
      cold: this.leads.filter((l) => l.score === "cold").length,
    };
  }
}
