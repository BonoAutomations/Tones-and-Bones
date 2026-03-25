import Anthropic from "@anthropic-ai/sdk";
import { AgentConfig, ActiveTask, TaskResult } from "../types";
import { logger } from "../utils/logger";
import { v4 as uuidv4 } from "uuid";

export class TaskExecutor {
  private client: Anthropic;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.llm.apiKey });
  }

  async execute(activeTask: ActiveTask): Promise<TaskResult> {
    const { task } = activeTask;
    logger.info(`Executing task ${task.id}: "${task.title}"`);

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildTaskPrompt(activeTask);

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: userPrompt },
    ];

    let output = "";
    let turnCount = 0;
    const maxTurns = this.config.maxLoopTurns;

    // Agentic loop — continue until end_turn or max turns
    while (turnCount < maxTurns) {
      turnCount++;
      logger.info(`Task ${task.id} — turn ${turnCount}/${maxTurns}`);

      const stream = this.client.messages.stream({
        model: this.config.llm.model,
        max_tokens: 8192,
        system: systemPrompt,
        thinking: { type: "enabled", budget_tokens: 8000 },
        messages,
      });

      let currentOutput = "";
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          currentOutput += event.delta.text;
        }
      }

      const finalMessage = await stream.finalMessage();

      // Append assistant response to conversation
      messages.push({ role: "assistant", content: finalMessage.content });

      output += currentOutput;

      if (finalMessage.stop_reason === "end_turn") {
        break;
      }

      // If there are tool_use blocks, handle them (placeholder for future tool integration)
      if (finalMessage.stop_reason === "tool_use") {
        const toolResults = this.handleToolUse(finalMessage.content);
        messages.push({ role: "user", content: toolResults });
      }
    }

    if (turnCount >= maxTurns) {
      logger.warn(`Task ${task.id} reached max turns (${maxTurns}), finalizing output`);
    }

    return {
      taskId: task.id,
      agentId: this.config.agentId,
      output: output.trim(),
      completedAt: new Date().toISOString(),
    };
  }

  async generateProposal(task: {
    id: string;
    title: string;
    description: string;
    requiredSpecialties: string[];
  }): Promise<string> {
    const prompt = `You are ASAM CashClaw, an expert autonomous agent. Write a compelling, professional proposal for this marketplace task.

Task Title: ${task.title}
Description: ${task.description}
Required Specialties: ${task.requiredSpecialties.join(", ")}

Write a 2-3 paragraph proposal (150-250 words) that:
1. Shows deep understanding of the task requirements
2. Highlights your relevant expertise and approach
3. Instills confidence in your ability to deliver enterprise-grade results

Be specific, confident, and professional. Reference ASAM's ecosystem strengths where relevant.`;

    const stream = this.client.messages.stream({
      model: this.config.llm.model,
      max_tokens: 1024,
      system: this.config.personality.customInstructions,
      messages: [{ role: "user", content: prompt }],
    });

    let proposal = "";
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        proposal += event.delta.text;
      }
    }

    return proposal.trim();
  }

  private buildSystemPrompt(): string {
    return `${this.config.personality.customInstructions}

## Operating Guidelines
- Deliver ${this.config.personality.responseStyle} responses in a ${this.config.personality.tone} tone
- Provide complete, production-ready deliverables — never placeholders or outlines
- Structure output clearly with headers, sections, and actionable content
- For technical tasks: include code, configurations, and implementation details
- For content tasks: include full copy, optimized for the intended channel
- For analysis tasks: include data-driven insights, frameworks, and recommendations
- Always conclude with a clear summary of deliverables provided`;
  }

  private buildTaskPrompt(activeTask: ActiveTask): string {
    const { task } = activeTask;
    return `## Task Assignment
**Title:** ${task.title}
**Client ID:** ${task.clientId}
**Specialties Required:** ${task.requiredSpecialties.join(", ")}

## Task Description
${task.description}

${task.attachments && task.attachments.length > 0
  ? `## Attachments\n${task.attachments.map((a) => `- ${a.name}: ${a.url}`).join("\n")}`
  : ""}

## Delivery Instructions
Complete this task fully and professionally. Provide all deliverables in a structured format ready for the client to use immediately. Do not ask for clarification — make informed decisions based on industry best practices and your expertise.`;
  }

  private handleToolUse(
    content: Anthropic.ContentBlock[]
  ): Anthropic.ToolResultBlockParam[] {
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of content) {
      if (block.type === "tool_use") {
        // Placeholder — extend with actual tool implementations as needed
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Tool ${block.name} is not yet implemented in this environment.`,
          is_error: true,
        });
      }
    }
    return results;
  }
}
