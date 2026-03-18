import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import {
  Ticker, OHLCV, Order, OrderRequest, Balance, ExchangeConfig,
  OrderStatus, OrderSide,
} from '../types';
import { BaseExchange } from './base';
import { withRetry, isRetryableError } from '../utils/retry';
import { RateLimiter } from '../utils/rate-limiter';
import logger from '../utils/logger';

const BINANCE_BASE_URL = 'https://api.binance.com';
const BINANCE_TESTNET_URL = 'https://testnet.binance.vision';

/**
 * Binance exchange adapter.
 * Supports both mainnet and testnet.
 */
export class BinanceExchange extends BaseExchange {
  private client: AxiosInstance | null = null;
  private readonly rateLimiter: RateLimiter;
  private serverTimeOffset = 0;

  constructor(config: ExchangeConfig) {
    super(config);
    // Binance allows 1200 requests/minute = 20/second
    this.rateLimiter = new RateLimiter(10, 20); // Conservative: 10/s, burst 20
  }

  get name(): string {
    return 'binance';
  }

  async connect(): Promise<void> {
    const baseURL = this.config.testnet ? BINANCE_TESTNET_URL : BINANCE_BASE_URL;

    this.client = axios.create({
      baseURL,
      timeout: 10000,
      headers: {
        'X-MBX-APIKEY': this.config.apiKey ?? '',
        'Content-Type': 'application/json',
      },
    });

    // Sync server time to avoid signature issues
    await this.syncServerTime();
    logger.info(`[BinanceExchange] Connected to ${this.config.testnet ? 'TESTNET' : 'MAINNET'}`);
  }

  async disconnect(): Promise<void> {
    this.client = null;
    logger.info('[BinanceExchange] Disconnected');
  }

  private async syncServerTime(): Promise<void> {
    try {
      const response = await this.client!.get('/api/v3/time');
      const serverTime: number = response.data.serverTime;
      this.serverTimeOffset = serverTime - Date.now();
      logger.debug(`[BinanceExchange] Server time offset: ${this.serverTimeOffset}ms`);
    } catch {
      logger.warn('[BinanceExchange] Failed to sync server time, using local time');
    }
  }

  private getTimestamp(): number {
    return Date.now() + this.serverTimeOffset;
  }

  private sign(params: Record<string, string | number>): string {
    const queryString = Object.entries(params)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    return crypto
      .createHmac('sha256', this.config.apiSecret ?? '')
      .update(queryString)
      .digest('hex');
  }

  private async signedRequest<T>(
    method: 'get' | 'post' | 'delete',
    endpoint: string,
    params: Record<string, string | number> = {}
  ): Promise<T> {
    this.assertConnected();
    await this.rateLimiter.acquire();

    const timestamp = this.getTimestamp();
    const allParams = { ...params, timestamp };
    const signature = this.sign(allParams);
    const finalParams = { ...allParams, signature };

    return withRetry(
      async () => {
        const response = method === 'get' || method === 'delete'
          ? await this.client![method](endpoint, { params: finalParams })
          : await this.client![method](endpoint, null, { params: finalParams });
        return response.data as T;
      },
      {
        maxAttempts: 3,
        delayMs: 1000,
        shouldRetry: isRetryableError,
      }
    );
  }

  async getTicker(symbol: string): Promise<Ticker> {
    this.assertConnected();
    await this.rateLimiter.acquire();

    const binanceSymbol = symbol.replace('/', '');
    const data = await withRetry(
      () => this.client!.get('/api/v3/ticker/bookTicker', { params: { symbol: binanceSymbol } }),
      { maxAttempts: 3, delayMs: 500, shouldRetry: isRetryableError }
    );

    const tickerData = data.data;
    return {
      symbol,
      bid: parseFloat(tickerData.bidPrice),
      ask: parseFloat(tickerData.askPrice),
      last: (parseFloat(tickerData.bidPrice) + parseFloat(tickerData.askPrice)) / 2,
      volume: 0, // Requires separate call
      timestamp: Date.now(),
    };
  }

  async getOHLCV(symbol: string, timeframe: string, limit: number): Promise<OHLCV[]> {
    this.assertConnected();
    await this.rateLimiter.acquire();

    const binanceSymbol = symbol.replace('/', '');
    const response = await withRetry(
      () => this.client!.get('/api/v3/klines', {
        params: { symbol: binanceSymbol, interval: timeframe, limit },
      }),
      { maxAttempts: 3, delayMs: 500, shouldRetry: isRetryableError }
    );

    return response.data.map((candle: string[]) => ({
      timestamp: parseInt(candle[0]),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
    }));
  }

