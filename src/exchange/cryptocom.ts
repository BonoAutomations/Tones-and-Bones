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

const CRYPTOCOM_BASE_URL = 'https://api.crypto.com/exchange/v1';

/**
 * Crypto.com Exchange API adapter (v1).
 *
 * Authentication: HMAC-SHA256 signature.
 * Get keys at: https://crypto.com/exchange/settings/api-key
 *
 * Symbols: Crypto.com uses underscores, e.g. "BTC_USDT" not "BTC/USDT".
 * This adapter converts automatically.
 */
export class CryptoComExchange extends BaseExchange {
  private client: AxiosInstance | null = null;
  private readonly rateLimiter: RateLimiter;

  constructor(config: ExchangeConfig) {
    super(config);
    // Crypto.com: 15 req per 100ms on order endpoints, conservative overall
    this.rateLimiter = new RateLimiter(10, 20);
  }

  get name(): string {
    return 'cryptocom';
  }

  async connect(): Promise<void> {
    this.client = axios.create({
      baseURL: CRYPTOCOM_BASE_URL,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });

    if (this.config.apiKey && this.config.apiSecret) {
      try {
        await this.getBalances();
        logger.info('[CryptoComExchange] Connected and authenticated successfully');
      } catch (err) {
        throw new Error(`Crypto.com auth failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      logger.info('[CryptoComExchange] Connected (public endpoints only)');
    }
  }

  async disconnect(): Promise<void> {
    this.client = null;
    logger.info('[CryptoComExchange] Disconnected');
  }

  /** Convert "BTC/USDT" → "BTC_USDT" */
  private toInstrumentName(symbol: string): string {
    return symbol.replace('/', '_');
  }

  /**
   * Sign a private request with HMAC-SHA256.
   * Crypto.com signature = HMAC-SHA256(method + id + apiKey + params_string + nonce)
   */
  private sign(
    method: string,
    id: number,
    params: Record<string, unknown>
  ): string {
    const paramsString = Object.keys(params)
      .sort()
      .map((k) => `${k}${params[k]}`)
      .join('');

    const sigPayload = `${method}${id}${this.config.apiKey ?? ''}${paramsString}${id}`;
    return crypto
      .createHmac('sha256', this.config.apiSecret ?? '')
      .update(sigPayload)
      .digest('hex');
  }

  private async publicRequest<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    this.assertConnected();
    await this.rateLimiter.acquire();

    return withRetry(
      async () => {
        const response = await this.client!.post('/public/' + method, {
          id: Date.now(),
          method: `public/${method}`,
          params,
          nonce: Date.now(),
        });
        if (response.data.code !== 0) {
          throw new Error(`Crypto.com API error ${response.data.code}: ${response.data.message}`);
        }
        return response.data.result as T;
      },
      { maxAttempts: 3, delayMs: 500, shouldRetry: isRetryableError }
    );
  }

  private async privateRequest<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    this.assertConnected();
    await this.rateLimiter.acquire();

    const id = Date.now();
    const nonce = id;
    const signature = this.sign(method, id, params);

    return withRetry(
      async () => {
        const response = await this.client!.post('/private/' + method, {
          id,
          method: `private/${method}`,
          api_key: this.config.apiKey,
          params,
          nonce,
          sig: signature,
        });
        if (response.data.code !== 0) {
          throw new Error(`Crypto.com API error ${response.data.code}: ${response.data.message ?? 'Unknown'}`);
        }
        return response.data.result as T;
      },
      { maxAttempts: 3, delayMs: 1000, shouldRetry: isRetryableError }
    );
  }

  async getTicker(symbol: string): Promise<Ticker> {
    const instrumentName = this.toInstrumentName(symbol);
    const data = await this.publicRequest<{ data: Array<{ b: string; k: string; a: string; v: string; t: number }> }>(
      'get-ticker',
      { instrument_name: instrumentName }
    );

    const ticker = data.data?.[0];
    if (!ticker) throw new Error(`No ticker data for ${symbol}`);

    const bid = parseFloat(ticker.b ?? '0');
    const ask = parseFloat(ticker.k ?? '0');
    const last = parseFloat(ticker.a ?? '0');

    return {
      symbol,
      bid,
      ask,
      last: last || (bid + ask) / 2,
      volume: parseFloat(ticker.v ?? '0'),
      timestamp: ticker.t ?? Date.now(),
    };
  }

  async getOHLCV(symbol: string, timeframe: string, limit: number): Promise<OHLCV[]> {
    const instrumentName = this.toInstrumentName(symbol);
    const period = this.mapTimeframe(timeframe);

    const data = await this.publicRequest<{ data: Array<{ t: number; o: string; h: string; l: string; c: string; v: string }> }>(
      'get-candlestick',
      { instrument_name: instrumentName, timeframe: period, count: limit }
    );

    return (data.data ?? [])
      .map((c) => ({
        timestamp: c.t,
        open: parseFloat(c.o),
        high: parseFloat(c.h),
        low: parseFloat(c.l),
        close: parseFloat(c.c),
        volume: parseFloat(c.v),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async getBalances(): Promise<Map<string, Balance>> {
    const data = await this.privateRequest<{ accounts: Array<{ currency: string; available: string; order: string; stake: string }> }>(
      'get-account-summary'
    );

    const balances = new Map<string, Balance>();
    for (const account of data.accounts ?? []) {
      const free = parseFloat(account.available ?? '0');
      const used = parseFloat(account.order ?? '0');
      if (free > 0 || used > 0) {
        balances.set(account.currency, {
          currency: account.currency,
          free,
          used,
          total: free + used,
        });
      }
    }
    return balances;
  }

  async placeOrder(request: OrderRequest): Promise<Order> {
    const instrumentName = this.toInstrumentName(request.symbol);

    const params: Record<string, unknown> = {
      instrument_name: instrumentName,
      side: request.side.toUpperCase(),
      type: this.mapOrderType(request.type),
      quantity: String(request.amount),
      client_oid: request.clientOrderId ?? `bot-${Date.now()}`,
    };

    if (request.price !== undefined) {
      params.price = String(request.price);
    }

    if (request.stopPrice !== undefined) {
      params.ref_price = String(request.stopPrice);
    }

    const data = await this.privateRequest<{ order_id: string }>(
      'create-order',
      params
    );

    const orderId = data.order_id;
    logger.info(`[CryptoComExchange] Order created: ${orderId}`);

    // Fetch the order to get full details
    return this.getOrder(orderId, request.symbol);
  }

  async cancelOrder(orderId: string, symbol: string): Promise<boolean> {
    try {
      await this.privateRequest('cancel-order', {
        instrument_name: this.toInstrumentName(symbol),
        order_id: orderId,
      });
      return true;
    } catch {
      return false;
    }
  }

  async getOrder(orderId: string, symbol: string): Promise<Order> {
    const data = await this.privateRequest<{ order_info: Record<string, unknown> }>(
      'get-order-detail',
      { order_id: orderId }
    );
    return this.mapOrder(data.order_info, symbol);
  }

  async getOpenOrders(symbol: string): Promise<Order[]> {
    const data = await this.privateRequest<{ order_list: Record<string, unknown>[] }>(
      'get-open-orders',
      { instrument_name: this.toInstrumentName(symbol) }
    );
    return (data.order_list ?? []).map((o) => this.mapOrder(o, symbol));
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.client!.get('/public/auth');
      return true;
    } catch {
      // Check connectivity by fetching any public endpoint
      try {
        await this.client!.post('/public/get-ticker', {
          id: 1, method: 'public/get-ticker', params: { instrument_name: 'BTC_USDT' }, nonce: 1,
        });
        return true;
      } catch {
        return false;
      }
    }
  }

  private mapOrder(data: Record<string, unknown>, symbol: string): Order {
    const status = this.mapStatus(String(data.status ?? 'ACTIVE'));
    const amount = parseFloat(String(data.quantity ?? '0'));
    const filled = parseFloat(String(data.cumulative_quantity ?? '0'));
    const avgPrice = parseFloat(String(data.avg_price ?? data.price ?? '0'));

    return {
      id: String(data.order_id ?? ''),
      clientOrderId: String(data.client_oid ?? ''),
      symbol,
      side: String(data.side ?? 'BUY').toLowerCase() === 'buy' ? 'buy' as OrderSide : 'sell' as OrderSide,
      type: 'market',
      amount,
      price: data.price ? parseFloat(String(data.price)) : undefined,
      status,
      filledAmount: filled,
      remainingAmount: Math.max(0, amount - filled),
      avgFillPrice: avgPrice,
      fees: parseFloat(String(data.fee_applied ?? '0')),
      createdAt: Number(data.create_time ?? Date.now()),
      updatedAt: Number(data.update_time ?? Date.now()),
    };
  }

  private mapStatus(s: string): OrderStatus {
    const map: Record<string, OrderStatus> = {
      ACTIVE: 'open', FILLED: 'filled', CANCELED: 'cancelled',
      REJECTED: 'rejected', EXPIRED: 'expired', PENDING: 'pending',
      PARTIALLY_FILLED: 'partially_filled',
    };
    return map[s.toUpperCase()] ?? 'open';
  }

  private mapOrderType(type: string): string {
    const map: Record<string, string> = {
      market: 'MARKET', limit: 'LIMIT',
      stop_loss: 'STOP_LOSS', take_profit: 'TAKE_PROFIT',
    };
    return map[type] ?? 'MARKET';
  }

  private mapTimeframe(tf: string): string {
    const map: Record<string, string> = {
      '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m',
      '30m': '30m', '1h': '1h', '2h': '2h', '4h': '4h',
      '6h': '6h', '12h': '12h', '1d': '1D', '1w': '1W',
    };
    return map[tf] ?? '1m';
  }

  private assertConnected(): void {
    if (!this.client) throw new Error('Exchange not connected. Call connect() first.');
  }
}
