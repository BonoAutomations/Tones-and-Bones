import { OHLCV, Signal, StrategyConfig } from '../types';
import { BaseStrategy } from './base';

export interface RSIParams {
  period: number;
  overbought: number;
  oversold: number;
  bbPeriod: number;   // Bollinger Bands period for additional filter
  bbStdDev: number;
}

const DEFAULT_PARAMS: RSIParams = {
  period: 14,
  overbought: 70,
  oversold: 30,
  bbPeriod: 20,
  bbStdDev: 2,
};

/**
 * RSI + Bollinger Bands mean reversion strategy.
 *
 * Buy signal:  RSI oversold AND price touches/crosses lower Bollinger Band
 * Sell signal: RSI overbought AND price touches/crosses upper Bollinger Band
 *
 * This strategy works best in ranging/sideways markets.
 */
export class RSIStrategy extends BaseStrategy {
  private readonly params: RSIParams;

  constructor(config: StrategyConfig) {
    super(config);
    this.params = { ...DEFAULT_PARAMS, ...(config.params as Partial<RSIParams>) };
  }

  get name(): string {
    return 'rsi';
  }

  get minimumCandles(): number {
    return Math.max(this.params.period, this.params.bbPeriod) + 10;
  }

  analyze(candles: OHLCV[], symbol: string, currentPrice: number): Signal {
    const closes = this.getClosePrices(candles);

    const rsiValues = this.rsi(closes, this.params.period);
    const bb = this.bollingerBands(closes, this.params.bbPeriod, this.params.bbStdDev);

    if (rsiValues.length < 2 || bb.upper.length < 1) {
      return this.holdSignal(symbol, currentPrice, 'Insufficient data');
    }

    const currentRSI = rsiValues[rsiValues.length - 1];
    const prevRSI = rsiValues[rsiValues.length - 2];
    const upperBB = bb.upper[bb.upper.length - 1];
    const lowerBB = bb.lower[bb.lower.length - 1];
    const middleBB = bb.middle[bb.middle.length - 1];

    // Band width as market context (narrow = consolidating, wide = trending)
    const bandWidth = (upperBB - lowerBB) / middleBB;
    const isRanging = bandWidth < 0.04; // Less than 4% width suggests ranging market

    // RSI divergence from extremes (momentum reversal)
    const rsiRisingFromOversold = prevRSI <= this.params.oversold && currentRSI > this.params.oversold;
    const rsiFallingFromOverbought = prevRSI >= this.params.overbought && currentRSI < this.params.overbought;

    // Price touching Bollinger Bands
    const touchingLowerBB = currentPrice <= lowerBB * 1.005; // Within 0.5% of lower band
    const touchingUpperBB = currentPrice >= upperBB * 0.995; // Within 0.5% of upper band

    // Signal strength based on RSI deviation and BB position
    const rsiDeviation = Math.abs(currentRSI - 50) / 50;
    const bbDeviation = currentPrice < middleBB
      ? (middleBB - currentPrice) / (middleBB - lowerBB)
      : (currentPrice - middleBB) / (upperBB - middleBB);

    const strength = Math.min(1, (rsiDeviation + bbDeviation) / 2);

    if ((currentRSI < this.params.oversold || rsiRisingFromOversold) && touchingLowerBB) {
      return {
        type: 'buy',
        symbol,
        strength: Math.max(0.5, strength),
        price: currentPrice,
        reason: `RSI oversold (${currentRSI.toFixed(1)}) with price at lower Bollinger Band${isRanging ? ' (ranging market)' : ''}`,
        timestamp: Date.now(),
        metadata: {
          rsi: currentRSI,
          upperBB,
          lowerBB,
          middleBB,
          bandWidth,
          isRanging,
        },
      };
    }

    if ((currentRSI > this.params.overbought || rsiFallingFromOverbought) && touchingUpperBB) {
      return {
        type: 'sell',
        symbol,
        strength: Math.max(0.5, strength),
        price: currentPrice,
        reason: `RSI overbought (${currentRSI.toFixed(1)}) with price at upper Bollinger Band${isRanging ? ' (ranging market)' : ''}`,
        timestamp: Date.now(),
        metadata: {
          rsi: currentRSI,
          upperBB,
          lowerBB,
          middleBB,
          bandWidth,
          isRanging,
        },
      };
    }

    return this.holdSignal(symbol, currentPrice, `RSI: ${currentRSI.toFixed(1)}, No extreme reading`);
  }

  private holdSignal(symbol: string, price: number, reason: string): Signal {
    return {
      type: 'hold',
      symbol,
      strength: 0,
      price,
      reason,
      timestamp: Date.now(),
    };
  }
}
