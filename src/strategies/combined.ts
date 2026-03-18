import { OHLCV, Signal, SignalType, StrategyConfig } from '../types';
import { BaseStrategy } from './base';
import { MovingAverageStrategy } from './moving-average';
import { RSIStrategy } from './rsi';

/**
 * Combined strategy that aggregates signals from multiple sub-strategies.
 *
 * A signal is only emitted when a configurable number of strategies agree.
 * This reduces false positives at the cost of fewer trades.
 */
export class CombinedStrategy extends BaseStrategy {
  private readonly strategies: BaseStrategy[];
  private readonly minAgreement: number;

  constructor(config: StrategyConfig) {
    super(config);
    this.minAgreement = (config.params.minAgreement as number | undefined) ?? 2;
    this.strategies = [
      new MovingAverageStrategy({ name: 'ma', params: config.params }),
      new RSIStrategy({ name: 'rsi', params: config.params }),
    ];
  }

  get name(): string {
    return 'combined';
  }

  get minimumCandles(): number {
    return Math.max(...this.strategies.map((s) => s.minimumCandles));
  }

  analyze(candles: OHLCV[], symbol: string, currentPrice: number): Signal {
    const signals = this.strategies.map((s) => s.analyze(candles, symbol, currentPrice));

    const buySignals = signals.filter((s) => s.type === 'buy');
    const sellSignals = signals.filter((s) => s.type === 'sell');

    if (buySignals.length >= this.minAgreement) {
      const avgStrength = buySignals.reduce((sum, s) => sum + s.strength, 0) / buySignals.length;
      const reasons = buySignals.map((s) => s.reason).join(' | ');
      return {
        type: 'buy',
        symbol,
        strength: Math.min(1, avgStrength * 1.2), // Bonus for consensus
        price: currentPrice,
        reason: `[${buySignals.length}/${signals.length} agree] ${reasons}`,
        timestamp: Date.now(),
        metadata: { signals: signals.map((s) => ({ strategy: s.type, strength: s.strength })) },
      };
    }

    if (sellSignals.length >= this.minAgreement) {
      const avgStrength = sellSignals.reduce((sum, s) => sum + s.strength, 0) / sellSignals.length;
      const reasons = sellSignals.map((s) => s.reason).join(' | ');
      return {
        type: 'sell',
        symbol,
        strength: Math.min(1, avgStrength * 1.2),
        price: currentPrice,
        reason: `[${sellSignals.length}/${signals.length} agree] ${reasons}`,
        timestamp: Date.now(),
        metadata: { signals: signals.map((s) => ({ strategy: s.type, strength: s.strength })) },
      };
    }

    // Weighted vote for single-strategy signals
    const dominantType = this.getDominantType(signals);
    if (dominantType !== 'hold') {
      const matchingSignals = signals.filter((s) => s.type === dominantType);
      const avgStrength = matchingSignals.reduce((sum, s) => sum + s.strength, 0) / matchingSignals.length;

      if (avgStrength >= 0.7) {
        return {
          type: dominantType,
          symbol,
          strength: avgStrength * 0.8, // Reduced confidence without consensus
          price: currentPrice,
          reason: `[1/${signals.length} agree] ${matchingSignals[0].reason}`,
          timestamp: Date.now(),
        };
      }
    }

    return {
      type: 'hold',
      symbol,
      strength: 0,
      price: currentPrice,
      reason: `No consensus: ${signals.map((s) => `${s.type}(${s.strength.toFixed(2)})`).join(', ')}`,
      timestamp: Date.now(),
    };
  }

  private getDominantType(signals: Signal[]): SignalType {
    const counts = { buy: 0, sell: 0, hold: 0 };
    for (const s of signals) {
      counts[s.type]++;
    }
    if (counts.buy > counts.sell && counts.buy > counts.hold) return 'buy';
    if (counts.sell > counts.buy && counts.sell > counts.hold) return 'sell';
    return 'hold';
  }
}
