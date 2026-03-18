import EventEmitter from 'eventemitter3';
import {
  BotConfig, BotState, BotStatus, Position, Ticker,
  Signal, Order, TradeRecord, OrderRequest,
} from './types';
import { BaseExchange } from './exchange/base';
import { BaseStrategy } from './strategies/base';
import { RiskManager } from './risk/manager';
import { CircuitBreaker } from './utils/circuit-breaker';
import logger from './utils/logger';

/**
 * Main Trading Bot
 *
 * Orchestrates the trading loop:
 * 1. Fetch market data (ticker + candles)
 * 2. Run strategy to get signal
 * 3. Risk check the signal
 * 4. Place order if approved
 * 5. Track positions and enforce stop loss / take profit
 * 6. Emit events for observability
 *
 * Resilience features:
 * - Circuit breaker on exchange calls
 * - Retry on transient errors
 * - Daily loss limit (hard stop)
 * - Graceful shutdown with position cleanup option
 */
export class TradingBot extends EventEmitter {
  private readonly config: BotConfig;
  private readonly exchange: BaseExchange;
  private readonly strategy: BaseStrategy;
  private readonly riskManager: RiskManager;
  private readonly circuitBreaker: CircuitBreaker;

  private state: BotState = {
    status: 'idle',
    positions: new Map(),
    portfolio: null,
    tradeHistory: [],
    dailyPnL: 0,
    dailyPnLPercent: 0,
    startedAt: null,
    lastTickAt: null,
    errorCount: 0,
  };

  private ticker: NodeJS.Timeout | null = null;
  private dayResetTimer: NodeJS.Timeout | null = null;
  private initialPortfolioValue = 0;

  constructor(
    config: BotConfig,
    exchange: BaseExchange,
    strategy: BaseStrategy
  ) {
    super();
    this.config = config;
    this.exchange = exchange;
    this.strategy = strategy;
    this.riskManager = new RiskManager(config.risk);
    this.circuitBreaker = new CircuitBreaker('exchange', config.circuitBreaker);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.state.status === 'running') {
      logger.warn('[Bot] Already running');
      return;
    }

    logger.info('[Bot] Starting trading bot...');
    logger.info(`[Bot] Symbol: ${this.config.symbol}`);
    logger.info(`[Bot] Strategy: ${this.strategy.name}`);
    logger.info(`[Bot] Dry run: ${this.config.dryRun}`);

