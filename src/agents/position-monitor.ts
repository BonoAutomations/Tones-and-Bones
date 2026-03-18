import EventEmitter from 'eventemitter3';
import { BaseExchange } from '../exchange/base';
import { RiskManager } from '../risk/manager';
import { AgentMemory } from './memory';
import { AgentPosition } from './tools';
import logger from '../utils/logger';

export interface PositionMonitorEvents {
  'position:closed': [position: AgentPosition, pnl: number, reason: 'stop_loss' | 'take_profit' | 'manual'];
  'position:alert': [position: AgentPosition, message: string];
  'position:error': [positionId: string, error: Error];
  'health:update': [healthy: number, unhealthy: number];
}

/**
 * PositionMonitor: Dedicated SL/TP enforcement service.
 *
 * Runs independently from the MainBrain on a short interval (default 30s).
 * Enforces stop-loss and take-profit levels automatically — no LLM call needed.
 *
 * Separation of concerns:
 *   - MainBrain  → decides what to trade (runs every ~5-15 min)
 *   - PositionMonitor → enforces position rules (runs every 30s)
 *
 * The two share the same `positions` Map via reference.
 */
export class PositionMonitor extends EventEmitter<PositionMonitorEvents> {
  private readonly positions: Map<string, AgentPosition>;
  private readonly exchanges: Map<string, BaseExchange>;
  private readonly riskManager: RiskManager;
  private readonly memory: AgentMemory;
  private readonly dryRun: boolean;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  // Track recent check results for health reporting
  private consecutiveErrors = 0;

  constructor(
    positions: Map<string, AgentPosition>,
    exchanges: Map<string, BaseExchange>,
    riskManager: RiskManager,
    memory: AgentMemory,
    dryRun: boolean
  ) {
    super();
    this.positions = positions;
    this.exchanges = exchanges;
    this.riskManager = riskManager;
    this.memory = memory;
    this.dryRun = dryRun;
  }

  start(intervalMs = 30_000): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => void this.check(), intervalMs);
    logger.info(`[PositionMonitor] Started — checking every ${intervalMs / 1000}s`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    logger.info('[PositionMonitor] Stopped');
  }

  /**
   * Check all open positions against live prices.
   * Auto-closes when SL or TP is triggered.
   */
  async check(): Promise<void> {
    if (this.positions.size === 0) return;

    let healthy = 0;
    let unhealthy = 0;

    // Check all positions in parallel, independent of each other
    const checks = Array.from(this.positions.entries()).map(async ([id, position]) => {
      const exchange = this.exchanges.get(position.platform);
      if (!exchange) return;

      try {
        const ticker = await exchange.getTicker(position.symbol);
        const currentPrice = ticker.last;

        // Use RiskManager's SL/TP logic
        const positionForCheck = {
          id: position.id,
          symbol: position.symbol,
          side: position.side,
          entryPrice: position.entryPrice,
          currentPrice,
          amount: position.amount,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
          stopLoss: position.stopLoss,
          takeProfit: position.takeProfit,
          openedAt: position.openedAt,
          orderId: position.orderId,
        };

        const { close, reason } = this.riskManager.shouldClosePosition(positionForCheck, currentPrice);

        if (close && reason) {
          await this.closePosition(id, position, currentPrice, reason);
        } else {
          // Alert if position is near SL/TP (within 10% of trigger distance)
          this.checkProximityAlert(id, position, currentPrice);
          healthy++;
        }
      } catch (err) {
        unhealthy++;
        const error = err instanceof Error ? err : new Error(String(err));
        logger.warn(`[PositionMonitor] Error checking position ${id}: ${error.message}`);
        this.emit('position:error', id, error);
      }
    });

    await Promise.allSettled(checks);
    this.emit('health:update', healthy, unhealthy);

    if (unhealthy > 0) {
      this.consecutiveErrors++;
    } else {
      this.consecutiveErrors = 0;
    }
  }

  /**
   * Close a position when SL or TP is triggered.
   */
  private async closePosition(
    positionId: string,
    position: AgentPosition,
    currentPrice: number,
    reason: 'stop_loss' | 'take_profit'
  ): Promise<void> {
    const closeSide = position.side === 'buy' ? 'sell' : 'buy';
    const pnl = position.side === 'buy'
      ? (currentPrice - position.entryPrice) * position.amount
      : (position.entryPrice - currentPrice) * position.amount;

    logger.info(
      `[PositionMonitor] ${reason.toUpperCase()} triggered on ${position.symbol} (${position.platform}): ` +
      `price=${currentPrice.toFixed(4)}, PnL=$${pnl.toFixed(2)}`
    );

    if (this.dryRun) {
      this.positions.delete(positionId);
      this.memory.updateTradeOutcome(positionId, pnl, pnl >= 0 ? 'win' : 'loss');
      this.memory.addSessionInsight(
        `[DryRun] ${reason} triggered on ${position.symbol}: $${pnl.toFixed(2)} PnL`
      );
      this.emit('position:closed', position, pnl, reason);
      return;
    }

    const exchange = this.exchanges.get(position.platform);
    if (!exchange) {
      logger.error(`[PositionMonitor] Cannot close ${positionId}: exchange '${position.platform}' not connected`);
      return;
    }

    try {
      await exchange.placeOrder({
        symbol: position.symbol,
        side: closeSide,
        type: 'market',
        amount: position.amount,
        clientOrderId: `monitor-${reason}-${Date.now()}`,
      });

      this.positions.delete(positionId);
      this.memory.updateTradeOutcome(positionId, pnl, pnl >= 0 ? 'win' : 'loss');
      this.memory.addSessionInsight(
        `${reason} triggered on ${position.symbol} (${position.platform}): $${pnl.toFixed(2)} PnL`
      );
      this.emit('position:closed', position, pnl, reason);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(`[PositionMonitor] Failed to close position ${positionId}: ${error.message}`);
      this.emit('position:error', positionId, error);
    }
  }

  /**
   * Warn when a position is within 20% of its stop-loss or take-profit trigger.
   */
  private checkProximityAlert(
    _positionId: string,
    position: AgentPosition,
    currentPrice: number
  ): void {
    if (position.stopLoss) {
      const distToSL = Math.abs(currentPrice - position.stopLoss) / currentPrice;
      if (distToSL < 0.005) {  // Within 0.5% of SL
        const msg = `⚠️ ${position.symbol} is ${(distToSL * 100).toFixed(2)}% from stop-loss (${position.stopLoss.toFixed(4)})`;
        logger.warn(`[PositionMonitor] ${msg}`);
        this.emit('position:alert', position, msg);
      }
    }

    if (position.takeProfit) {
      const distToTP = Math.abs(currentPrice - position.takeProfit) / currentPrice;
      if (distToTP < 0.005) {  // Within 0.5% of TP
        const msg = `🎯 ${position.symbol} is ${(distToTP * 100).toFixed(2)}% from take-profit (${position.takeProfit.toFixed(4)})`;
        logger.info(`[PositionMonitor] ${msg}`);
        this.emit('position:alert', position, msg);
      }
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}
