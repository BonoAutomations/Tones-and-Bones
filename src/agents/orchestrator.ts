import EventEmitter from 'eventemitter3';
import { BaseExchange } from '../exchange/base';
import { createExchange } from '../exchange/factory';
import { RiskManager } from '../risk/manager';
import { RiskConfig, ExchangeConfig } from '../types';
import { AgentMemory } from './memory';
import { MainBrain } from './brain';
import logger from '../utils/logger';

export interface AgentConfig {
  platforms: PlatformConfig[];
  risk: RiskConfig;
  pollIntervalMs: number;
  dryRun: boolean;
  dataDir?: string;
}

export interface PlatformConfig {
  name: string;        // 'coinbase' | 'cryptocom' | 'polymarket'
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
  'started': [];
  'stopped': [];
}

/**
 * Orchestrator: Top-level coordinator for the agentic trading system.
 *
 * Responsibilities:
 *   1. Connect to configured exchange platforms
 *   2. Initialize the MainBrain (Claude Opus 4.6)
 *   3. Run analysis ticks on a schedule
 *   4. Handle graceful shutdown
 *
 * The MainBrain makes all trading decisions via tool-use.
 * The Orchestrator just keeps things running and connected.
 */
export class Orchestrator extends EventEmitter<OrchestratorEvents> {
  private readonly config: AgentConfig;
  private readonly exchanges = new Map<string, BaseExchange>();
  private brain: MainBrain | null = null;
  private memory: AgentMemory | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private tickCount = 0;

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

    // 3. Initialize risk manager
    const riskManager = new RiskManager(this.config.risk);

    // 4. Initialize MainBrain
    this.brain = new MainBrain(
      this.exchanges,
      riskManager,
      this.memory,
      this.config.dryRun
    );

    this.running = true;
    this.emit('started');

    const mode = this.config.dryRun ? '(DRY-RUN)' : '(LIVE)';
    logger.info(`[Orchestrator] Started ${mode} with ${this.exchanges.size} platform(s): ${[...this.exchanges.keys()].join(', ')}`);

    // 5. Run first tick immediately, then on schedule
    await this.runTick();
    this.tickTimer = setInterval(() => void this.runTick(), this.config.pollIntervalMs);
  }

  async stop(graceful = true): Promise<void> {
    if (!this.running) return;

    logger.info('[Orchestrator] Stopping...');

    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    if (graceful && this.brain && this.brain.positions.size > 0) {
      logger.info(`[Orchestrator] ${this.brain.positions.size} open position(s) — asking brain to review...`);
      try {
        await this.brain.ask('We are shutting down. Review open positions and decide if any should be closed now.');
      } catch { /* best effort */ }
    }

    // Disconnect exchanges
    for (const [name, exchange] of this.exchanges) {
      try {
        await exchange.disconnect();
        logger.info(`[Orchestrator] Disconnected from ${name}`);
      } catch { /* ignore */ }
    }

    this.exchanges.clear();
    this.running = false;
    this.emit('stopped');
    logger.info('[Orchestrator] Stopped.');
  }

  /**
   * Run one brain tick — the brain analyzes and acts.
   */
  private async runTick(): Promise<void> {
    if (!this.brain || !this.running) return;

    this.tickCount++;
    this.emit('tick:start', this.tickCount);

    try {
      const summary = await this.brain.tick();
      this.emit('tick:complete', this.tickCount, summary);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(`[Orchestrator] Tick ${this.tickCount} failed: ${error.message}`);
      this.emit('tick:error', this.tickCount, error);

      // If Anthropic API key is missing, stop immediately
      if (error.message.includes('API key') || error.message.includes('401')) {
        logger.error('[Orchestrator] Anthropic API authentication failed. Check ANTHROPIC_API_KEY.');
        await this.stop(false);
      }
    }
  }

  /**
   * Connect to each configured platform.
   * Skips platforms with missing credentials — logs a warning.
   */
  private async connectPlatforms(): Promise<void> {
    for (const platform of this.config.platforms) {
      if (!platform.enabled) continue;

      const exchangeConfig: ExchangeConfig = {
        name: platform.name,
        apiKey: platform.apiKey,
        apiSecret: platform.apiSecret,
      };

      try {
        const exchange = createExchange(exchangeConfig);
        await exchange.connect();
        this.exchanges.set(platform.name, exchange);
        this.emit('platform:connected', platform.name);
        logger.info(`[Orchestrator] Connected to ${platform.name}`);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        logger.warn(`[Orchestrator] Failed to connect to ${platform.name}: ${reason}`);
        this.emit('platform:failed', platform.name, reason);
      }
    }
  }

  /** Direct access to ask the brain a question */
  async ask(question: string): Promise<string> {
    if (!this.brain) throw new Error('Orchestrator not started');
    return this.brain.ask(question);
  }

  getStatus(): {
    running: boolean;
    platforms: string[];
    tickCount: number;
    openPositions: number;
    dryRun: boolean;
  } {
    return {
      running: this.running,
      platforms: [...this.exchanges.keys()],
      tickCount: this.tickCount,
      openPositions: this.brain?.positions.size ?? 0,
      dryRun: this.config.dryRun,
    };
  }
}

// ─── Config Builder ────────────────────────────────────────────────────────

/**
 * Build AgentConfig from environment variables.
 * Detects which platforms have credentials configured.
 */
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
      apiKey: undefined,  // Polymarket uses private key only
      apiSecret: process.env.POLYMARKET_PRIVATE_KEY,
      enabled: !!(process.env.POLYMARKET_PRIVATE_KEY),
    },
  ];

  // If no real platforms configured, fall back to mock for testing
  const anyEnabled = platforms.some((p) => p.enabled);
  if (!anyEnabled) {
    logger.info('[AgentConfig] No platform credentials found — using mock exchange for testing');
    platforms.push({ name: 'mock', apiKey: undefined, apiSecret: undefined, enabled: true });
  }

  return {
    platforms,
    dryRun,
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS ?? '60000', 10),
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
