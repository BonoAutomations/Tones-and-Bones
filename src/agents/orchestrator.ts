import EventEmitter from 'eventemitter3';
import { BaseExchange } from '../exchange/base';
import { createExchange } from '../exchange/factory';
import { RiskManager } from '../risk/manager';
import { RiskConfig, ExchangeConfig } from '../types';
import { AgentMemory } from './memory';
import { MainBrain } from './brain';
import { PositionMonitor } from './position-monitor';
import logger from '../utils/logger';

export interface AgentConfig {
  platforms: PlatformConfig[];
  risk: RiskConfig;
  pollIntervalMs: number;
  positionCheckIntervalMs: number;
  dryRun: boolean;
  dataDir?: string;
}

export interface PlatformConfig {
  name: string;
  apiKey?: string;
  apiSecret?: string;
  enabled: boolean;
}

export interface OrchestratorEvents {
  'tick:start': [tickNumber: number];
  'tick:complete': [tickNumber: number, summary: string];
  'tick:error': [tickNumber: number, error: Error];
  'platform:connected': [name: string];
  'platform:failed': [name: string, reason: string];
  'position:closed': [symbol: string, pnl: number, reason: string];
  'position:alert': [symbol: string, message: string];
  'started': [];
  'stopped': [];
  'paused': [reason: string];
}

const MAX_CONSECUTIVE_FAILURES = 5;

/**
 * Orchestrator: Top-level coordinator for the agentic trading system.
 *
 * Manages:
 *   - Platform connections (Coinbase, Crypto.com, Polymarket)
 *   - MainBrain scheduling (heavy tick: analysis + trading, every N min)
 *   - PositionMonitor scheduling (light tick: SL/TP enforcement, every 30s)
 *   - Consecutive failure circuit breaker (pauses after 5 brain errors)
 *   - Daily PnL reset timer (midnight UTC)
 *   - Graceful shutdown with session summary
 */
export class Orchestrator extends EventEmitter<OrchestratorEvents> {
  private readonly config: AgentConfig;
  private readonly exchanges = new Map<string, BaseExchange>();
  private brain: MainBrain | null = null;
  private positionMonitor: PositionMonitor | null = null;
  private memory: AgentMemory | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private dailyResetTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private paused = false;
  private tickCount = 0;
  private consecutiveFailures = 0;

  constructor(config: AgentConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.running) return;

    logger.info('[Orchestrator] Starting agentic trading system...');

    // 1. Initialize persistent memory
    this.memory = new AgentMemory(this.config.dataDir ?? './logs');

    // 2. Connect exchange platforms
    await this.connectPlatforms();

    if (this.exchanges.size === 0) {
      throw new Error('No platforms connected. Check your API keys in .env');
    }

    // 3. Risk manager
    const riskManager = new RiskManager(this.config.risk);

    // 4. MainBrain
    this.brain = new MainBrain(this.exchanges, riskManager, this.memory, this.config.dryRun);

    // Restore daily PnL from memory (trades closed today)
    this.brain.dailyPnL = this.memory.getDailyPnL();

    // 5. PositionMonitor — shares the same positions Map as the brain
    this.positionMonitor = new PositionMonitor(
      this.brain.positions,
      this.exchanges,
      riskManager,
      this.memory,
      this.config.dryRun
    );

    this.positionMonitor.on('position:closed', (position, pnl, reason) => {
      if (this.brain) {
        this.brain.dailyPnL = (this.brain.dailyPnL ?? 0) + pnl;
      }
      logger.info(`[Monitor] Position closed: ${position.symbol} PnL=$${pnl.toFixed(2)} (${reason})`);
      this.emit('position:closed', position.symbol, pnl, reason);
    });

    this.positionMonitor.on('position:alert', (position, message) => {
      logger.warn(`[Monitor] ${message}`);
      this.emit('position:alert', position.symbol, message);
    });

    this.positionMonitor.on('position:error', (id, err) => {
      logger.warn(`[Monitor] Error on position ${id}: ${err.message}`);
    });

    this.positionMonitor.start(this.config.positionCheckIntervalMs);

    // 6. Schedule midnight daily PnL reset
    this.scheduleDailyReset();

    this.running = true;
    this.emit('started');

    const mode = this.config.dryRun ? 'DRY-RUN' : 'LIVE ⚠️';
    logger.info(`[Orchestrator] Started (${mode}) | platforms: ${[...this.exchanges.keys()].join(', ')}`);

