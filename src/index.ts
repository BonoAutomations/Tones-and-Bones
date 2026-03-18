/**
 * Tones-and-Bones — Agentic Trading System
 *
 * Architecture:
 *   Orchestrator → MainBrain (Claude Opus 4.6) → Platform Tools
 *                                                  ├── Coinbase
 *                                                  ├── Crypto.com
 *                                                  └── Polymarket
 *
 * The MainBrain reasons about markets, calls tools, and manages
 * positions across all platforms autonomously.
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY       — Your Anthropic API key
 *   COINBASE_API_KEY/SECRET — Coinbase Advanced Trade
 *   CRYPTOCOM_API_KEY/SECRET — Crypto.com Exchange
 *   POLYMARKET_PRIVATE_KEY  — Polygon wallet private key
 *   DRY_RUN=true            — Simulate trades (safe default)
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { Orchestrator, loadAgentConfig } from './agents/orchestrator';
import logger from './utils/logger';

async function main(): Promise<void> {
  logger.info('='.repeat(62));
  logger.info('  Tones-and-Bones — Agentic Trading System');
  logger.info('  Brain: Claude Opus 4.6 | Platforms: Coinbase, Crypto.com, Polymarket');
  logger.info('='.repeat(62));

  if (!process.env.ANTHROPIC_API_KEY) {
    logger.error('[Main] ANTHROPIC_API_KEY is required. Set it in your .env file.');
    process.exit(1);
  }

  const config = loadAgentConfig();
  const orchestrator = new Orchestrator(config);

  // ─── Event Listeners ───────────────────────────────────────────────────────

  orchestrator.on('started', () => {
    const status = orchestrator.getStatus();
    const mode = status.dryRun ? '(DRY-RUN)' : '(LIVE ⚠️)';
    logger.info(`[Main] Agentic system started ${mode}`);
    logger.info(`[Main] Platforms: ${status.platforms.join(', ')}`);
    logger.info(`[Main] Poll interval: ${config.pollIntervalMs / 1000}s`);
  });

  orchestrator.on('platform:connected', (name) => {
    logger.info(`[Main] ✓ ${name} connected`);
  });

  orchestrator.on('platform:failed', (name, reason) => {
    logger.warn(`[Main] ✗ ${name} failed: ${reason}`);
  });

  orchestrator.on('tick:start', (n) => {
    logger.info(`[Main] ─── Tick #${n} ────────────────────────────────`);
  });

  orchestrator.on('tick:complete', (n, summary) => {
    logger.info(`[Main] Tick #${n} complete:\n${summary.slice(0, 400)}${summary.length > 400 ? '...' : ''}`);
  });

  orchestrator.on('tick:error', (n, err) => {
    logger.error(`[Main] Tick #${n} error: ${err.message}`);
  });

  orchestrator.on('stopped', () => {
    logger.info('[Main] Agentic system stopped.');
    const status = orchestrator.getStatus();
    logger.info(`[Main] Total ticks: ${status.tickCount} | Open positions: ${status.openPositions}`);
  });

  // ─── Graceful Shutdown ─────────────────────────────────────────────────────

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`[Main] Received ${signal} — shutting down gracefully...`);
    await orchestrator.stop(true);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('uncaughtException', (error) => {
    logger.error(`[Main] Uncaught exception: ${error.message}`, { stack: error.stack });
    void shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error(`[Main] Unhandled rejection: ${reason}`);
  });

  // ─── Start ─────────────────────────────────────────────────────────────────

  await orchestrator.start();
}

main().catch((err) => {
  logger.error(`[Main] Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
