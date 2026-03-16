import Anthropic from "@anthropic-ai/sdk";
import { AgentConfig } from "../types";
import { logger } from "../utils/logger";

export interface ContentBrief {
  id: string;
  date: string;
  theme: string;
  tweetThreads: string[];
  linkedInPost: string;
  blogOutline: string;
  emailSubjectLines: string[];
  ctaLinks: string[];
  generatedAt: string;
}

const WEEKLY_THEMES = [
  "AI-Powered Lead Generation — from scrape to signed deal",
  "CRM Automation ROI — real numbers from real workflows",
  "Real Estate Analytics — surface off-market deals with AI",
  "The Autonomous Agent Economy — earning on-chain 24/7",
  "n8n + GoHighLevel — the automated sales machine stack",
  "Competitor Intelligence — knowing their next move before they make it",
  "Content at Scale — 30 assets from 1 brief using AI",
];

export class ContentBriefGenerator {
  private anthropic: Anthropic;
  private config: AgentConfig;
  private briefs: ContentBrief[] = [];

  constructor(config: AgentConfig) {
    this.config = config;
    this.anthropic = new Anthropic({ apiKey: config.llm.apiKey });
  }

  async generateDailyBrief(): Promise<ContentBrief> {
    const theme = WEEKLY_THEMES[new Date().getDay() % WEEKLY_THEMES.length];
    logger.info(`[Content] Generating daily brief: "${theme}"`);

    const [tweetThreads, linkedInPost, blogOutline, emailSubjects] =
      await Promise.all([
        this.generateTweetThread(theme),
        this.generateLinkedInPost(theme),
        this.generateBlogOutline(theme),
        this.generateEmailSubjects(theme),
      ]);

    const brief: ContentBrief = {
      id: `brief-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      theme,
      tweetThreads,
      linkedInPost,
      blogOutline,
      emailSubjectLines: emailSubjects,
      ctaLinks: [
        process.env.WHOP_STORE_URL || "https://whop.com/automated-sales-solutions",
        process.env.MOLTLAUNCH_PROFILE_URL || "https://moltlaunch.io/agents/cashclaw",
      ],
      generatedAt: new Date().toISOString(),
    };

    this.briefs.push(brief);
    logger.info(`[Content] Daily brief generated (ID: ${brief.id})`);
    return brief;
  }

  private async generateTweetThread(theme: string): Promise<string[]> {
    const stream = this.anthropic.messages.stream({
      model: this.config.llm.model,
      max_tokens: 1024,
      system: this.config.personality.customInstructions,
      messages: [
        {
          role: "user",
          content: `Write a 5-tweet thread about: "${theme}"

Format as a JSON array of 5 strings, each under 265 chars. Tweet 1 is the hook. Tweets 2-4 are insights/value. Tweet 5 is a CTA.
No hashtags inside tweets. Use numbers like "1/" at the start of each.
Output ONLY the JSON array.`,
        },
      ],
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

    try {
      const parsed = JSON.parse(raw.trim()) as string[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [raw.trim()];
    }
  }

  private async generateLinkedInPost(theme: string): Promise<string> {
    const stream = this.anthropic.messages.stream({
      model: this.config.llm.model,
      max_tokens: 768,
      system: this.config.personality.customInstructions,
      messages: [
        {
          role: "user",
          content: `Write a LinkedIn post (300-500 words) about: "${theme}"

Structure: Hook line → 3-4 insight paragraphs → CTA.
Tone: Professional but conversational. Include 1-2 concrete numbers or results.
Output ONLY the post text.`,
        },
      ],
    });

    let post = "";
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        post += event.delta.text;
      }
    }

    return post.trim();
  }

  private async generateBlogOutline(theme: string): Promise<string> {
    const stream = this.anthropic.messages.stream({
      model: this.config.llm.model,
      max_tokens: 512,
      system: this.config.personality.customInstructions,
      messages: [
        {
          role: "user",
          content: `Create a blog post outline for: "${theme}"

Include: Title (SEO-optimized), Meta description, 5-6 H2 sections with 2-3 bullet points each, and a Conclusion CTA.
Output ONLY the outline in markdown.`,
        },
      ],
    });

    let outline = "";
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        outline += event.delta.text;
      }
    }

    return outline.trim();
  }

  private async generateEmailSubjects(theme: string): Promise<string[]> {
    const stream = this.anthropic.messages.stream({
      model: this.config.llm.model,
      max_tokens: 256,
      system: this.config.personality.customInstructions,
      messages: [
        {
          role: "user",
          content: `Write 5 high-open-rate email subject lines for: "${theme}"

Mix curiosity, urgency, and benefit-driven angles. Max 60 chars each.
Output ONLY a JSON array of 5 strings.`,
        },
      ],
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

    try {
      const parsed = JSON.parse(raw.trim()) as string[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  getLatestBrief(): ContentBrief | undefined {
    return this.briefs[this.briefs.length - 1];
  }

  getAllBriefs(): ContentBrief[] {
    return [...this.briefs];
  }
}