    // 7. First tick immediately, then on schedule
    await this.runTick();
    this.tickTimer = setInterval(() => void this.runTick(), this.config.pollIntervalMs);
  }

  async stop(graceful = true): Promise<void> {
    if (!this.running) return;

    logger.info('[Orchestrator] Stopping...');

    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
    if (this.dailyResetTimer) { clearTimeout(this.dailyResetTimer); this.dailyResetTimer = null; }

    this.positionMonitor?.stop();

    // Save session summary before disconnecting
    if (graceful && this.brain) {
      await this.brain.saveSessionSummary().catch(() => {});
    }

    for (const [name, exchange] of this.exchanges) {
      try { await exchange.disconnect(); }
      catch { /* ignore */ }
      logger.info(`[Orchestrator] Disconnected ${name}`);
    }

    this.exchanges.clear();
    this.running = false;
    this.emit('stopped');
    logger.info('[Orchestrator] Stopped.');
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async runTick(): Promise<void> {
    if (!this.brain || !this.running || this.paused) return;

    this.tickCount++;
    this.emit('tick:start', this.tickCount);

    try {
      const summary = await this.brain.tick();
      this.consecutiveFailures = 0;
      this.emit('tick:complete', this.tickCount, summary);

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(`[Orchestrator] Tick ${this.tickCount} failed: ${error.message}`);
      this.emit('tick:error', this.tickCount, error);
      this.consecutiveFailures++;

      // Hard stop on auth failure
      if (error.message.includes('API key') || error.message.includes('401') || error.message.includes('Authentication')) {
        logger.error('[Orchestrator] Anthropic auth failed — stopping. Check ANTHROPIC_API_KEY.');
        await this.stop(false);
        return;
      }

      // Circuit breaker: pause brain after N consecutive failures
      if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        const pauseMsg = `${MAX_CONSECUTIVE_FAILURES} consecutive tick failures — pausing brain for 10 minutes`;
        logger.error(`[Orchestrator] ${pauseMsg}`);
        this.paused = true;
        this.emit('paused', pauseMsg);

        setTimeout(() => {
          this.paused = false;
          this.consecutiveFailures = 0;
          logger.info('[Orchestrator] Brain resumed after pause.');
        }, 10 * 60 * 1000);
      }
    }
  }

  private async connectPlatforms(): Promise<void> {
    for (const platform of this.config.platforms) {
      if (!platform.enabled) continue;

      const config: ExchangeConfig = {
        name: platform.name,
        apiKey: platform.apiKey,
        apiSecret: platform.apiSecret,
      };

      try {
        const exchange = createExchange(config);
        await exchange.connect();
        this.exchanges.set(platform.name, exchange);
        this.emit('platform:connected', platform.name);
        logger.info(`[Orchestrator] ✓ ${platform.name} connected`);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        logger.warn(`[Orchestrator] ✗ ${platform.name} failed: ${reason}`);
        this.emit('platform:failed', platform.name, reason);
      }
    }
  }

  /**
   * Schedule a midnight UTC daily PnL reset.
   * Recalculates from memory so restarts don't lose the daily tally.
   */
  private scheduleDailyReset(): void {
    const now = new Date();
    const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    this.dailyResetTimer = setTimeout(() => {
      if (this.brain && this.memory) {
        this.brain.dailyPnL = 0;
        logger.info('[Orchestrator] Daily PnL reset at midnight UTC.');
      }
      // Reschedule for next midnight
      this.scheduleDailyReset();
    }, msUntilMidnight);

    logger.info(`[Orchestrator] Daily reset scheduled in ${Math.round(msUntilMidnight / 3_600_000)}h`);
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  async ask(question: string): Promise<string> {
    if (!this.brain) throw new Error('Orchestrator not started');
    return this.brain.ask(question);
  }

  getStatus(): {
    running: boolean; paused: boolean; platforms: string[];
    tickCount: number; consecutiveFailures: number;
    openPositions: number; dryRun: boolean; dailyPnL: number;
  } {
    return {
      running: this.running,
      paused: this.paused,
      platforms: [...this.exchanges.keys()],
      tickCount: this.tickCount,
      consecutiveFailures: this.consecutiveFailures,
      openPositions: this.brain?.positions.size ?? 0,
      dryRun: this.config.dryRun,
      dailyPnL: this.brain?.dailyPnL ?? 0,
    };
  }
}

// ─── Config Builder ────────────────────────────────────────────────────────

export function loadAgentConfig(): AgentConfig {
  const dryRun = (process.env.DRY_RUN ?? 'true').toLowerCase() === 'true';

  const platforms: PlatformConfig[] = [
    {
      name: 'coinbase',
      apiKey: process.env.COINBASE_API_KEY ?? process.env.EXCHANGE_API_KEY,
      apiSecret: process.env.COINBASE_API_SECRET ?? process.env.EXCHANGE_API_SECRET,
      enabled: !!(process.env.COINBASE_API_KEY ?? process.env.EXCHANGE_API_KEY),
    },
    {
      name: 'cryptocom',
      apiKey: process.env.CRYPTOCOM_API_KEY,
      apiSecret: process.env.CRYPTOCOM_API_SECRET,
      enabled: !!(process.env.CRYPTOCOM_API_KEY),
    },
    {
      name: 'polymarket',
      apiKey: undefined,
      apiSecret: process.env.POLYMARKET_PRIVATE_KEY,
      enabled: !!(process.env.POLYMARKET_PRIVATE_KEY),
    },
  ];

  const anyEnabled = platforms.some((p) => p.enabled);
  if (!anyEnabled) {
    logger.info('[AgentConfig] No platform credentials found — using mock exchange for testing');
    platforms.push({ name: 'mock', enabled: true });
  }

  return {
    platforms,
    dryRun,
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS ?? '300000', 10),  // 5 min default
    positionCheckIntervalMs: parseInt(process.env.POSITION_CHECK_INTERVAL_MS ?? '30000', 10), // 30s default
    dataDir: './logs',
    risk: {
      maxPositionSizePercent: parseFloat(process.env.MAX_POSITION_SIZE ?? '0.1'),
      maxDailyLossPercent: parseFloat(process.env.MAX_DAILY_LOSS ?? '0.05'),
      stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENT ?? '0.02'),
      takeProfitPercent: parseFloat(process.env.TAKE_PROFIT_PERCENT ?? '0.04'),
      maxOpenPositions: parseInt(process.env.MAX_OPEN_POSITIONS ?? '3', 10),
    },
  };
}
