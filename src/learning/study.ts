import Anthropic from "@anthropic-ai/sdk";
import { AgentConfig, StudyNote } from "../types";
import { logger } from "../utils/logger";

const STUDY_TOPICS = [
  "Latest San Diego County real estate market trends and pricing data",
  "GoHighLevel CRM advanced automation workflows and best practices",
  "n8n workflow orchestration patterns for marketing automation",
  "AI-powered lead scoring models and implementation strategies",
  "Multi-channel marketing attribution in 2025",
  "ETH smart contract basics for on-chain payments",
  "SEO content optimization techniques for real estate",
  "Landing page conversion rate optimization frameworks",
];

export class LearningModule {
  private client: Anthropic;
  private config: AgentConfig;
  private studyNotes: StudyNote[] = [];
  private studyIndex: number = 0;

  constructor(config: AgentConfig) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.llm.apiKey });
  }

  async study(): Promise<void> {
    const topic = STUDY_TOPICS[this.studyIndex % STUDY_TOPICS.length];
    this.studyIndex++;

    logger.info(`[Study] Researching: ${topic}`);

    try {
      const stream = this.client.messages.stream({
        model: this.config.llm.model,
        max_tokens: 2048,
        system: this.config.personality.customInstructions,
        messages: [
          {
            role: "user",
            content: `Research and summarize key insights about: "${topic}"

Provide:
1. 3-5 key insights relevant to ASAM's work
2. Practical applications for client deliverables
3. Any emerging trends to watch

Keep the summary concise and actionable (max 400 words).`,
          },
        ],
      });

      let insight = "";
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          insight += event.delta.text;
        }
      }

      const note: StudyNote = {
        topic,
        insight: insight.trim(),
        source: "claude-synthesis",
        timestamp: new Date().toISOString(),
      };

      this.studyNotes.push(note);

      // Keep only the last 50 notes in memory
      if (this.studyNotes.length > 50) {
        this.studyNotes = this.studyNotes.slice(-50);
      }

      logger.info(`[Study] Completed study session on: ${topic}`);
    } catch (error) {
      logger.error(`[Study] Failed to study topic: ${topic}`, { error });
    }
  }

  getRecentInsights(count: number = 5): StudyNote[] {
    return this.studyNotes.slice(-count);
  }

  getInsightsForTopic(keyword: string): StudyNote[] {
    return this.studyNotes.filter((note) =>
      note.topic.toLowerCase().includes(keyword.toLowerCase())
    );
  }
}
