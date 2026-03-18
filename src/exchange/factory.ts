import { ExchangeConfig } from '../types';
import { BaseExchange } from './base';
import { MockExchange } from './mock';
import { BinanceExchange } from './binance';

/**
 * Factory to create exchange adapters by name.
 */
export function createExchange(config: ExchangeConfig): BaseExchange {
  switch (config.name.toLowerCase()) {
    case 'mock':
      return new MockExchange(config);
    case 'binance':
      return new BinanceExchange(config);
    default:
      throw new Error(`Unknown exchange: "${config.name}". Supported: mock, binance`);
  }
}