  async getBalances(): Promise<Map<string, Balance>> {
    const data = await this.signedRequest<{ balances: Array<{ asset: string; free: string; locked: string }> }>(
      'get',
      '/api/v3/account'
    );

    const balances = new Map<string, Balance>();
    for (const b of data.balances) {
      const free = parseFloat(b.free);
      const used = parseFloat(b.locked);
      if (free > 0 || used > 0) {
        balances.set(b.asset, {
          currency: b.asset,
          free,
          used,
          total: free + used,
        });
      }
    }
    return balances;
  }

  async placeOrder(request: OrderRequest): Promise<Order> {
    const binanceSymbol = request.symbol.replace('/', '');
    const params: Record<string, string | number> = {
      symbol: binanceSymbol,
      side: request.side.toUpperCase(),
      type: this.mapOrderType(request.type),
      quantity: request.amount.toString(),
    };

    if (request.price !== undefined) {
      params.price = request.price.toString();
      params.timeInForce = 'GTC';
    }

    if (request.stopPrice !== undefined) {
      params.stopPrice = request.stopPrice.toString();
    }

    if (request.clientOrderId) {
      params.newClientOrderId = request.clientOrderId;
    }

    const data = await this.signedRequest<Record<string, unknown>>('post', '/api/v3/order', params);
    return this.mapOrder(data, request.symbol);
  }

  async cancelOrder(orderId: string, symbol: string): Promise<boolean> {
    const binanceSymbol = symbol.replace('/', '');
    try {
      await this.signedRequest('delete', '/api/v3/order', {
        symbol: binanceSymbol,
        orderId,
      });
      return true;
    } catch {
      return false;
    }
  }

  async getOrder(orderId: string, symbol: string): Promise<Order> {
    const binanceSymbol = symbol.replace('/', '');
    const data = await this.signedRequest<Record<string, unknown>>(
      'get',
      '/api/v3/order',
      { symbol: binanceSymbol, orderId }
    );
    return this.mapOrder(data, symbol);
  }

  async getOpenOrders(symbol: string): Promise<Order[]> {
    const binanceSymbol = symbol.replace('/', '');
    const data = await this.signedRequest<Record<string, unknown>[]>(
      'get',
      '/api/v3/openOrders',
      { symbol: binanceSymbol }
    );
    return data.map((o) => this.mapOrder(o, symbol));
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.client!.get('/api/v3/ping');
      return true;
    } catch {
      return false;
    }
  }

  private mapOrderType(type: string): string {
    const map: Record<string, string> = {
      market: 'MARKET',
      limit: 'LIMIT',
      stop_loss: 'STOP_LOSS_LIMIT',
      take_profit: 'TAKE_PROFIT_LIMIT',
    };
    return map[type] ?? 'MARKET';
  }

  private mapOrderStatus(status: string): OrderStatus {
    const map: Record<string, OrderStatus> = {
      NEW: 'open',
      PARTIALLY_FILLED: 'partially_filled',
      FILLED: 'filled',
      CANCELED: 'cancelled',
      REJECTED: 'rejected',
      EXPIRED: 'expired',
    };
    return map[status] ?? 'open';
  }

  private mapOrder(data: Record<string, unknown>, symbol: string): Order {
    const status = this.mapOrderStatus(String(data.status ?? 'NEW'));
    const amount = parseFloat(String(data.origQty ?? '0'));
    const filledAmount = parseFloat(String(data.executedQty ?? '0'));

    return {
      id: String(data.orderId ?? data.id ?? ''),
      clientOrderId: String(data.clientOrderId ?? ''),
      symbol,
      side: String(data.side ?? 'buy').toLowerCase() as OrderSide,
      type: 'market',
      amount,
      price: data.price ? parseFloat(String(data.price)) : undefined,
      stopPrice: data.stopPrice ? parseFloat(String(data.stopPrice)) : undefined,
      status,
      filledAmount,
      remainingAmount: amount - filledAmount,
      avgFillPrice: parseFloat(String(data.cummulativeQuoteQty ?? '0')) / (filledAmount || 1),
      fees: 0, // Requires separate trade history call
      createdAt: Number(data.transactTime ?? data.time ?? Date.now()),
      updatedAt: Date.now(),
    };
  }

  private assertConnected(): void {
    if (!this.client) {
      throw new Error('Exchange not connected. Call connect() first.');
    }
  }
}
