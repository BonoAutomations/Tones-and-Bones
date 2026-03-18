import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  Ticker, OHLCV, Order, OrderRequest, Balance, ExchangeConfig,
  OrderStatus, OrderSide,
} from '../types';
import { BaseExchange } from './base';
import { withRetry, isRetryableError } from '../utils/retry';
import { RateLimiter } from '../utils/rate-limiter';
import logger from '../utils/logger';

const COINBASE_BASE_URL = 'https://api.coinbase.com';

/**
 * Coinbase Advanced Trade API adapter.
 *
 * Authentication: Coinbase uses JWT (ES256) signed with your CDP API key.
 * Get keys at: https://www.coinbase.com/settings/api
 *   - apiKey   → the "key name"  (e.g. "organizations/xxx/apiKeys/yyy")
 *   - apiSecret → the EC private key in PEM format
 *
 * Symbols: Coinbase uses hyphens, e.g. "BTC-USDT" not "BTC/USDT".
 * This adapter converts automatically.
 */
export class CoinbaseExchange extends BaseExchange {
  private client: AxiosInstance | null = null;
  private readonly rateLimiter: RateLimiter;

  constructor(config: ExchangeConfig) {
    super(config);
    // Coinbase allows ~30 req/s on most private endpoints
    this.rateLimiter = new RateLimiter(15, 30);
  }

  get name(): string {
    return 'coinbase';
  }

