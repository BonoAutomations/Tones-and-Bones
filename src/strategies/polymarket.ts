import { OHLCV, Signal, StrategyConfig } from '../types';
import { BaseStrategy } from './base';

export interface PolymarketParams {
  buyThreshold: number;    // Buy YES if probability < this (value play)
  sellThreshold: number;   // Sell/exit if probability > this
  minLiquidity: number;    // Minimum market liquidity in USDC
  rsiPeriod: number;       // RSI period for momentum
  rsiOversold: number;     // RSI oversold = potential mean reversion up
  rsiOverbought: number;   // RSI overbought = potential mean reversion down
}

const DEFAULT_PARAMS: PolymarketParams = {
  buyThreshold: 0.35,     // Buy YES if market thinks <35% chance (contrarian)
  sellThreshold: 0.70,    // Exit YES position at 70% probability
  minLiquidity: 1000,     // Minimum $1,000 USDC liquidity
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
};

/**
 * Polymarket prediction market strategy.
 *
 * Approach: Probability mean reversion + momentum.
 *
 * Logic:
 *   - If the YES price (probability) is very low (< buyThreshold) AND
 *     RSI is oversold → the market may be underpricing the event → BUY YES
 *   - If the YES price is very high (> sellThreshold) AND
 *     RSI is overbought → market may be overpricing → SELL (or buy NO)
 *
 * This is a contrarian strategy best used with well-researched markets.
 * ALWAYS verify the market question and end date before trading.
 */
export class PolymarketStrategy extends BaseStrategy {
  private readonly params: PolymarketParams;

  constructor(config: StrategyConfig) {
    super(config);
    this.params = { ...DEFAULT_PARAMS, ...(config.params as Partial<PolymarketParams>) };
  }

  get name(): string {
    return 'polymarket';
  }

  get minimumCandles(): number {
    return this.params.rsiPeriod + 5;
  }

  analyze(candles: OHLCV[], symbol: string, currentPrice: number): Signal {
    // currentPrice = current YES token probability (0.0–1.0)
    const closes = this.getClosePrices(candles);

    if (closes.length < this.minimumCandles) {
      return this.holdSignal(symbol, currentPrice, 'Insufficient price history');
    }

    const rsiValues = this.rsi(closes, this.params.rsiPeriod);
    const currentRSI = rsiValues[rsiValues.length - 1];

    const probabilityPercent = (currentPrice * 100).toFixed(1);
    const isExtremeLow = currentPrice < this.params.buyThreshold;
    const isExtremeHigh = currentPrice > this.params.sellThreshold;
    const isOversold = currentRSI < this.params.rsiOversold;
    const isOverbought = currentRSI > this.params.rsiOverbought;

    // Calculate price trend (recent direction)
    const recentCloses = closes.slice(-5);
    const trend = (recentCloses[recentCloses.length - 1] - recentCloses[0]) / recentCloses[0];

    // BUY signal: market is pricing the event at a very low probability
    // AND momentum (RSI) is starting to turn up → potential underpricing
    if (isExtremeLow && isOversold) {
      const strength = Math.min(1, (this.params.buyThreshold - currentPrice) / this.params.buyThreshold + 0.3);
      return {
        type: 'buy',
        symbol,
        strength,
        price: currentPrice,
        reason: `YES probability ${probabilityPercent}% is potentially underpriced (RSI: ${currentRSI.toFixed(1)} oversold)`,
        timestamp: Date.now(),
        metadata: { probability: currentPrice, rsi: currentRSI, trend },
      };
    }

    // SELL signal: market overpricing the event
    if (isExtremeHigh && isOverbought) {
      const strength = Math.min(1, (currentPrice - this.params.sellThreshold) / (1 - this.params.sellThreshold) + 0.3);
      return {
        type: 'sell',
        symbol,
        strength,
        price: currentPrice,
        reason: `YES probability ${probabilityPercent}% may be overpriced (RSI: ${currentRSI.toFixed(1)} overbought)`,
        timestamp: Date.now(),
        metadata: { probability: currentPrice, rsi: currentRSI, trend },
      };
    }

    // Momentum continuation — strong upward trend with room to run
    if (trend > 0.05 && currentPrice < 0.6 && !isOverbought) {
      return {
        type: 'buy',
        symbol,
        strength: Math.min(0.5, trend * 5),
        price: currentPrice,
        reason: `Positive probability momentum: +${(trend * 100).toFixed(1)}% recent move`,
        timestamp: Date.now(),
        metadata: { probability: currentPrice, rsi: currentRSI, trend },
      };
    }

    return this.holdSignal(
      symbol,
      currentPrice,
      `Probability ${probabilityPercent}% — no edge detected (RSI: ${currentRSI.toFixed(1)})`
    );
  }

  private holdSignal(symbol: string, price: number, reason: string): Signal {
    return { type: 'hold', symbol, strength: 0, price, reason, timestamp: Date.now() };
  }
}
