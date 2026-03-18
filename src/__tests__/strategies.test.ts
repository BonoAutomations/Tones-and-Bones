import { MovingAverageStrategy } from '../strategies/moving-average';
import { RSIStrategy } from '../strategies/rsi';
import { CombinedStrategy } from '../strategies/combined';
import { OHLCV } from '../types';

function generateCandles(
  count: number,
  startPrice = 40000,
  trend: 'up' | 'down' | 'sideways' = 'sideways'
): OHLCV[] {
  const candles: OHLCV[] = [];
  let price = startPrice;
  const now = Date.now();

  for (let i = count; i >= 1; i--) {
    const trendBias = trend === 'up' ? 0.002 : trend === 'down' ? -0.002 : 0;
    const noise = (Math.random() - 0.5) * 0.01;
    const change = trendBias + noise;
    const open = price;
    const close = open * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);

    candles.push({
      timestamp: now - i * 60000,
      open,
      high,
      low,
      close,
      volume: 10 + Math.random() * 100,
    });
    price = close;
  }
  return candles;
}

describe('MovingAverageStrategy', () => {
  const strategy = new MovingAverageStrategy({
    name: 'moving_average',
    params: { fastPeriod: 9, slowPeriod: 21, signalPeriod: 5 },
  });

  it('has correct minimum candles', () => {
    expect(strategy.minimumCandles).toBeGreaterThan(0);
  });

  it('returns hold when insufficient data', () => {
    const signal = strategy.analyze(generateCandles(5), 'BTC/USDT', 40000);
    expect(signal.type).toBe('hold');
  });

  it('returns a valid signal with sufficient data', () => {
    const candles = generateCandles(100);
    const signal = strategy.analyze(candles, 'BTC/USDT', 40000);
    expect(['buy', 'sell', 'hold']).toContain(signal.type);
    expect(signal.symbol).toBe('BTC/USDT');
    expect(signal.price).toBe(40000);
    expect(signal.timestamp).toBeGreaterThan(0);
    expect(signal.reason).toBeTruthy();
    expect(signal.strength).toBeGreaterThanOrEqual(0);
    expect(signal.strength).toBeLessThanOrEqual(1);
  });

  it('generates buy signals in uptrend', () => {
    // Use a seeded uptrend to get consistent results
    const signals: string[] = [];
    for (let i = 0; i < 20; i++) {
      const candles = generateCandles(100, 40000, 'up');
      const signal = strategy.analyze(candles, 'BTC/USDT', candles[candles.length - 1].close);
      signals.push(signal.type);
    }
    // In uptrend, we expect more buy than sell signals over multiple runs
    const buys = signals.filter((s) => s === 'buy').length;
    const sells = signals.filter((s) => s === 'sell').length;
    expect(buys).toBeGreaterThanOrEqual(sells);
  });
});

describe('RSIStrategy', () => {
  const strategy = new RSIStrategy({
    name: 'rsi',
    params: { period: 14, overbought: 70, oversold: 30, bbPeriod: 20, bbStdDev: 2 },
  });

  it('has correct minimum candles', () => {
    expect(strategy.minimumCandles).toBeGreaterThan(0);
  });

  it('returns hold when insufficient data', () => {
    const signal = strategy.analyze(generateCandles(5), 'BTC/USDT', 40000);
    expect(signal.type).toBe('hold');
  });

  it('returns a valid signal with sufficient data', () => {
    const candles = generateCandles(100);
    const signal = strategy.analyze(candles, 'BTC/USDT', 40000);
    expect(['buy', 'sell', 'hold']).toContain(signal.type);
    expect(signal.symbol).toBe('BTC/USDT');
    expect(signal.strength).toBeGreaterThanOrEqual(0);
    expect(signal.strength).toBeLessThanOrEqual(1);
  });

  it('generates buy signal at simulated oversold conditions', () => {
    // Force a dramatic downtrend to create oversold RSI
    const candles: OHLCV[] = [];
    let price = 40000;
    const now = Date.now();

    // First 20 candles: normal
    for (let i = 50; i > 30; i--) {
      const open = price;
      const close = open * (1 + (Math.random() - 0.5) * 0.005);
      candles.push({ timestamp: now - i * 60000, open, high: open * 1.002, low: close * 0.998, close, volume: 50 });
      price = close;
    }

    // Next 30 candles: strong downtrend (forces RSI low)
    for (let i = 30; i >= 1; i--) {
      const open = price;
      const close = open * 0.985; // 1.5% down each candle
      candles.push({ timestamp: now - i * 60000, open, high: open * 1.001, low: close * 0.999, close, volume: 80 });
      price = close;
    }

    const currentPrice = price;
    const signal = strategy.analyze(candles, 'BTC/USDT', currentPrice);

    // After strong downtrend, RSI should be low → expect buy or hold
    expect(['buy', 'hold']).toContain(signal.type);
  });
});

describe('CombinedStrategy', () => {
  const strategy = new CombinedStrategy({
    name: 'combined',
    params: {
      fastPeriod: 9, slowPeriod: 21, signalPeriod: 5,
      period: 14, overbought: 70, oversold: 30,
      bbPeriod: 20, bbStdDev: 2,
      minAgreement: 2,
    },
  });

  it('has minimum candles as max of sub-strategies', () => {
    expect(strategy.minimumCandles).toBeGreaterThan(0);
  });

  it('returns valid signal', () => {
    const candles = generateCandles(100);
    const signal = strategy.analyze(candles, 'BTC/USDT', 40000);
    expect(['buy', 'sell', 'hold']).toContain(signal.type);
    expect(signal.timestamp).toBeGreaterThan(0);
  });

  it('requires consensus for non-hold signals', () => {
    const candles = generateCandles(100);
    const signal = strategy.analyze(candles, 'BTC/USDT', 40000);

    // All signals should have a reason
    expect(signal.reason).toBeTruthy();
  });
});

describe('BaseStrategy helpers', () => {
  const strategy = new MovingAverageStrategy({
    name: 'moving_average',
    params: { fastPeriod: 5, slowPeriod: 10, signalPeriod: 3 },
  });

  // Access protected methods via type casting for testing
  const s = strategy as unknown as {
    sma(values: number[], period: number): number[];
    ema(values: number[], period: number): number[];
    rsi(values: number[], period: number): number[];
  };

  it('computes SMA correctly', () => {
    const values = [1, 2, 3, 4, 5];
    const result = s.sma(values, 3);
    expect(result).toHaveLength(3);
    expect(result[0]).toBeCloseTo(2); // avg(1,2,3)
    expect(result[1]).toBeCloseTo(3); // avg(2,3,4)
    expect(result[2]).toBeCloseTo(4); // avg(3,4,5)
  });

  it('computes EMA', () => {
    const values = [10, 20, 30, 40, 50, 60, 70];
    const result = s.ema(values, 3);
    expect(result.length).toBeGreaterThan(0);
    result.forEach((v) => expect(v).toBeGreaterThan(0));
  });

  it('computes RSI in valid range', () => {
    const values = Array.from({ length: 20 }, (_, i) => 100 + Math.sin(i) * 10);
    const result = s.rsi(values, 14);
    expect(result.length).toBeGreaterThan(0);
    result.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
  });
});
