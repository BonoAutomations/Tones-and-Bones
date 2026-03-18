import Anthropic from '@anthropic-ai/sdk';
import { BaseExchange } from '../exchange/base';
import { RiskManager } from '../risk/manager';
import { AgentMemory } from './memory';
import { buildTools, ToolContext, AgentPosition } from './tools';
import logger from '../utils/logger';

const BRAIN_TIMEOUT_MS = 90_000; // 90s — generous but bounded

const SYSTEM_PROMPT = `You are the MainBrain — a sophisticated multi-platform trading intelligence for a personal crypto and prediction market portfolio.

## Your Platforms
- **Coinbase** (coinbase): Spot crypto trading — BTC, ETH, SOL in USDC. Market and limit orders.
- **Crypto.com** (cryptocom): Spot crypto trading — broader altcoin selection. USDT pairs.
- **Polymarket** (polymarket): Prediction market — YES/NO outcome tokens, prices are probabilities (0.00–1.00). USDC on Polygon.

## Start Every Tick With
1. \`get_market_context\` — macro sentiment (Fear & Greed, BTC price) to calibrate risk appetite
2. \`list_positions\` — check open positions for exit conditions or SL/TP adjustments
3. Then scan for new opportunities if conditions are right

## Trading Framework

**Crypto (Coinbase / Crypto.com):**
- Always \`run_analysis\` before entering — only trade when strength > 0.5 AND reasoning is sound
- In extreme fear (F&G ≤ 25): can consider larger buys, tighter TP targets
- In extreme greed (F&G ≥ 75): reduce position sizes, widen stop-losses
- Prefer Coinbase for BTC/ETH; Crypto.com for altcoins (wider selection)
- Always \`check_risk\` before \`place_order\` — use its suggested amounts

**Prediction Markets (Polymarket):**
- Use \`search_markets\` to find opportunities related to crypto, macro, or current events
- Only trade markets with > $5,000 liquidity
- Probability < 0.30 + contrarian thesis = potential value buy
- Probability > 0.75 + overbought thesis = potential sell

## Risk Rules (non-negotiable)
- Never exceed position sizes from \`check_risk\`
- Maximum 3 concurrent open positions across all platforms
- Every position needs a stop-loss and take-profit level
- Daily loss limit: if PnL goes below -5% of portfolio, hold and report
- DRY_RUN mode: behave identically to live — do not relax these rules

## Efficiency
- Minimize redundant API calls — don't fetch the same ticker twice in one tick
- If you already fetched market context, don't fetch it again for the same tick
- If there's nothing compelling, say so clearly and hold — never force a trade

## Memory
- Use \`save_note\` to record patterns, market observations, and decision rationale
- Use \`recall_notes\` when analyzing a symbol you've traded before`;

/**
 * MainBrain: Claude Opus 4.6 agent with adaptive thinking.
 *
 * Coordinates trading decisions across Coinbase, Crypto.com, and Polymarket.
 * Each tick runs the full tool-use loop until Claude produces a final response.
 * A 90s timeout prevents runaway hangs from slow API responses.
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

  get dailyPnL(): number {
    return this.ctx.dailyPnL;
  }

  /**
   * Run one analysis cycle. Called on a schedule by the Orchestrator.
   * The brain fetches market context, checks positions, and acts on opportunities.
   */
  async tick(context?: string): Promise<string> {
    this.tickCount++;
    const tools = buildTools(this.ctx);

    const platforms = Array.from(this.ctx.exchanges.keys()).join(', ');
    const memoryContext = this.ctx.memory.toContextString();
    const openPositions = this.ctx.positions.size;
    const lastSummary = this.ctx.memory.getLastSessionSummary();
    const dryRunNote = this.ctx.dryRun ? '\n⚠️  DRY-RUN MODE — all orders simulated.' : '';

    const tickPrompt = context ?? [
      `## Tick #${this.tickCount} — ${new Date().toISOString()}${dryRunNote}`,
      `Active platforms: ${platforms} | Open positions: ${openPositions}`,
      ``,
      memoryContext,
      lastSummary ? `LAST SESSION: ${lastSummary}` : '',
      ``,
      `Begin with get_market_context to calibrate your risk appetite.`,
      `Then check open positions and scan for opportunities.`,
      `If nothing compelling, say so clearly.`,
    ].filter(Boolean).join('\n');

    this.conversationHistory.push({ role: 'user', content: tickPrompt });
    logger.info(`[Brain] Tick #${this.tickCount} — analyzing...`);

    try {
      const summary = await this.runWithTimeout(async () => {
        const finalMessage = await (this.client.beta.messages as unknown as {
          toolRunner: (params: unknown) => Promise<{ content: Array<{ type: string; text?: string }> }>;
        }).toolRunner({
          model: 'claude-opus-4-6',
          max_tokens: 8192,
          thinking: { type: 'adaptive' },
          system: SYSTEM_PROMPT,
          tools,
          messages: this.conversationHistory,
        });

        // Update history with assistant response
        this.conversationHistory.push({
          role: 'assistant',
          content: finalMessage.content as Anthropic.Beta.BetaContentBlock[],
        });

        // Rolling window: keep last 16 messages (8 turns) — enough for context without token bloat
        if (this.conversationHistory.length > 16) {
          this.conversationHistory = this.conversationHistory.slice(-16);
        }

        const textBlock = finalMessage.content.find((b) => b.type === 'text');
        return textBlock?.text ?? 'Analysis complete.';
      });

      logger.info(`[Brain] Tick #${this.tickCount}:\n${summary}`);
      return summary;

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Brain] Tick #${this.tickCount} error: ${msg}`);
      this.conversationHistory.pop(); // Remove failed user message
      throw err;
    }
  }

  /**
   * Ask a direct question — used by Orchestrator for shutdown review etc.
   */
  async ask(question: string): Promise<string> {
    return this.tick(question);
  }

  /**
   * Save a summary of this session to memory before shutdown.
   * The brain summarizes what it did, what it learned, and any open risks.
   */
  async saveSessionSummary(): Promise<void> {
    if (this.tickCount === 0) return;
    try {
      const summary = await this.ask(
        'Summarize this trading session in 2-3 sentences: key actions taken, ' +
        'market observations, and any open positions or risks to monitor next session.'
      );
      this.ctx.memory.saveSessionSummary(summary);
      logger.info('[Brain] Session summary saved to memory.');
    } catch {
      /* best effort */
    }
  }

  resetContext(): void {
    this.conversationHistory = [];
    logger.info('[Brain] Conversation context reset.');
  }

  getTickCount(): number {
    return this.tickCount;
  }

  /**
   * Wrap an async operation with a timeout.
   * Throws if the operation exceeds BRAIN_TIMEOUT_MS.
   */
  private runWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Brain tick timed out after ${BRAIN_TIMEOUT_MS / 1000}s`));
      }, BRAIN_TIMEOUT_MS);

      fn()
        .then((result) => { clearTimeout(timer); resolve(result); })
        .catch((err) => { clearTimeout(timer); reject(err); });
    });
  }
}
