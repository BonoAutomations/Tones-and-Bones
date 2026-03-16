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
  source: "twitter" | "linkedin" | "apify" | "manual";
  rawContext: string;
  score?: LeadScore;
  scoreReason?: string;
  scoredAt?: string;
  nurtureStage?: number;
  tags: string[];
  createdAt: string;
}

export interface ScrapeConfig {
  query: string;
  platform: "twitter" | "linkedin";
  maxResults: number;
}

export class LeadPipeline {
  private anthropic: Anthropic;
  private config: AgentConfig;
  private leads: Lead[] = [];
  private ghlApiKey: string;
  private ghlLocationId: string;

  constructor(config: AgentConfig) {
    this.config = config;
    this.anthropic = new Anthropic({ apiKey: config.llm.apiKey });
    this.ghlApiKey = process.env.GHL_API_KEY || "";
    this.ghlLocationId = process.env.GHL_LOCATION_ID || "";
  }

  /** Scrape leads via Apify actors */
  async scrapeFromApify(scrapeConfig: ScrapeConfig): Promise<Lead[]> {
    const apifyToken = process.env.APIFY_TOKEN;
    if (!apifyToken) {
      logger.warn("[Leads] APIFY_TOKEN not set — skipping scrape");
      return [];
    }

    const actorId =
      scrapeConfig.platform === "twitter"
        ? "quacker/twitter-scraper"
        : "curious_coder/linkedin-profile-scraper";

    try {
      const run = await axios.post(
        `https://api.apify.com/v2/acts/${actorId}/runs?token=${apifyToken}`,
        {
          searchTerms: [scrapeConfig.query],
          maxTweets: scrapeConfig.maxResults,
          maxItems: scrapeConfig.maxResults,
        }
      );

      const runId = run.data.data.id;
      const results = await this.pollApifyRun(runId, apifyToken);

      const newLeads = results.map((r: Record<string, unknown>) =>
        this.normalizeApifyResult(r, scrapeConfig.platform)
      );

      this.leads.push(...newLeads);
      logger.info(`[Leads] Scraped ${newLeads.length} leads from ${scrapeConfig.platform}`);
      return newLeads;
    } catch (error) {
      logger.error("[Leads] Apify scrape failed", { error });
      return [];
    }
  }

  /** AI-powered lead scoring using Claude */
  async scoreLeads(leads?: Lead[]): Promise<Lead[]> {
    const toScore = (leads || this.leads).filter((l) => !l.score);
    if (toScore.length === 0) return [];

    logger.info(`[Leads] Scoring ${toScore.length} leads with AI`);
    const scored: Lead[] = [];

    for (const lead of toScore) {
      const result = await this.scoreSingleLead(lead);
      scored.push(result);
      // Update in main list
      const idx = this.leads.findIndex((l) => l.id === lead.id);
      if (idx >= 0) this.leads[idx] = result;
    }

    return scored;
  }

  private async scoreSingleLead(lead: Lead): Promise<Lead> {
    const prompt = `You are an expert B2B sales qualifier for ASAM — an AI-powered sales and marketing agency.

Score this lead as "hot", "warm", or "cold" based on their fit for ASAM services (CRM automation, AI lead gen, real estate analytics, marketing automation).

Lead Profile:
- Name: ${lead.name}
- Title: ${lead.title || "Unknown"}
- Company: ${lead.company || "Unknown"}
- Source: ${lead.source}
- Context: ${lead.rawContext.slice(0, 600)}

Respond with ONLY valid JSON in this exact shape:
{"score": "hot"|"warm"|"cold", "reason": "one concise sentence explaining the score"}`;

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
      return {
        ...lead,
        score: parsed.score,
        scoreReason: parsed.reason,
        scoredAt: new Date().toISOString(),
      };
    } catch {
      return { ...lead, score: "cold", scoreReason: "Scoring failed", scoredAt: new Date().toISOString() };
    }
  }

  /** Push hot/warm leads into GoHighLevel CRM */
  async syncToGHL(minScore: LeadScore = "warm"): Promise<number> {
    if (!this.ghlApiKey) {
      logger.warn("[Leads] GHL_API_KEY not set — skipping CRM sync");
      return 0;
    }

    const scoreOrder: LeadScore[] = ["cold", "warm", "hot"];
    const minIdx = scoreOrder.indexOf(minScore);
    const eligible = this.leads.filter(
      (l) => l.score && scoreOrder.indexOf(l.score) >= minIdx
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
            phone: "",
            companyName: lead.company,
            tags: [...lead.tags, `asam-score-${lead.score}`, lead.source],
            customField: {
              lead_source: lead.source,
              ai_score: lead.score,
              ai_score_reason: lead.scoreReason,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${this.ghlApiKey}`,
              "Content-Type": "application/json",
            },
          }
        );
        synced++;
      } catch (error) {
        logger.warn(`[Leads] Failed to sync lead ${lead.id} to GHL`, { error });
      }
    }

    logger.info(`[Leads] Synced ${synced}/${eligible.length} leads to GoHighLevel`);
    return synced;
  }

  private async pollApifyRun(
    runId: string,
    token: string,
    maxWaitMs = 120000
  ): Promise<Record<string, unknown>[]> {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000));
      const status = await axios.get(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`
      );
      if (status.data.data.status === "SUCCEEDED") {
        const items = await axios.get(
          `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${token}`
        );
        return items.data || [];
      }
      if (status.data.data.status === "FAILED") break;
    }
    return [];
  }

  private normalizeApifyResult(
    raw: Record<string, unknown>,
    platform: "twitter" | "linkedin"
  ): Lead {
    const id = String(raw.id || raw.userId || Math.random().toString(36).slice(2));
    if (platform === "twitter") {
      return {
        id,
        name: String(raw.author || raw.name || "Unknown"),
        twitterHandle: String(raw.username || ""),
        rawContext: String(raw.text || raw.description || ""),
        source: "twitter",
        tags: ["twitter-scrape"],
        createdAt: new Date().toISOString(),
      };
    }
    return {
      id,
      name: String(raw.fullName || raw.name || "Unknown"),
      title: String(raw.title || ""),
      company: String(raw.company || raw.currentJobCompanyName || ""),
      linkedinUrl: String(raw.linkedinUrl || raw.url || ""),
      rawContext: String(raw.summary || raw.headline || ""),
      source: "linkedin",
      tags: ["linkedin-scrape"],
      createdAt: new Date().toISOString(),
    };
  }

  getLeads(filter?: { score?: LeadScore; source?: Lead["source"] }): Lead[] {
    if (!filter) return [...this.leads];
    return this.leads.filter(
      (l) =>
        (!filter.score || l.score === filter.score) &&
        (!filter.source || l.source === filter.source)
    );
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