  async connect(): Promise<void> {
    this.client = axios.create({
      baseURL: COINBASE_BASE_URL,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });

    // Validate credentials by fetching accounts
    if (this.config.apiKey && this.config.apiSecret) {
      try {
        await this.getBalances();
        logger.info('[CoinbaseExchange] Connected and authenticated successfully');
      } catch (err) {
        throw new Error(`Coinbase auth failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      logger.info('[CoinbaseExchange] Connected (no API keys — public endpoints only)');
    }
  }

  async disconnect(): Promise<void> {
    this.client = null;
    logger.info('[CoinbaseExchange] Disconnected');
  }

  /**
   * Build a signed JWT for Coinbase Advanced Trade API.
   * Coinbase uses ES256 (ECDSA with P-256) or HS256 depending on key type.
   * Legacy API keys use HMAC-SHA256 — we detect and handle both.
   */
  private buildAuthHeader(method: string, path: string): string {
    const keyName = this.config.apiKey ?? '';
    const secret = this.config.apiSecret ?? '';

    // Check if the secret looks like a PEM EC key (CDP API keys)
    if (secret.includes('EC PRIVATE KEY') || secret.includes('PRIVATE KEY')) {
      const now = Math.floor(Date.now() / 1000);
      const token = jwt.sign(
        {
          sub: keyName,
          iss: 'coinbase-cloud',
          nbf: now,
          exp: now + 120,
          uri: `${method} api.coinbase.com${path}`,
        },
        secret,
        { algorithm: 'ES256', keyid: keyName, jwtid: crypto.randomBytes(16).toString('hex') }
      );
      return `Bearer ${token}`;
    }

    // Legacy HMAC API key (older Coinbase Pro / Advanced Trade keys)
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const message = timestamp + method.toUpperCase() + path;
    const signature = crypto.createHmac('sha256', secret).update(message).digest('hex');
    // For legacy keys we set headers differently — return composite string
    return `CB-ACCESS-KEY ${keyName} CB-ACCESS-SIGN ${signature} CB-ACCESS-TIMESTAMP ${timestamp}`;
  }

  private async request<T>(
    method: 'get' | 'post' | 'delete',
    path: string,
    data?: unknown
  ): Promise<T> {
    this.assertConnected();
    await this.rateLimiter.acquire();

    const authHeader = this.buildAuthHeader(method.toUpperCase(), path);
    const isLegacy = authHeader.startsWith('CB-ACCESS-KEY');

    const headers: Record<string, string> = isLegacy
      ? {
          'CB-ACCESS-KEY': this.config.apiKey ?? '',
          'CB-ACCESS-SIGN': authHeader.split('CB-ACCESS-SIGN ')[1].split(' ')[0],
          'CB-ACCESS-TIMESTAMP': authHeader.split('CB-ACCESS-TIMESTAMP ')[1],
        }
      : { Authorization: authHeader };

    return withRetry(
      async () => {
        const response = await this.client!.request({
          method,
          url: path,
          headers,
          data,
        });
        return response.data as T;
      },
      { maxAttempts: 3, delayMs: 1000, shouldRetry: isRetryableError }
    );
  }

  /** Convert "BTC/USDT" → "BTC-USDC" (Coinbase uses USDC not USDT primarily) */
  private toProductId(symbol: string): string {
    return symbol.replace('/', '-').replace('USDT', 'USDC');
  }

  async getTicker(symbol: string): Promise<Ticker> {
    this.assertConnected();
    await this.rateLimiter.acquire();

    const productId = this.toProductId(symbol);
    const data = await withRetry(
      () => this.client!.get(`/api/v3/brokerage/best_bid_ask?product_ids=${productId}`),
      { maxAttempts: 3, delayMs: 500, shouldRetry: isRetryableError }
    );

    const pricebook = data.data?.pricebooks?.[0];
    if (!pricebook) throw new Error(`No ticker data for ${symbol}`);

    const bid = parseFloat(pricebook.bids?.[0]?.price ?? '0');
    const ask = parseFloat(pricebook.asks?.[0]?.price ?? '0');

    return {
      symbol,
      bid,
      ask,
      last: (bid + ask) / 2,
      volume: 0,
      timestamp: Date.now(),
    };
  }

  async getOHLCV(symbol: string, timeframe: string, limit: number): Promise<OHLCV[]> {
    this.assertConnected();
    await this.rateLimiter.acquire();

    const productId = this.toProductId(symbol);
    const granularity = this.mapTimeframe(timeframe);
    const end = Math.floor(Date.now() / 1000);
    const start = end - limit * granularity;

    const data = await withRetry(
      () => this.client!.get(`/api/v3/brokerage/products/${productId}/candles`, {
        params: { start, end, granularity: this.mapTimeframeName(timeframe) },
      }),
      { maxAttempts: 3, delayMs: 500, shouldRetry: isRetryableError }
    );

    const candles: Array<{ start: string; low: string; high: string; open: string; close: string; volume: string }> =
      data.data?.candles ?? [];

    return candles
      .map((c) => ({
        timestamp: parseInt(c.start) * 1000,
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
        volume: parseFloat(c.volume),
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-limit);
  }

  async getBalances(): Promise<Map<string, Balance>> {
    const data = await this.request<{ accounts: Array<{ currency: string; available_balance: { value: string }; hold: { value: string } }> }>(
      'get',
      '/api/v3/brokerage/accounts'
    );

    const balances = new Map<string, Balance>();
    for (const account of data.accounts ?? []) {
      const free = parseFloat(account.available_balance?.value ?? '0');
      const used = parseFloat(account.hold?.value ?? '0');
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
    const productId = this.toProductId(request.symbol);
    const clientOrderId = request.clientOrderId ?? `bot-${Date.now()}`;

    const body: Record<string, unknown> = {
      client_order_id: clientOrderId,
      product_id: productId,
      side: request.side === 'buy' ? 'BUY' : 'SELL',
    };

    if (request.type === 'market') {
      if (request.side === 'buy') {
        // Coinbase market buys specify quote size (USD amount)
        body.order_configuration = {
          market_market_ioc: { quote_size: String(request.amount * (request.price ?? 1)) },
        };
      } else {
        body.order_configuration = {
          market_market_ioc: { base_size: String(request.amount) },
        };
      }
    } else if (request.type === 'limit') {
      body.order_configuration = {
        limit_limit_gtc: {
          base_size: String(request.amount),
          limit_price: String(request.price),
          post_only: false,
        },
      };
    }

    const data = await this.request<{ success: boolean; order_id?: string; success_response?: { order_id: string }; error_response?: { message: string } }>(
      'post',
      '/api/v3/brokerage/orders',
      body
    );

    if (!data.success) {
      throw new Error(`Coinbase order failed: ${data.error_response?.message ?? 'Unknown error'}`);
    }

    const orderId = data.success_response?.order_id ?? data.order_id ?? clientOrderId;
    return this.getOrder(orderId, request.symbol);
  }

  async cancelOrder(orderId: string, _symbol: string): Promise<boolean> {
    try {
      const data = await this.request<{ results: Array<{ success: boolean }> }>(
        'post',
        '/api/v3/brokerage/orders/batch_cancel',
        { order_ids: [orderId] }
      );
      return data.results?.[0]?.success ?? false;
    } catch {
      return false;
    }
  }

  async getOrder(orderId: string, symbol: string): Promise<Order> {
    const data = await this.request<{ order: Record<string, unknown> }>(
      'get',
      `/api/v3/brokerage/orders/historical/${orderId}`
    );
    return this.mapOrder(data.order, symbol);
  }

  async getOpenOrders(symbol: string): Promise<Order[]> {
    const productId = this.toProductId(symbol);
    const data = await this.request<{ orders: Record<string, unknown>[] }>(
      'get',
      `/api/v3/brokerage/orders/historical/batch?product_id=${productId}&order_status=OPEN`
    );
    return (data.orders ?? []).map((o) => this.mapOrder(o, symbol));
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.client!.get('/api/v3/brokerage/products?limit=1');
      return true;
    } catch {
      return false;
    }
  }

  private mapOrder(data: Record<string, unknown>, symbol: string): Order {
    const status = this.mapStatus(String(data.status ?? 'OPEN'));
    const filled = parseFloat(String(data.filled_size ?? '0'));
    const size = parseFloat(String(data.base_size ?? '0'));
    const avgPrice = parseFloat(String(data.average_filled_price ?? data.filled_value ?? '0'));

    return {
      id: String(data.order_id ?? data.id ?? ''),
      clientOrderId: String(data.client_order_id ?? ''),
      symbol,
      side: String(data.side ?? 'BUY').toLowerCase() === 'buy' ? 'buy' as OrderSide : 'sell' as OrderSide,
      type: 'market',
      amount: size,
      price: data.limit_price ? parseFloat(String(data.limit_price)) : undefined,
      status,
      filledAmount: filled,
      remainingAmount: Math.max(0, size - filled),
      avgFillPrice: avgPrice,
      fees: parseFloat(String(data.total_fees ?? '0')),
      createdAt: data.created_time ? new Date(String(data.created_time)).getTime() : Date.now(),
      updatedAt: Date.now(),
    };
  }

  private mapStatus(s: string): OrderStatus {
    const map: Record<string, OrderStatus> = {
      OPEN: 'open', FILLED: 'filled', CANCELLED: 'cancelled',
      EXPIRED: 'expired', FAILED: 'rejected', PENDING: 'pending',
    };
    return map[s.toUpperCase()] ?? 'open';
  }

  private mapTimeframe(tf: string): number {
    const map: Record<string, number> = {
      '1m': 60, '5m': 300, '15m': 900, '30m': 1800,
      '1h': 3600, '2h': 7200, '6h': 21600, '1d': 86400,
    };
    return map[tf] ?? 60;
  }

  private mapTimeframeName(tf: string): string {
    const map: Record<string, string> = {
      '1m': 'ONE_MINUTE', '5m': 'FIVE_MINUTE', '15m': 'FIFTEEN_MINUTE',
      '30m': 'THIRTY_MINUTE', '1h': 'ONE_HOUR', '2h': 'TWO_HOUR',
      '6h': 'SIX_HOUR', '1d': 'ONE_DAY',
    };
    return map[tf] ?? 'ONE_MINUTE';
  }

  private assertConnected(): void {
    if (!this.client) throw new Error('Exchange not connected. Call connect() first.');
  }
}
