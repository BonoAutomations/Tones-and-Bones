import { OHLCV, Signal, StrategyConfig } from '../types';

/**
 * Abstract base class for all trading strategies.
 */
export abstract class BaseStrategy {
  protected readonly config: StrategyConfig;

  constructor(config: StrategyConfig) {
    this.config = config;
  }

  abstract get name(): string;

  /**
   * Analyze market data and return a trading signal.
   * @param candles - Historical OHLCV data (newest last)
   * @param symbol - Trading pair
   * @param currentPrice - Current market price
   */
  abstract analyze(candles: OHLCV[], symbol: string, currentPrice: number): Signal;

  /**
   * Minimum candles required for this strategy to produce a valid signal.
   */
  abstract get minimumCandles(): number;

  /**
   * Extract closing prices from candle data.
   */
  protected getClosePrices(candles: OHLCV[]): number[] {
    return candles.map((c) => c.close);
  }

  /**
   * Extract high prices from candle data.
   */
  protected getHighPrices(candles: OHLCV[]): number[] {
    return candles.map((c) => c.high);
  }

  /**
   * Extract low prices from candle data.
   */
  protected getLowPrices(candles: OHLCV[]): number[] {
    return candles.map((c) => c.low);
  }

  /**
   * Compute Simple Moving Average.
   */
  protected sma(values: number[], period: number): number[] {
    const result: number[] = [];
    for (let i = period - 1; i < values.length; i++) {
      const slice = values.slice(i - period + 1, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / period);
    }
    return result;
  }

  /**
   * Compute Exponential Moving Average.
   */
  protected ema(values: number[], period: number): number[] {
    if (values.length < period) return [];
    const k = 2 / (period + 1);
    const result: number[] = [];
    let emaVal = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result.push(emaVal);

    for (let i = period; i < values.length; i++) {
      emaVal = values[i] * k + emaVal * (1 - k);
      result.push(emaVal);
    }
    return result;
  }

  /**
   * Compute Relative Strength Index.
   */
  protected rsi(values: number[], period: number): number[] {
    if (values.length < period + 1) return [];
    const result: number[] = [];
    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 1; i <= period; i++) {
      const change = values[i] - values[i - 1];
      if (change > 0) avgGain += change;
      else avgLoss += Math.abs(change);
    }

    avgGain /= period;
    avgLoss /= period;

    for (let i = period + 1; i < values.length; i++) {
      const change = values[i] - values[i - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    }

    return result;
  }

  /**
   * Compute Bollinger Bands.
   */
  protected bollingerBands(
    values: number[],
    period: number,
    stdDev = 2
  ): { upper: number[]; middle: number[]; lower: number[] } {
    const middle = this.sma(values, period);
    const upper: number[] = [];
    const lower: number[] = [];

    for (let i = 0; i < middle.length; i++) {
      const slice = values.slice(i, i + period);
      const mean = middle[i];
      const variance = slice.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / period;
      const sd = Math.sqrt(variance);
      upper.push(mean + stdDev * sd);
      lower.push(mean - stdDev * sd);
    }

    return { upper, middle, lower };
  }

  /**
   * Compute MACD.
   */
  protected macd(
    values: number[],
    fastPeriod = 12,
    slowPeriod = 26,
    signalPeriod = 9
  ): { macd: number[]; signal: number[]; histogram: number[] } {
    const fastEma = this.ema(values, fastPeriod);
    const slowEma = this.ema(values, slowPeriod);

    // Align lengths (slow EMA is shorter)
    const offset = fastEma.length - slowEma.length;
    const macdLine = slowEma.map((slow, i) => fastEma[i + offset] - slow);
    const signalLine = this.ema(macdLine, signalPeriod);

    const histOffset = macdLine.length - signalLine.length;
    const histogram = signalLine.map((sig, i) => macdLine[i + histOffset] - sig);

    return { macd: macdLine, signal: signalLine, histogram };
  }
}
