import { OHLCV, Signal, StrategyConfig } from '../types';
import { BaseStrategy } from './base';

export interface MovingAverageParams {
  fastPeriod: number;    // Fast EMA period
  slowPeriod: number;    // Slow EMA period
  signalPeriod: number;  // Signal line period (MACD)
}

const DEFAULT_PARAMS: MovingAverageParams = {
  fastPeriod: 9,
  slowPeriod: 21,
  signalPeriod: 5,
};

/**
 * Moving Average Crossover + MACD strategy.
 *
 * Buy signal:  Fast EMA crosses above slow EMA AND MACD histogram turns positive
 * Sell signal: Fast EMA crosses below slow EMA AND MACD histogram turns negative
 */
export class MovingAverageStrategy extends BaseStrategy {
  private readonly params: MovingAverageParams;

  constructor(config: StrategyConfig) {
    super(config);
    this.params = { ...DEFAULT_PARAMS, ...(config.params as Partial<MovingAverageParams>) };
  }

  get name(): string {
    return 'moving_average';
  }

  get minimumCandles(): number {
    return this.params.slowPeriod + this.params.signalPeriod + 5;
  }

  analyze(candles: OHLCV[], symbol: string, currentPrice: number): Signal {
    const closes = this.getClosePrices(candles);

    const fastEma = this.ema(closes, this.params.fastPeriod);
    const slowEma = this.ema(closes, this.params.slowPeriod);

    if (fastEma.length < 2 || slowEma.length < 2) {
      return this.holdSignal(symbol, currentPrice, 'Insufficient data for EMA calculation');
    }

    const { macd, signal, histogram } = this.macd(
      closes,
      this.params.fastPeriod,
      this.params.slowPeriod,
      this.params.signalPeriod
    );

    if (histogram.length < 2) {
      return this.holdSignal(symbol, currentPrice, 'Insufficient data for MACD');
    }

    // Get latest values
    const fastNow = fastEma[fastEma.length - 1];
    const fastPrev = fastEma[fastEma.length - 2];
    const slowNow = slowEma[slowEma.length - 1];
    const slowPrev = slowEma[slowEma.length - 2];
    const histNow = histogram[histogram.length - 1];
    const histPrev = histogram[histogram.length - 2];
    const macdNow = macd[macd.length - 1];
    const signalNow = signal[signal.length - 1];

    // Detect crossovers
    const bullishCrossover = fastPrev <= slowPrev && fastNow > slowNow;
    const bearishCrossover = fastPrev >= slowPrev && fastNow < slowNow;
    const macdBullish = histPrev <= 0 && histNow > 0;
    const macdBearish = histPrev >= 0 && histNow < 0;

    // Calculate signal strength based on separation and MACD divergence
    const emaSeparation = Math.abs(fastNow - slowNow) / slowNow;
    const macdDivergence = Math.abs(macdNow - signalNow) / (Math.abs(signalNow) + 0.0001);
    const strength = Math.min(1, (emaSeparation * 50 + macdDivergence * 0.5) / 2);

    if (bullishCrossover && macdBullish) {
      return {
        type: 'buy',
        symbol,
        strength: Math.max(0.6, strength),
        price: currentPrice,
        reason: `Bullish EMA crossover (${this.params.fastPeriod}/${this.params.slowPeriod}) with MACD confirmation`,
        timestamp: Date.now(),
        metadata: { fastEma: fastNow, slowEma: slowNow, macd: macdNow, signal: signalNow },
      };
    }

    if (bearishCrossover && macdBearish) {
      return {
        type: 'sell',
        symbol,
        strength: Math.max(0.6, strength),
        price: currentPrice,
        reason: `Bearish EMA crossover (${this.params.fastPeriod}/${this.params.slowPeriod}) with MACD confirmation`,
        timestamp: Date.now(),
        metadata: { fastEma: fastNow, slowEma: slowNow, macd: macdNow, signal: signalNow },
      };
    }

    // Trend continuation signals (weaker)
    if (fastNow > slowNow && macdNow > signalNow) {
      return {
        type: 'buy',
        symbol,
        strength: Math.min(0.4, strength),
        price: currentPrice,
        reason: 'Bullish trend continuation: fast EMA above slow EMA',
        timestamp: Date.now(),
        metadata: { fastEma: fastNow, slowEma: slowNow },
      };
    }

    return this.holdSignal(symbol, currentPrice, 'No clear signal');
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
