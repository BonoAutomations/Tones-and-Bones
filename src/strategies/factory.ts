import { StrategyConfig } from '../types';
import { BaseStrategy } from './base';
import { MovingAverageStrategy } from './moving-average';
import { RSIStrategy } from './rsi';
import { CombinedStrategy } from './combined';

/**
 * Factory to create strategy instances by name.
 */
export function createStrategy(config: StrategyConfig): BaseStrategy {
  switch (config.name.toLowerCase()) {
    case 'moving_average':
    case 'ma':
      return new MovingAverageStrategy(config);
    case 'rsi':
      return new RSIStrategy(config);
    case 'combined':
      return new CombinedStrategy(config);
    default:
      throw new Error(`Unknown strategy: "${config.name}". Supported: moving_average, rsi, combined`);
  }
}
