/**
 * Tones-and-Bones Trading Bot
 * Entry point
 */
import { loadConfig } from './config';
import { createExchange } from './exchange/factory';
import { createStrategy } from './strategies/factory';
import { TradingBot } from './bot';
import logger from './utils/logger';

async function main(): Promise<void> {
  logger.info('='.repeat(60));
  logger.info('  Tones-and-Bones Automated Trading Bot');
  logger.info('='.repeat(60));

  const config = loadConfig();
  const exchange = createExchange(config.exchange);
  const strategy = createStrategy(config.strategy);

  const bot = new TradingBot(config, exchange, strategy);

  // ─── Event Listeners ─────────────────────────────────────────────────────

  bot.on('bot:started', () => {
    logger.info('[Main] Bot started successfully');
  });

  bot.on('bot:stopped', () => {
    logger.info('[Main] Bot stopped');
  });

  bot.on('bot:error', (error: Error) => {
    logger.error(`[Main] Bot error: ${error.message}`);
  });

  bot.on('tick', (ticker: { symbol: string; last: number; volume: number }) => {
    logger.debug(`[Main] Tick: ${ticker.symbol} @ $${ticker.last.toFixed(2)} | Vol: ${ticker.volume.toFixed(2)}`);
  });

  bot.on('signal', (signal: { type: string; strength: number; reason: string }) => {
    if (signal.type !== 'hold') {
      logger.info(`[Main] Signal: ${signal.type.toUpperCase()} (strength: ${signal.strength.toFixed(2)}) - ${signal.reason}`);
    }
  });

  bot.on('order:placed', (order: { id: string; side: string; amount: number; symbol: string }) => {
    logger.info(`[Main] Order placed: ${order.id} | ${order.side.toUpperCase()} ${order.amount} ${order.symbol}`);
  });

  bot.on('order:filled', (order: { id: string; avgFillPrice: number }) => {
    logger.info(`[Main] Order filled: ${order.id} @ $${order.avgFillPrice.toFixed(2)}`);
  });

  bot.on('position:opened', (pos: { id: string; side: string; symbol: string; entryPrice: number }) => {
    logger.info(`[Main] Position opened: ${pos.id} | ${pos.side.toUpperCase()} ${pos.symbol} @ $${pos.entryPrice.toFixed(2)}`);
  });

  bot.on('position:closed', (pos: { id: string }, trade: { pnl: number; pnlPercent: number }) => {
    const sign = trade.pnl >= 0 ? '+' : '';
    logger.info(`[Main] Position closed: ${pos.id} | PnL: ${sign}$${trade.pnl.toFixed(2)} (${sign}${(trade.pnlPercent * 100).toFixed(2)}%)`);
  });

  bot.on('risk:rejected', (reason: string) => {
    logger.warn(`[Main] Trade rejected: ${reason}`);
  });

  bot.on('circuit:opened', (reason: string) => {
    logger.error(`[Main] Circuit breaker opened: ${reason}`);
  });

  bot.on('daily:loss:limit', (dailyPnL: number) => {
    logger.error(`[Main] Daily loss limit hit! Daily PnL: $${dailyPnL.toFixed(2)}. Bot paused until midnight.`);
  });

  // ─── Graceful Shutdown ─────────────────────────────────────────────────────

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`[Main] Received ${signal}. Shutting down gracefully...`);

    // Print final stats
    const stats = bot.getStats();
    logger.info('[Main] Final Statistics:');
    logger.info(`  Total trades: ${stats.totalTrades}`);
    logger.info(`  Win rate: ${(stats.winRate * 100).toFixed(1)}%`);
    logger.info(`  Daily PnL: $${stats.dailyPnL.toFixed(2)} (${(stats.dailyPnLPercent * 100).toFixed(2)}%)`);
    logger.info(`  Total PnL: $${stats.totalPnL.toFixed(2)}`);

    await bot.stop(false); // Don't force-close positions on graceful shutdown
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (error) => {
    logger.error(`[Main] Uncaught exception: ${error.message}`, { stack: error.stack });
    shutdown('uncaughtException').catch(console.error);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error(`[Main] Unhandled rejection: ${reason}`);
  });

  // ─── Start Bot ─────────────────────────────────────────────────────────────

  await bot.start();
}

main().catch((err) => {
  logger.error(`[Main] Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
