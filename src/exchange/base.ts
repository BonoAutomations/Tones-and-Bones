import { Ticker, OHLCV, Order, OrderRequest, Balance, ExchangeConfig } from '../types';

/**
 * Abstract base class for all exchange adapters.
 * All exchange implementations must implement this interface.
 */
export abstract class BaseExchange {
  protected readonly config: ExchangeConfig;

  constructor(config: ExchangeConfig) {
    this.config = config;
  }

  abstract get name(): string;

  /**
   * Initialize the exchange connection and validate credentials.
   */
  abstract connect(): Promise<void>;

  /**
   * Gracefully disconnect from the exchange.
   */
  abstract disconnect(): Promise<void>;

  /**
   * Fetch the current ticker for a symbol.
   */
  abstract getTicker(symbol: string): Promise<Ticker>;

  /**
   * Fetch OHLCV candle data.
   * @param symbol - Trading pair (e.g., "BTC/USDT")
   * @param timeframe - Candle interval (e.g., "1m", "5m", "1h")
   * @param limit - Number of candles to fetch
   */
  abstract getOHLCV(symbol: string, timeframe: string, limit: number): Promise<OHLCV[]>;

  /**
   * Fetch account balances.
   */
  abstract getBalances(): Promise<Map<string, Balance>>;

  /**
   * Place an order.
   */
  abstract placeOrder(request: OrderRequest): Promise<Order>;

  /**
   * Cancel an open order.
   */
  abstract cancelOrder(orderId: string, symbol: string): Promise<boolean>;

  /**
   * Fetch the status of an order.
   */
  abstract getOrder(orderId: string, symbol: string): Promise<Order>;

  /**
   * Fetch all open orders for a symbol.
   */
  abstract getOpenOrders(symbol: string): Promise<Order[]>;

  /**
   * Check if the exchange connection is healthy.
   */
  abstract isHealthy(): Promise<boolean>;
}
