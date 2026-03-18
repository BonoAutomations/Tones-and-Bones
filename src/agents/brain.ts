import Anthropic from '@anthropic-ai/sdk';
import { BaseExchange } from '../exchange/base';
import { RiskManager } from '../risk/manager';
import { AgentMemory } from './memory';
import { buildTools, ToolContext, AgentPosition } from './tools';
import logger from '../utils/logger';

const SYSTEM_PROMPT = `You are the MainBrain — a sophisticated multi-platform trading intelligence for a personal crypto and prediction market portfolio.

## Your Platforms
- **Coinbase** (coinbase): Spot crypto trading — BTC, ETH, SOL, etc. in USDC
- **Crypto.com** (cryptocom): Spot crypto trading — broader coin selection, USDT pairs
- **Polymarket** (polymarket): Prediction market — you trade YES/NO outcome tokens. Prices are probabilities (0.00–1.00). USDC settlement on Polygon.

## Your Responsibilities
1. **Scan opportunities** — Periodically check prices and technical signals across platforms
2. **Identify edges** — Look for strong technical setups, cross-platform divergences, or mispriced prediction markets
3. **Validate before acting** — Always call check_risk before place_order
4. **Manage positions** — Monitor open positions for stop-loss and take-profit conditions
5. **Learn continuously** — Use save_note to record insights; recall_notes to apply past learnings
6. **Stay conservative** — Preserve capital. A missed trade is better than a bad one.

## Decision Framework
For **crypto trades** (Coinbase / Crypto.com):
- Run technical analysis first (run_analysis)
- Only trade when signal strength > 0.5 AND reasoning is sound
- Check risk before every order (check_risk)
- Set stop-loss and take-profit on every position
- Prefer Coinbase for BTC/ETH, Crypto.com for altcoins

For **prediction markets** (Polymarket):
- Search for markets related to crypto, macro, or current events (search_markets)
- Look for markets where the probability seems mispriced relative to your analysis
- Only trade markets with > $5,000 liquidity
- Treat probability as the price; enter when you have a conviction edge

## Risk Rules (non-negotiable)
- Never exceed the position sizes returned by check_risk
- Stop if daily PnL exceeds -5% of portfolio
- Maximum 3 open positions at a time
- In dry-run mode, trades are simulated — behave exactly as you would with real money

## Communication Style
- Be direct and decisive
- Explain your reasoning briefly (1-2 sentences max per decision)
- Surface important observations even when not trading
- When uncertain, hold — never force a trade`;

/**
 * MainBrain: Claude Opus 4.6 agent that reasons about and coordinates
 * trading across Coinbase, Crypto.com, and Polymarket.
 *
 * Uses betaZodTool + toolRunner for automatic tool-use loop.
 * Maintains a rolling conversation history for context across ticks.
 */
export class MainBrain {
  private readonly client: Anthropic;
  private conversationHistory: Anthropic.Beta.BetaMessageParam[] = [];
  private readonly ctx: ToolContext;
  private tickCount = 0;

  constructor(
    exchanges: Map<string, BaseExchange>,
    riskManager: RiskManager,
    memory: AgentMemory,
    dryRun: boolean
  ) {
    this.client = new Anthropic();
    this.ctx = {
      exchanges,
      riskManager,
      memory,
      positions: new Map<string, AgentPosition>(),
      dailyPnL: 0,
      dryRun,
    };
  }

  get positions(): Map<string, AgentPosition> {
    return this.ctx.positions;
  }

  set dailyPnL(value: number) {
    this.ctx.dailyPnL = value;
  }

  /**
   * Run one analysis cycle — the brain analyzes markets and takes action.
   * Called on a schedule by the Orchestrator.
   */
  async tick(context?: string): Promise<string> {
    this.tickCount++;
    const tools = buildTools(this.ctx);

    const platforms = Array.from(this.ctx.exchanges.keys()).join(', ');
    const memoryContext = this.ctx.memory.toContextString();
    const openPositions = this.ctx.positions.size;
    const dryRunNote = this.ctx.dryRun ? '\n⚠️ DRY-RUN MODE — all orders are simulated.' : '';

    const tickPrompt = context ?? [
      `## Tick #${this.tickCount} — ${new Date().toISOString()}${dryRunNote}`,
      `Active platforms: ${platforms}`,
      `Open positions: ${openPositions}`,
      ``,
      memoryContext,
      ``,
      `Analyze current market conditions across your active platforms.`,
      `Check any open positions for exit conditions.`,
      `Identify and act on any strong opportunities you find.`,
      `If nothing compelling, explain briefly and hold.`,
    ].join('\n');

    this.conversationHistory.push({ role: 'user', content: tickPrompt });

    logger.info(`[Brain] Tick #${this.tickCount} — starting analysis...`);

    try {
      const finalMessage = await (this.client.beta.messages as any).toolRunner({
        model: 'claude-opus-4-6',
        max_tokens: 8000,
        thinking: { type: 'adaptive' },
        system: SYSTEM_PROMPT,
        tools,
        messages: this.conversationHistory,
      });

      // Add response to history
      this.conversationHistory.push({ role: 'assistant', content: finalMessage.content });

      // Keep history manageable (last 10 turns = 20 messages)
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      // Extract the final text response
      const textBlock = Array.isArray(finalMessage.content)
        ? finalMessage.content.find((b: { type: string }) => b.type === 'text')
        : null;
      const summary = (textBlock as { type: string; text: string } | undefined)?.text ?? 'Analysis complete.';

      logger.info(`[Brain] Tick #${this.tickCount} complete: ${summary.slice(0, 120)}...`);
      return summary;

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Brain] Tick #${this.tickCount} error: ${msg}`);
      // Remove the failed user message from history
      this.conversationHistory.pop();
      throw err;
    }
  }

  /**
   * Ask the brain a direct question (e.g., for status queries from the user).
   */
  async ask(question: string): Promise<string> {
    return this.tick(question);
  }

  /**
   * Reset conversation history (start fresh while keeping memory).
   */
  resetContext(): void {
    this.conversationHistory = [];
    logger.info('[Brain] Conversation context reset.');
  }

  getTickCount(): number {
    return this.tickCount;
  }
}
