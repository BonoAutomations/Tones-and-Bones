import { ExchangeConfig } from '../types';
import { BaseExchange } from './base';
import { MockExchange } from './mock';
import { BinanceExchange } from './binance';
import { CoinbaseExchange } from './coinbase';
import { CryptoComExchange } from './cryptocom';
import { PolymarketExchange } from './polymarket';

/**
 * Factory to create exchange adapters by name.
 */
export function createExchange(config: ExchangeConfig): BaseExchange {
  switch (config.name.toLowerCase()) {
    case 'mock':
      return new MockExchange(config);
    case 'binance':
      return new BinanceExchange(config);
    case 'coinbase':
      return new CoinbaseExchange(config);
    case 'cryptocom':
    case 'crypto.com':
      return new CryptoComExchange(config);
    case 'polymarket':
      return new PolymarketExchange(config);
    default:
      throw new Error(`Unknown exchange: "${config.name}". Supported: mock, binance, coinbase, cryptocom, polymarket`);
  }
}
