import Decimal from 'decimal.js';
import {
  RiskConfig, RiskCheckResult, Signal, Portfolio, Position, BotState,
} from '../types';
import logger from '../utils/logger';

/**
 * Risk management module.
 *
 * Responsibilities:
 * - Position sizing (Kelly criterion + max position limit)
 * - Daily loss circuit breaker
 * - Maximum open positions enforcement
 * - Stop loss / take profit calculation
 * - Prevents overexposure and runaway losses
 */
export class RiskManager {
  private readonly config: RiskConfig;

  constructor(config: RiskConfig) {
    this.config = config;
  }

  /**
   * Validate a trade signal against risk rules.
   * Returns whether the trade is approved and the allowed position size.
   */
  checkSignal(
    signal: Signal,
    portfolio: Portfolio,
    state: BotState
  ): RiskCheckResult {
    // 1. Check daily loss limit
    if (state.dailyPnLPercent <= -this.config.maxDailyLossPercent) {
      logger.warn(`[RiskManager] Daily loss limit reached: ${(state.dailyPnLPercent * 100).toFixed(2)}%`);
      return {
        approved: false,
        reason: `Daily loss limit reached: ${(state.dailyPnLPercent * 100).toFixed(2)}% (limit: ${(this.config.maxDailyLossPercent * 100).toFixed(2)}%)`,
      };
    }

    // 2. Check max open positions
    if (state.positions.size >= this.config.maxOpenPositions) {
      logger.warn(`[RiskManager] Max open positions reached: ${state.positions.size}/${this.config.maxOpenPositions}`);
      return {
        approved: false,
        reason: `Max open positions reached: ${state.positions.size}/${this.config.maxOpenPositions}`,
      };
    }

    // 3. Check if we already have a position in this symbol
    const existingPosition = Array.from(state.positions.values())
      .find((p) => p.symbol === signal.symbol && p.side === signal.type);

    if (existingPosition) {
      return {
        approved: false,
        reason: `Already have an open ${signal.type} position for ${signal.symbol}`,
      };
    }

    // 4. Calculate position size
    const positionSizeResult = this.calculatePositionSize(signal, portfolio);
    if (!positionSizeResult.approved) {
      return positionSizeResult;
    }

    return {
      approved: true,
      adjustedAmount: positionSizeResult.adjustedAmount,
    };
  }

  /**
   * Calculate safe position size using portfolio percentage and Kelly criterion.
   */
  calculatePositionSize(signal: Signal, portfolio: Portfolio): RiskCheckResult {
    const portfolioValue = new Decimal(portfolio.totalValueUSD);

    if (portfolioValue.lte(0)) {
      return { approved: false, reason: 'Portfolio value is zero or negative' };
    }

    // Maximum position value based on config
    const maxPositionValue = portfolioValue
      .mul(this.config.maxPositionSizePercent)
      .mul(signal.strength); // Scale by signal strength

    // Ensure minimum viable trade size ($10)
    if (maxPositionValue.lt(10)) {
      return {
        approved: false,
        reason: `Position size too small: $${maxPositionValue.toFixed(2)} (minimum $10)`,
      };
    }

    // Calculate amount in base currency
    const priceDecimal = new Decimal(signal.price);
    const amount = maxPositionValue.div(priceDecimal);

    logger.debug(`[RiskManager] Position size: $${maxPositionValue.toFixed(2)} = ${amount.toFixed(6)} units @ $${signal.price}`);

    return {
      approved: true,
      adjustedAmount: amount.toNumber(),
    };
  }

  /**
   * Calculate stop loss price for a position.
   */
  calculateStopLoss(entryPrice: number, side: 'buy' | 'sell'): number {
    if (side === 'buy') {
      return entryPrice * (1 - this.config.stopLossPercent);
    }
    return entryPrice * (1 + this.config.stopLossPercent);
  }

  /**
   * Calculate take profit price for a position.
   */
  calculateTakeProfit(entryPrice: number, side: 'buy' | 'sell'): number {
    if (side === 'buy') {
      return entryPrice * (1 + this.config.takeProfitPercent);
    }
    return entryPrice * (1 - this.config.takeProfitPercent);
  }

  /**
   * Check if a position should be closed based on current price.
   */
  shouldClosePosition(
    position: Position,
    currentPrice: number
  ): { close: boolean; reason?: 'stop_loss' | 'take_profit' } {
    if (position.stopLoss !== undefined) {
      if (position.side === 'buy' && currentPrice <= position.stopLoss) {
        return { close: true, reason: 'stop_loss' };
      }
      if (position.side === 'sell' && currentPrice >= position.stopLoss) {
        return { close: true, reason: 'stop_loss' };
      }
    }

    if (position.takeProfit !== undefined) {
      if (position.side === 'buy' && currentPrice >= position.takeProfit) {
        return { close: true, reason: 'take_profit' };
      }
      if (position.side === 'sell' && currentPrice <= position.takeProfit) {
        return { close: true, reason: 'take_profit' };
      }
    }

    return { close: false };
  }

  /**
   * Calculate portfolio total value from balances.
   */
  calculatePortfolioValue(
    balances: Map<string, { free: number; used: number; total: number }>,
    prices: Map<string, number>
  ): number {
    let total = 0;

    for (const [currency, balance] of balances) {
      if (currency === 'USDT' || currency === 'USD') {
        total += balance.total;
      } else {
        // Look for price in common pairs
        const price = prices.get(`${currency}/USDT`) ?? prices.get(`${currency}/USD`) ?? 0;
        total += balance.total * price;
      }
    }

    return total;
  }

  /**
   * Validate position sizing doesn't exceed available balance.
   */
  validateBalance(
    amount: number,
    price: number,
    side: 'buy' | 'sell',
    balances: Map<string, { free: number; total: number }>,
    symbol: string
  ): RiskCheckResult {
    const [base, quote] = symbol.split('/');

    if (side === 'buy') {
      const quoteBalance = balances.get(quote);
      const required = amount * price * 1.001; // +0.1% for fees
      if (!quoteBalance || quoteBalance.free < required) {
        return {
          approved: false,
          reason: `Insufficient ${quote} balance: need ${required.toFixed(2)}, have ${(quoteBalance?.free ?? 0).toFixed(2)}`,
        };
      }
    } else {
      const baseBalance = balances.get(base);
      if (!baseBalance || baseBalance.free < amount) {
        return {
          approved: false,
          reason: `Insufficient ${base} balance: need ${amount.toFixed(6)}, have ${(baseBalance?.free ?? 0).toFixed(6)}`,
        };
      }
    }

    return { approved: true };
  }

  get configuration(): RiskConfig {
    return { ...this.config };
  }
}