    try {
      await this.exchange.connect();
      await this.refreshPortfolio();

      this.initialPortfolioValue = this.state.portfolio?.totalValueUSD ?? 0;
      this.state.startedAt = Date.now();
      this.setStatus('running');
      this.scheduleDayReset();

      // Start the trading loop
      await this.tick(); // Run immediately
      this.ticker = setInterval(() => this.tick().catch(this.handleTickError.bind(this)), this.config.pollIntervalMs);

      this.emit('bot:started');
      logger.info(`[Bot] Started. Portfolio value: $${this.initialPortfolioValue.toFixed(2)}`);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(`[Bot] Failed to start: ${error.message}`);
      this.setStatus('error');
      this.emit('bot:error', error);
      throw error;
    }
  }

  async stop(closePendingPositions = false): Promise<void> {
    logger.info('[Bot] Stopping...');
    this.clearTimers();

    if (closePendingPositions && this.state.positions.size > 0) {
      logger.info(`[Bot] Closing ${this.state.positions.size} open positions...`);
      await this.closeAllPositions('Bot stopped');
    }

    try {
      await this.exchange.disconnect();
    } catch (err) {
      logger.warn(`[Bot] Error during disconnect: ${err instanceof Error ? err.message : String(err)}`);
    }

    this.setStatus('stopped');
    this.emit('bot:stopped');
    logger.info('[Bot] Stopped.');
  }

  pause(): void {
    if (this.state.status !== 'running') return;
    this.clearTimers();
    this.setStatus('paused');
    logger.info('[Bot] Paused.');
  }

  async resume(): Promise<void> {
    if (this.state.status !== 'paused') return;
    this.setStatus('running');
    await this.tick();
    this.ticker = setInterval(() => this.tick().catch(this.handleTickError.bind(this)), this.config.pollIntervalMs);
    logger.info('[Bot] Resumed.');
  }

  getState(): Readonly<BotState> {
    return {
      ...this.state,
      positions: new Map(this.state.positions),
      tradeHistory: [...this.state.tradeHistory],
    };
  }

  getStats(): {
    status: BotStatus;
    uptime: number;
    totalTrades: number;
    openPositions: number;
    dailyPnL: number;
    dailyPnLPercent: number;
    totalPnL: number;
    winRate: number;
    circuitBreaker: ReturnType<CircuitBreaker['getStats']>;
  } {
    const trades = this.state.tradeHistory;
    const wins = trades.filter((t) => t.pnl > 0).length;
    const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
    const winRate = trades.length > 0 ? wins / trades.length : 0;

    return {
      status: this.state.status,
      uptime: this.state.startedAt ? Date.now() - this.state.startedAt : 0,
      totalTrades: trades.length,
      openPositions: this.state.positions.size,
      dailyPnL: this.state.dailyPnL,
      dailyPnLPercent: this.state.dailyPnLPercent,
      totalPnL,
      winRate,
      circuitBreaker: this.circuitBreaker.getStats(),
    };
  }

  // ─── Trading Loop ──────────────────────────────────────────────────────────

  private async tick(): Promise<void> {
    if (this.state.status !== 'running') return;

    try {
      // Fetch market data through circuit breaker
      const ticker = await this.circuitBreaker.execute(() =>
        this.exchange.getTicker(this.config.symbol)
      );

      this.state.lastTickAt = Date.now();
      this.emit('tick', ticker);

      // Refresh portfolio occasionally
      await this.refreshPortfolio();

      // Check existing positions for stop loss / take profit
      await this.checkPositions(ticker);

      // Get strategy signal
      const signal = await this.getSignal(ticker);
      this.emit('signal', signal);

      // Execute signal if actionable
      if (signal.type !== 'hold' && signal.strength > 0) {
        await this.executeSignal(signal);
      }

      // Reset error count on successful tick
      this.state.errorCount = 0;
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  private handleTickError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err));
    this.state.errorCount++;

    logger.error(`[Bot] Tick error (${this.state.errorCount}): ${error.message}`);
    this.emit('bot:error', error);

    if (this.circuitBreaker.isOpen) {
      this.setStatus('circuit_open');
    }
  }

  // ─── Signal Execution ──────────────────────────────────────────────────────

  private async getSignal(ticker: Ticker): Promise<Signal> {
    const candles = await this.circuitBreaker.execute(() =>
      this.exchange.getOHLCV(this.config.symbol, '1m', this.strategy.minimumCandles + 10)
    );

    return this.strategy.analyze(candles, this.config.symbol, ticker.last);
  }

  private async executeSignal(signal: Signal): Promise<void> {
    if (!this.state.portfolio) {
      logger.warn('[Bot] Cannot execute signal: portfolio not loaded');
      return;
    }

    // Risk check
    const riskCheck = this.riskManager.checkSignal(signal, this.state.portfolio, this.state);

    if (!riskCheck.approved) {
      logger.info(`[Bot] Signal rejected by risk manager: ${riskCheck.reason}`);
      this.emit('risk:rejected', riskCheck.reason ?? 'Unknown reason', signal);
      return;
    }

    // Validate balance
    const balances = await this.circuitBreaker.execute(() => this.exchange.getBalances());
    const balanceCheck = this.riskManager.validateBalance(
      riskCheck.adjustedAmount!,
      signal.price,
      signal.type as 'buy' | 'sell',
      balances,
      signal.symbol
    );

    if (!balanceCheck.approved) {
      logger.warn(`[Bot] Insufficient balance: ${balanceCheck.reason}`);
      this.emit('risk:rejected', balanceCheck.reason ?? 'Insufficient balance', signal);
      return;
    }

    const orderRequest: OrderRequest = {
      symbol: signal.symbol,
      side: signal.type as 'buy' | 'sell',
      type: 'market',
      amount: riskCheck.adjustedAmount!,
      clientOrderId: `bot-${Date.now()}`,
    };

    if (this.config.dryRun) {
      logger.info(`[Bot] DRY RUN: Would place ${orderRequest.side.toUpperCase()} order for ${orderRequest.amount.toFixed(6)} ${signal.symbol} @ ~$${signal.price.toFixed(2)}`);
      logger.info(`[Bot] DRY RUN: Signal reason: ${signal.reason}`);
      return;
    }

    await this.placeOrderAndTrack(orderRequest, signal);
  }

  private async placeOrderAndTrack(request: OrderRequest, signal: Signal): Promise<void> {
    try {
      const order = await this.circuitBreaker.execute(() => this.exchange.placeOrder(request));
      this.emit('order:placed', order);

      if (order.status === 'filled') {
        this.emit('order:filled', order);
        await this.openPosition(order, signal);
      }

      logger.info(`[Bot] Order placed: ${order.id} | ${order.side.toUpperCase()} ${order.filledAmount} ${order.symbol} @ $${order.avgFillPrice.toFixed(2)}`);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(`[Bot] Order failed: ${error.message}`);
      this.emit('order:failed', error, request);
    }
  }

  // ─── Position Management ───────────────────────────────────────────────────

  private async openPosition(order: Order, _signal: Signal): Promise<void> {
    const position: Position = {
      id: `pos-${Date.now()}`,
      symbol: order.symbol,
      side: order.side,
      entryPrice: order.avgFillPrice,
      currentPrice: order.avgFillPrice,
      amount: order.filledAmount,
      unrealizedPnL: 0,
      unrealizedPnLPercent: 0,
      stopLoss: this.riskManager.calculateStopLoss(order.avgFillPrice, order.side),
      takeProfit: this.riskManager.calculateTakeProfit(order.avgFillPrice, order.side),
      openedAt: Date.now(),
      orderId: order.id,
    };

    this.state.positions.set(position.id, position);
    this.emit('position:opened', position);

    logger.info(
      `[Bot] Position opened: ${position.side.toUpperCase()} ${position.amount} ${position.symbol} @ $${position.entryPrice.toFixed(2)} | SL: $${position.stopLoss?.toFixed(2)} | TP: $${position.takeProfit?.toFixed(2)}`
    );
  }

  private async checkPositions(ticker: Ticker): Promise<void> {
    for (const [id, position] of this.state.positions) {
      if (position.symbol !== ticker.symbol) continue;

      // Update unrealized PnL
      position.currentPrice = ticker.last;
      const priceDiff = position.side === 'buy'
        ? ticker.last - position.entryPrice
        : position.entryPrice - ticker.last;

      position.unrealizedPnL = priceDiff * position.amount;
      position.unrealizedPnLPercent = priceDiff / position.entryPrice;

      // Check stop loss / take profit
      const check = this.riskManager.shouldClosePosition(position, ticker.last);
      if (check.close && check.reason) {
        logger.info(`[Bot] Auto-closing position ${id}: ${check.reason}`);
        this.emit('position:stopped', position, check.reason);
        await this.closePosition(id, ticker.last, check.reason);
      }
    }
  }

  private async closePosition(positionId: string, exitPrice: number, reason: string): Promise<void> {
    const position = this.state.positions.get(positionId);
    if (!position) return;

    if (!this.config.dryRun) {
      const closeRequest: OrderRequest = {
        symbol: position.symbol,
        side: position.side === 'buy' ? 'sell' : 'buy',
        type: 'market',
        amount: position.amount,
        clientOrderId: `close-${Date.now()}`,
      };

      try {
        const order = await this.circuitBreaker.execute(() => this.exchange.placeOrder(closeRequest));
        exitPrice = order.avgFillPrice;
        this.emit('order:filled', order);
      } catch (err) {
        logger.error(`[Bot] Failed to close position ${positionId}: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    }

    const priceDiff = position.side === 'buy'
      ? exitPrice - position.entryPrice
      : position.entryPrice - exitPrice;

    const pnl = priceDiff * position.amount;
    const pnlPercent = priceDiff / position.entryPrice;

    const tradeRecord: TradeRecord = {
      id: `trade-${Date.now()}`,
      symbol: position.symbol,
      side: position.side,
      amount: position.amount,
      price: exitPrice,
      fees: position.amount * exitPrice * 0.001,
      pnl,
      pnlPercent,
      strategy: this.strategy.name,
      openedAt: position.openedAt,
      closedAt: Date.now(),
    };

    this.state.tradeHistory.push(tradeRecord);
    this.state.dailyPnL += pnl;
    this.state.positions.delete(positionId);

    // Update daily PnL percent relative to starting portfolio
    if (this.initialPortfolioValue > 0) {
      this.state.dailyPnLPercent = this.state.dailyPnL / this.initialPortfolioValue;
    }

    this.emit('position:closed', position, tradeRecord);

    const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
    logger.info(
      `[Bot] Position closed (${reason}): ${position.side.toUpperCase()} ${position.symbol} | PnL: ${pnlStr} (${(pnlPercent * 100).toFixed(2)}%)`
    );

    // Check daily loss limit
    if (this.state.dailyPnLPercent <= -this.config.risk.maxDailyLossPercent) {
      logger.warn(`[Bot] Daily loss limit reached. Pausing trading.`);
      this.emit('daily:loss:limit', this.state.dailyPnL);
      this.pause();
    }
  }

  private async closeAllPositions(reason: string): Promise<void> {
    const positionIds = Array.from(this.state.positions.keys());
    for (const id of positionIds) {
      const position = this.state.positions.get(id);
      if (position) {
        try {
          const ticker = await this.exchange.getTicker(position.symbol);
          await this.closePosition(id, ticker.last, reason);
        } catch (err) {
          logger.error(`[Bot] Failed to close position ${id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  // ─── Portfolio ─────────────────────────────────────────────────────────────

  private async refreshPortfolio(): Promise<void> {
    try {
      const balances = await this.circuitBreaker.execute(() => this.exchange.getBalances());

      // Get current prices for portfolio valuation
      const prices = new Map<string, number>();
      try {
        const ticker = await this.exchange.getTicker(this.config.symbol);
        const [base] = this.config.symbol.split('/');
        prices.set(this.config.symbol, ticker.last);
        prices.set(`${base}/USDT`, ticker.last);
      } catch {
        // Portfolio value will be approximate
      }

      const totalValueUSD = this.riskManager.calculatePortfolioValue(balances, prices);

      this.state.portfolio = {
        balances,
        totalValueUSD,
        timestamp: Date.now(),
      };
    } catch (err) {
      logger.warn(`[Bot] Failed to refresh portfolio: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private setStatus(status: BotStatus): void {
    this.state.status = status;
  }

  private scheduleDayReset(): void {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();

    this.dayResetTimer = setTimeout(() => {
      logger.info('[Bot] Daily PnL reset');
      this.state.dailyPnL = 0;
      this.state.dailyPnLPercent = 0;

      // Resume if paused due to daily loss limit
      if (this.state.status === 'paused') {
        this.resume().catch((err) => logger.error(`[Bot] Failed to resume: ${err}`));
      }

      this.scheduleDayReset(); // Schedule next day
    }, msUntilMidnight);
  }

  private clearTimers(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    if (this.dayResetTimer) {
      clearTimeout(this.dayResetTimer);
      this.dayResetTimer = null;
    }
  }
}
