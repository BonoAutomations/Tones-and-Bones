import { TwitterApi } from "twitter-api-v2";
import Anthropic from "@anthropic-ai/sdk";
import { AgentConfig } from "../types";
import { logger } from "../utils/logger";

const CONTENT_TOPICS = [
  "How AI agents are automating sales pipelines in 2026 — real results from our work",
  "The ASAM lead scoring model: how we rank 1000 prospects in under 60 seconds",
  "Why GoHighLevel + n8n is the ultimate CRM stack for automated follow-ups",
  "From cold lead to signed contract: the 7-touchpoint AI sales sequence",
  "Real estate AI analytics: how we surface off-market deals before they're listed",
  "Autonomous agents earning on-chain: what the ASAM ecosystem looks like",
  "n8n workflow secrets: chaining 46 agents for a fully automated sales floor",
  "Why most AI sales tools fail — and what we do differently at ASAM",
  "The ETH micro-payment model for AI services is here — here's how it works",
  "CRM automation ROI: clients seeing 3x response rates with AI-driven sequences",
];

const HASHTAG_SETS = [
  "#AISales #Automation #LeadGen #SalesTech",
  "#RealEstate #AIAnalytics #PropTech #ASAM",
  "#n8n #WorkflowAutomation #NoCode #AgenticAI",
  "#GoHighLevel #CRM #MarketingAutomation #GHL",
  "#Web3 #ETH #AgentEconomy #OnChain",
  "#SaaS #StartupGrowth #B2BSales #Outbound",
];

export interface TweetResult {
  id: string;
  text: string;
  postedAt: string;
  platform: "primary" | "secondary";
}

export interface PostingSchedule {
  tweetsPerDay: number;
  nextPostAt: Date;
  engagementRepliesPerDay: number;
}

export class XAutoPoster {
  private primaryClient?: TwitterApi;
  private secondaryClient?: TwitterApi;
  private anthropic: Anthropic;
  private config: AgentConfig;
  private schedule: PostingSchedule;
  private postHistory: TweetResult[] = [];
  private postTimer?: NodeJS.Timeout;
  private engageTimer?: NodeJS.Timeout;

  constructor(config: AgentConfig) {
    this.config = config;
    this.anthropic = new Anthropic({ apiKey: config.llm.apiKey });

    this.schedule = {
      tweetsPerDay: 3,
      nextPostAt: new Date(),
      engagementRepliesPerDay: 10,
    };

    if (
      process.env.X_API_KEY &&
      process.env.X_API_SECRET &&
      process.env.X_ACCESS_TOKEN &&
      process.env.X_ACCESS_SECRET
    ) {
      this.primaryClient = new TwitterApi({
        appKey: process.env.X_API_KEY,
        appSecret: process.env.X_API_SECRET,
        accessToken: process.env.X_ACCESS_TOKEN,
        accessSecret: process.env.X_ACCESS_SECRET,
      });
    }

    if (
      process.env.X_SECONDARY_API_KEY &&
      process.env.X_SECONDARY_ACCESS_TOKEN &&
      process.env.X_SECONDARY_ACCESS_SECRET
    ) {
      this.secondaryClient = new TwitterApi({
        appKey: process.env.X_SECONDARY_API_KEY,
        appSecret: process.env.X_SECONDARY_API_SECRET || "",
        accessToken: process.env.X_SECONDARY_ACCESS_TOKEN,
        accessSecret: process.env.X_SECONDARY_ACCESS_SECRET,
      });
    }
  }

  async start(): Promise<void> {
    if (!this.primaryClient) {
      logger.warn("[XPoster] No X credentials — auto-posting disabled");
      return;
    }

    logger.info("[XPoster] Starting X auto-poster (3 tweets/day)");
    await this.postTweet();
    this.schedulePosts();
  }

  stop(): void {
    if (this.postTimer) clearInterval(this.postTimer);
    if (this.engageTimer) clearInterval(this.engageTimer);
  }

  private schedulePosts(): void {
    // Post every 8 hours (3 tweets/day)
    const intervalMs = (24 / this.schedule.tweetsPerDay) * 60 * 60 * 1000;
    this.postTimer = setInterval(async () => {
      await this.postTweet();
    }, intervalMs);
  }

  async postTweet(customTopic?: string): Promise<TweetResult | null> {
    if (!this.primaryClient) return null;

    const topic = customTopic || this.pickTopic();
    const hashtags = HASHTAG_SETS[Math.floor(Math.random() * HASHTAG_SETS.length)];

    const tweetText = await this.generateTweet(topic, hashtags);
    if (!tweetText) return null;

    try {
      const tweet = await this.primaryClient.v2.tweet(tweetText);
      const result: TweetResult = {
        id: tweet.data.id,
        text: tweetText,
        postedAt: new Date().toISOString(),
        platform: "primary",
      };

      this.postHistory.push(result);
      logger.info(`[XPoster] Tweet posted: ${tweet.data.id}`);

      // Cross-post to secondary account if available
      if (this.secondaryClient) {
        await this.crossPost(tweetText);
      }

      return result;
    } catch (error) {
      logger.error("[XPoster] Failed to post tweet", { error });
      return null;
    }
  }

  private async crossPost(text: string): Promise<void> {
    if (!this.secondaryClient) return;
    const ctaText = text + "\n\n🤖 Powered by ASAM | Gigs: [link in bio]";
    try {
      await this.secondaryClient.v2.tweet(ctaText.slice(0, 280));
      logger.info("[XPoster] Cross-posted to secondary account");
    } catch (error) {
      logger.warn("[XPoster] Cross-post failed", { error });
    }
  }

  private async generateTweet(topic: string, hashtags: string): Promise<string | null> {
    const stream = this.anthropic.messages.stream({
      model: this.config.llm.model,
      max_tokens: 256,
      system: this.config.personality.customInstructions,
      messages: [
        {
          role: "user",
          content: `Write a single high-impact tweet (max 240 chars, leaving room for hashtags) about:
"${topic}"

Rules:
- Hook in first 8 words (spark curiosity or show a concrete result)
- Conversational, not corporate
- No em-dashes, no hashtags in body (added separately)
- End with a subtle CTA or open question
- No quotation marks around the tweet

Output ONLY the tweet text, nothing else.`,
        },
      ],
    });

    let text = "";
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        text += event.delta.text;
      }
    }

    const body = text.trim().replace(/^["']|["']$/g, "");
    const full = `${body}\n\n${hashtags}`;
    return full.length <= 280 ? full : body.slice(0, 240 - hashtags.length - 2) + `\n\n${hashtags}`;
  }

  async generateEngagementReply(
    postContent: string,
    postContext: string
  ): Promise<string | null> {
    const stream = this.anthropic.messages.stream({
      model: this.config.llm.model,
      max_tokens: 128,
      system: this.config.personality.customInstructions,
      messages: [
        {
          role: "user",
          content: `Write a genuine, insightful reply (max 200 chars) to this tweet in an AI/sales/automation discussion.

Post: "${postContent}"
Context: ${postContext}

Rules: Add value, show expertise, no spam, no self-promo unless naturally fits. ONLY output the reply text.`,
        },
      ],
    });

    let reply = "";
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        reply += event.delta.text;
      }
    }

    return reply.trim().slice(0, 280);
  }

  private pickTopic(): string {
    const idx = Math.floor(Math.random() * CONTENT_TOPICS.length);
    return CONTENT_TOPICS[idx];
  }

  getPostHistory(count = 10): TweetResult[] {
    return this.postHistory.slice(-count);
  }

  getSchedule(): PostingSchedule {
    return { ...this.schedule };
  }
}
