import {
  Ticker, OHLCV, Order, OrderRequest, Balance, ExchangeConfig,
  OrderStatus,
} from '../types';
import { BaseExchange } from './base';
import logger from '../utils/logger';

// Simple UUID generator without external dependency
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

interface PriceSimulator {
  currentPrice: number;
  volatility: number;
  trend: number;
}

/**
 * Mock exchange for paper trading and testing.
 * Simulates realistic market behavior with configurable volatility.
 */
export class MockExchange extends BaseExchange {
  private connected = false;
  private readonly prices: Map<string, PriceSimulator> = new Map();
  private readonly orders: Map<string, Order> = new Map();
  private readonly balances: Map<string, Balance> = new Map();
  private readonly ohlcvHistory: Map<string, OHLCV[]> = new Map();

  constructor(config: ExchangeConfig) {
    super(config);
    this.initializeBalances();
    this.initializePrices();
  }

  get name(): string {
    return 'mock';
  }

  private initializeBalances(): void {
    // Start with $10,000 USDT and 0.1 BTC for testing
    this.balances.set('USDT', { currency: 'USDT', free: 10000, used: 0, total: 10000 });
    this.balances.set('BTC', { currency: 'BTC', free: 0.1, used: 0, total: 0.1 });
    this.balances.set('ETH', { currency: 'ETH', free: 1.0, used: 0, total: 1.0 });
  }

  private initializePrices(): void {
    this.prices.set('BTC/USDT', { currentPrice: 45000, volatility: 0.002, trend: 0.0001 });
    this.prices.set('ETH/USDT', { currentPrice: 2500, volatility: 0.003, trend: 0.0001 });
    this.prices.set('SOL/USDT', { currentPrice: 100, volatility: 0.005, trend: 0.0002 });
  }

  private simulatePrice(symbol: string): number {
    let sim = this.prices.get(symbol);
    if (!sim) {
      sim = { currentPrice: 100, volatility: 0.005, trend: 0 };
      this.prices.set(symbol, sim);
    }

    // Random walk with slight trend
    const change = (Math.random() - 0.5) * 2 * sim.volatility + sim.trend;
    sim.currentPrice = sim.currentPrice * (1 + change);
    return sim.currentPrice;
  }

  async connect(): Promise<void> {
    logger.info('[MockExchange] Connecting to mock exchange...');
    await new Promise((r) => setTimeout(r, 100)); // Simulate connection delay
    this.connected = true;
    logger.info('[MockExchange] Connected. Paper trading mode active.');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    logger.info('[MockExchange] Disconnected from mock exchange.');
  }

  async getTicker(symbol: string): Promise<Ticker> {
    this.assertConnected();
    const price = this.simulatePrice(symbol);
    const spread = price * 0.0001; // 0.01% spread

    return {
      symbol,
      bid: price - spread / 2,
      ask: price + spread / 2,
      last: price,
      volume: 1000 + Math.random() * 9000,
      timestamp: Date.now(),
    };
  }

  async getOHLCV(symbol: string, _timeframe: string, limit: number): Promise<OHLCV[]> {
    this.assertConnected();

    let history = this.ohlcvHistory.get(symbol) ?? [];

    // Generate historical data if needed
    while (history.length < limit) {
      const basePrice = history.length > 0
        ? history[history.length - 1].close
        : (this.prices.get(symbol)?.currentPrice ?? 45000);

      const candleCount = limit - history.length;
      const newCandles = this.generateCandles(basePrice, candleCount, 60000);
      history = [...newCandles, ...history];
    }

    this.ohlcvHistory.set(symbol, history.slice(-500)); // Keep last 500 candles
    return history.slice(-limit);
  }

  private generateCandles(startPrice: number, count: number, intervalMs: number): OHLCV[] {
    const candles: OHLCV[] = [];
    let price = startPrice;
    const now = Date.now();

    for (let i = count; i >= 1; i--) {
      const timestamp = now - i * intervalMs;
      const open = price;
      const changePercent = (Math.random() - 0.5) * 0.04; // ±2% per candle
      const close = open * (1 + changePercent);
      const high = Math.max(open, close) * (1 + Math.random() * 0.01);
      const low = Math.min(open, close) * (1 - Math.random() * 0.01);
      const volume = 10 + Math.random() * 100;

      candles.push({ timestamp, open, high, low, close, volume });
      price = close;
    }

    return candles;
  }

  async getBalances(): Promise<Map<string, Balance>> {
    this.assertConnected();
    return new Map(this.balances);
  }

  async placeOrder(request: OrderRequest): Promise<Order> {
    this.assertConnected();

    const ticker = await this.getTicker(request.symbol);
    const fillPrice = request.type === 'market'
      ? (request.side === 'buy' ? ticker.ask : ticker.bid)
      : (request.price ?? ticker.last);

    const fees = request.amount * fillPrice * 0.001; // 0.1% fee

    const order: Order = {
      id: generateId(),
      clientOrderId: request.clientOrderId,
      symbol: request.symbol,
      side: request.side,
      type: request.type,
      amount: request.amount,
      price: request.price,
      stopPrice: request.stopPrice,
      status: 'filled' as OrderStatus,
      filledAmount: request.amount,
      remainingAmount: 0,
      avgFillPrice: fillPrice,
      fees,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.orders.set(order.id, order);
    this.updateBalancesForOrder(order, fillPrice);

    logger.info(`[MockExchange] Order filled: ${order.side.toUpperCase()} ${order.amount} ${order.symbol} @ ${fillPrice.toFixed(2)}`);

    return order;
  }

  private updateBalancesForOrder(order: Order, fillPrice: number): void {
    const [base, quote] = order.symbol.split('/');
    const cost = order.filledAmount * fillPrice;
    const fees = order.fees;

    if (order.side === 'buy') {
      // Deduct quote currency, add base currency
      const quoteBalance = this.balances.get(quote);
      const baseBalance = this.balances.get(base) ?? { currency: base, free: 0, used: 0, total: 0 };

      if (quoteBalance) {
        quoteBalance.free = Math.max(0, quoteBalance.free - cost - fees);
        quoteBalance.total = quoteBalance.free + quoteBalance.used;
      }

      baseBalance.free += order.filledAmount;
      baseBalance.total = baseBalance.free + baseBalance.used;
      this.balances.set(base, baseBalance);
    } else {
      // Deduct base currency, add quote currency
      const baseBalance = this.balances.get(base);
      const quoteBalance = this.balances.get(quote) ?? { currency: quote, free: 0, used: 0, total: 0 };

      if (baseBalance) {
        baseBalance.free = Math.max(0, baseBalance.free - order.filledAmount);
        baseBalance.total = baseBalance.free + baseBalance.used;
      }

      quoteBalance.free += cost - fees;
      quoteBalance.total = quoteBalance.free + quoteBalance.used;
      this.balances.set(quote, quoteBalance);
    }
  }

  async cancelOrder(orderId: string, _symbol: string): Promise<boolean> {
    this.assertConnected();
    const order = this.orders.get(orderId);
    if (!order || order.status === 'filled') return false;

    order.status = 'cancelled';
    order.updatedAt = Date.now();
    return true;
  }

  async getOrder(orderId: string, _symbol: string): Promise<Order> {
    this.assertConnected();
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }
    return { ...order };
  }

  async getOpenOrders(symbol: string): Promise<Order[]> {
    this.assertConnected();
    return Array.from(this.orders.values())
      .filter((o) => o.symbol === symbol && (o.status === 'open' || o.status === 'pending'));
  }

  async isHealthy(): Promise<boolean> {
    return this.connected;
  }

  private assertConnected(): void {
    if (!this.connected) {
      throw new Error('Exchange not connected. Call connect() first.');
    }
  }
}
