import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { ethers } from 'ethers';
import {
  Ticker, OHLCV, Order, OrderRequest, Balance, ExchangeConfig,
  OrderStatus, OrderSide,
} from '../types';
import { BaseExchange } from './base';
import { withRetry, isRetryableError } from '../utils/retry';
import { RateLimiter } from '../utils/rate-limiter';
import logger from '../utils/logger';

const CLOB_BASE_URL = 'https://clob.polymarket.com';
const GAMMA_BASE_URL = 'https://gamma-api.polymarket.com';
const POLYGON_CHAIN_ID = 137;

// EIP-712 domain for Polymarket CLOB
const EIP712_DOMAIN = {
  name: 'ClobAuthDomain',
  version: '1',
  chainId: POLYGON_CHAIN_ID,
};

/**
 * Polymarket CLOB (Central Limit Order Book) adapter.
 *
 * Polymarket is a PREDICTION MARKET — you trade YES/NO outcome tokens,
 * not spot crypto. Prices are probabilities (0.00–1.00 = 0¢–100¢).
 *
 * Examples:
 *   "Will BTC exceed $100k by June 2026?" → YES token trades at 0.42 ($0.42)
 *   If YES resolves → pays $1.00 per token
 *
 * Setup:
 *   1. Create a Polygon wallet (MetaMask or raw private key)
 *   2. Fund it with USDC on Polygon
 *   3. Set POLYMARKET_PRIVATE_KEY in your .env
 *   4. Run the bot once — it auto-derives your L2 API credentials
 *
 * Symbols: Use Polymarket condition token IDs (hex strings) as symbols,
 *   OR search markets by keyword using searchMarkets().
 *
 * Auth flow:
 *   L1 → EIP-712 sign with private key → get L2 API key/secret/passphrase
 *   L2 → HMAC-SHA256 sign each request with those credentials
 */
export class PolymarketExchange extends BaseExchange {
  private clobClient: AxiosInstance | null = null;
  private gammaClient: AxiosInstance | null = null;
  private readonly rateLimiter: RateLimiter;

  private wallet: ethers.Wallet | null = null;
  private l2Creds: { apiKey: string; secret: string; passphrase: string } | null = null;

  constructor(config: ExchangeConfig) {
    super(config);
    // Polymarket CLOB: 60 req/min public, generous private
    this.rateLimiter = new RateLimiter(5, 10);
  }

  get name(): string {
    return 'polymarket';
  }

  async connect(): Promise<void> {
    this.clobClient = axios.create({ baseURL: CLOB_BASE_URL, timeout: 15000 });
    this.gammaClient = axios.create({ baseURL: GAMMA_BASE_URL, timeout: 10000 });

    if (!this.config.apiSecret) {
      logger.info('[Polymarket] No private key — read-only mode (market data only)');
      return;
    }

    // Create wallet from private key
    this.wallet = new ethers.Wallet(this.config.apiSecret);
    logger.info(`[Polymarket] Wallet address: ${this.wallet.address}`);

    // Derive or create L2 API credentials via EIP-712 signing
    this.l2Creds = await this.deriveL2Credentials();
    logger.info('[Polymarket] L2 credentials derived. Ready to trade.');
  }

  async disconnect(): Promise<void> {
    this.clobClient = null;
    this.gammaClient = null;
    this.wallet = null;
    logger.info('[Polymarket] Disconnected');
  }

  // ─── Authentication ─────────────────────────────────────────────────────────

  /**
   * Derive L2 API credentials by signing a message with the L1 wallet.
   * This is a one-time operation per session.
   */
  private async deriveL2Credentials(): Promise<{ apiKey: string; secret: string; passphrase: string }> {
    if (!this.wallet) throw new Error('Wallet not initialized');

    const timestamp = Math.floor(Date.now() / 1000).toString();

    // Sign EIP-712 typed message for Polymarket CLOB auth
    const domain = EIP712_DOMAIN;
    const types = {
      ClobAuth: [
        { name: 'address', type: 'address' },
        { name: 'timestamp', type: 'string' },
        { name: 'nonce', type: 'uint256' },
        { name: 'message', type: 'string' },
      ],
    };
    const value = {
      address: this.wallet.address,
      timestamp,
      nonce: 0,
      message: 'This message attests that I control the given wallet',
    };

    const signature = await this.wallet.signTypedData(domain, types, value);

    const response = await withRetry(
      () => this.clobClient!.post('/auth/derive-api-key', {
        address: this.wallet!.address,
        signature,
        timestamp,
        nonce: 0,
      }),
      { maxAttempts: 3, delayMs: 1000, shouldRetry: isRetryableError }
    );

    const creds = response.data;
    return {
      apiKey: creds.apiKey ?? creds.api_key,
      secret: creds.secret,
      passphrase: creds.passphrase,
    };
  }

  /**
   * Build HMAC-SHA256 L2 auth headers for private endpoints.
   */
  private buildL2Headers(method: string, path: string, body?: string): Record<string, string> {
    if (!this.l2Creds) throw new Error('Not authenticated — call connect() first');

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const message = timestamp + method.toUpperCase() + path + (body ?? '');
    const signature = crypto
      .createHmac('sha256', this.l2Creds.secret)
      .update(message)
      .digest('base64');

    return {
      'POLY_ADDRESS': this.wallet?.address ?? '',
      'POLY_SIGNATURE': signature,
      'POLY_TIMESTAMP': timestamp,
      'POLY_API_KEY': this.l2Creds.apiKey,
      'POLY_PASSPHRASE': this.l2Creds.passphrase,
      'Content-Type': 'application/json',
    };
  }

  private async privateRequest<T>(method: 'get' | 'post' | 'delete', path: string, data?: unknown): Promise<T> {
    this.assertConnected();
    await this.rateLimiter.acquire();

    const body = data ? JSON.stringify(data) : undefined;
    const headers = this.buildL2Headers(method.toUpperCase(), path, body);

    return withRetry(
      async () => {
        const response = await this.clobClient!.request({ method, url: path, headers, data });
        return response.data as T;
      },
      { maxAttempts: 3, delayMs: 1000, shouldRetry: isRetryableError }
    );
  }

  private async publicRequest<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    this.assertConnected();
    await this.rateLimiter.acquire();

    return withRetry(
      async () => {
        const response = await this.clobClient!.get(path, { params });
        return response.data as T;
      },
      { maxAttempts: 3, delayMs: 500, shouldRetry: isRetryableError }
    );
  }

  // ─── Market Discovery ────────────────────────────────────────────────────────

  /**
   * Search for Polymarket markets by keyword.
   * Use this to find the token IDs you want to trade.
   *
   * @example
   *   const markets = await exchange.searchMarkets('bitcoin price');
   */
  async searchMarkets(query: string, limit = 10): Promise<PolymarketMarket[]> {
    this.assertConnected();
    const response = await withRetry(
      () => this.gammaClient!.get('/markets', {
        params: { q: query, limit, active: true, closed: false },
      }),
      { maxAttempts: 3, delayMs: 500, shouldRetry: isRetryableError }
    );

    const markets: PolymarketMarket[] = (response.data ?? []).map((m: Record<string, unknown>) => ({
      id: String(m.id ?? ''),
      question: String(m.question ?? ''),
      slug: String(m.slug ?? ''),
      endDate: String(m.endDate ?? ''),
      yesTokenId: String((m.clobTokenIds as string[] | undefined)?.[0] ?? ''),
      noTokenId: String((m.clobTokenIds as string[] | undefined)?.[1] ?? ''),
      yesPrice: parseFloat(String((m.outcomePrices as string[] | undefined)?.[0] ?? '0.5')),
      noPrice: parseFloat(String((m.outcomePrices as string[] | undefined)?.[1] ?? '0.5')),
      volume: parseFloat(String(m.volume ?? '0')),
      liquidity: parseFloat(String(m.liquidity ?? '0')),
      active: Boolean(m.active),
    }));

    logger.info(`[Polymarket] Found ${markets.length} markets for "${query}"`);
    return markets;
  }

  /**
   * Get the current orderbook for a token (YES or NO side of a market).
   * @param tokenId - The condition token ID (from searchMarkets)
   */
  async getOrderbook(tokenId: string): Promise<{ bids: [number, number][]; asks: [number, number][] }> {
    const data = await this.publicRequest<{ bids: Array<{ price: string; size: string }>; asks: Array<{ price: string; size: string }> }>(
      '/book',
      { token_id: tokenId }
    );

    return {
      bids: (data.bids ?? []).map((b) => [parseFloat(b.price), parseFloat(b.size)] as [number, number]),
      asks: (data.asks ?? []).map((a) => [parseFloat(a.price), parseFloat(a.size)] as [number, number]),
    };
  }

  // ─── BaseExchange Implementation ─────────────────────────────────────────────

  /**
   * Get current price for a token ID.
   * Symbol = condition token ID (e.g. "0x1234...abcd")
   * Price = implied probability (0.00–1.00)
   */
  async getTicker(symbol: string): Promise<Ticker> {
    const data = await this.publicRequest<{ price: string; timestamp?: number }>(
      '/price',
      { token_id: symbol, side: 'buy' }
    );

    const price = parseFloat(data.price ?? '0.5');

    // Also get best bid/ask from midpoint
    const midData = await this.publicRequest<{ mid: string }>(
      '/midpoint',
      { token_id: symbol }
    );
    const mid = parseFloat(midData.mid ?? String(price));

    return {
      symbol,
      bid: mid - 0.005,
      ask: mid + 0.005,
      last: mid,
      volume: 0,
      timestamp: data.timestamp ?? Date.now(),
    };
  }

  /**
   * Get price history for a token (probability over time).
   */
  async getOHLCV(symbol: string, _timeframe: string, limit: number): Promise<OHLCV[]> {
    const data = await this.publicRequest<Array<{ t: number; p: string }>>(
      '/prices-history',
      { market: symbol, interval: '1h', fidelity: 60 }
    );

    return (data ?? [])
      .slice(-limit)
      .map((point) => {
        const price = parseFloat(point.p);
        return {
          timestamp: point.t * 1000,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 0,
        };
      });
  }

  /**
   * Get USDC balance on Polygon.
   */
  async getBalances(): Promise<Map<string, Balance>> {
    const data = await this.privateRequest<Array<{ asset: string; balance: string }>>(
      'get',
      '/balance'
    );

    const balances = new Map<string, Balance>();
    for (const item of data ?? []) {
      const total = parseFloat(item.balance ?? '0');
      balances.set(item.asset, {
        currency: item.asset,
        free: total,
        used: 0,
        total,
      });
    }

    // Ensure USDC always shown
    if (!balances.has('USDC')) {
      balances.set('USDC', { currency: 'USDC', free: 0, used: 0, total: 0 });
    }

    return balances;
  }

  /**
   * Place a prediction market order.
   *
   * For Polymarket:
   *   - symbol   = condition token ID
   *   - side     = 'buy' (buy YES tokens) or 'sell' (sell/short YES tokens)
   *   - amount   = number of shares (tokens)
   *   - price    = limit price as probability (0.01–0.99), e.g. 0.65 = 65¢
   *
   * Orders must be SIGNED with the wallet private key.
   */
  async placeOrder(request: OrderRequest): Promise<Order> {
    if (!this.wallet || !this.l2Creds) {
      throw new Error('Polymarket requires a private key for trading. Set POLYMARKET_PRIVATE_KEY.');
    }

    const price = request.price ?? 0.5;
    const size = request.amount;

    // Build and sign the order struct (EIP-712)
    const orderData = await this.buildSignedOrder(
      request.symbol,
      request.side,
      price,
      size,
      request.type === 'market' ? 'FOK' : 'GTC'
    );

    const data = await this.privateRequest<{ orderID: string; status: string }>(
      'post',
      '/order',
      orderData
    );

    const orderId = data.orderID ?? `pm-${Date.now()}`;

    return {
      id: orderId,
      clientOrderId: request.clientOrderId,
      symbol: request.symbol,
      side: request.side,
      type: request.type,
      amount: size,
      price,
      status: this.mapStatus(data.status ?? 'matched'),
      filledAmount: size,
      remainingAmount: 0,
      avgFillPrice: price,
      fees: size * price * 0.001,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Build EIP-712 signed order for Polymarket CLOB.
   */
  private async buildSignedOrder(
    tokenId: string,
    side: OrderSide,
    price: number,
    size: number,
    timeInForce: 'GTC' | 'FOK' | 'GTD'
  ): Promise<Record<string, unknown>> {
    const maker = this.wallet!.address;
    const timestamp = Math.floor(Date.now() / 1000);
    const salt = BigInt(crypto.randomBytes(32).toString('hex').slice(0, 16));

    const orderStruct = {
      salt: salt.toString(),
      maker,
      signer: maker,
      taker: '0x0000000000000000000000000000000000000000',
      tokenId,
      makerAmount: Math.round(size * price * 1e6).toString(),  // USDC has 6 decimals
      takerAmount: Math.round(size * 1e6).toString(),
      expiration: (timestamp + 3600).toString(),
      nonce: '0',
      feeRateBps: '0',
      side: side === 'buy' ? 0 : 1,
      signatureType: 0,
    };

    const domain = {
      ...EIP712_DOMAIN,
      verifyingContract: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E', // Polymarket CTF Exchange
    };

    const types = {
      Order: [
        { name: 'salt', type: 'uint256' },
        { name: 'maker', type: 'address' },
        { name: 'signer', type: 'address' },
        { name: 'taker', type: 'address' },
        { name: 'tokenId', type: 'uint256' },
        { name: 'makerAmount', type: 'uint256' },
        { name: 'takerAmount', type: 'uint256' },
        { name: 'expiration', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'feeRateBps', type: 'uint256' },
        { name: 'side', type: 'uint8' },
        { name: 'signatureType', type: 'uint8' },
      ],
    };

    const signature = await this.wallet!.signTypedData(domain, types, orderStruct);

    return {
      ...orderStruct,
      signature,
      orderType: timeInForce,
    };
  }

  async cancelOrder(orderId: string, _symbol: string): Promise<boolean> {
    try {
      await this.privateRequest('delete', `/order/${orderId}`);
      return true;
    } catch {
      return false;
    }
  }

  async getOrder(orderId: string, symbol: string): Promise<Order> {
    const data = await this.privateRequest<Record<string, unknown>>('get', `/order/${orderId}`);
    return this.mapOrder(data, symbol);
  }

  async getOpenOrders(symbol: string): Promise<Order[]> {
    const data = await this.privateRequest<Record<string, unknown>[]>('get', '/orders', { market: symbol, status: 'LIVE' });
    return (data ?? []).map((o) => this.mapOrder(o, symbol));
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.clobClient!.get('/');
      return true;
    } catch {
      return false;
    }
  }

  private mapOrder(data: Record<string, unknown>, symbol: string): Order {
    const status = this.mapStatus(String(data.status ?? 'LIVE'));
    const size = parseFloat(String(data.size ?? data.original_size ?? '0'));
    const filled = parseFloat(String(data.size_matched ?? '0'));

    return {
      id: String(data.id ?? data.order_id ?? ''),
      clientOrderId: String(data.client_order_id ?? ''),
      symbol,
      side: String(data.side ?? '0') === '0' ? 'buy' as OrderSide : 'sell' as OrderSide,
      type: 'limit',
      amount: size,
      price: parseFloat(String(data.price ?? '0')),
      status,
      filledAmount: filled,
      remainingAmount: Math.max(0, size - filled),
      avgFillPrice: parseFloat(String(data.price ?? '0')),
      fees: 0,
      createdAt: Number(data.created_at ?? Date.now()),
      updatedAt: Number(data.updated_at ?? Date.now()),
    };
  }

  private mapStatus(s: string): OrderStatus {
    const map: Record<string, OrderStatus> = {
      LIVE: 'open', MATCHED: 'filled', CANCELLED: 'cancelled',
      DELAYED: 'pending', UNMATCHED: 'open', RETRYING: 'pending',
    };
    return map[s.toUpperCase()] ?? 'open';
  }

  private assertConnected(): void {
    if (!this.clobClient) throw new Error('Exchange not connected. Call connect() first.');
  }
}

// ─── Polymarket-specific types ────────────────────────────────────────────────

export interface PolymarketMarket {
  id: string;
  question: string;          // e.g. "Will BTC exceed $100k by June 2026?"
  slug: string;
  endDate: string;
  yesTokenId: string;        // Use this as symbol to buy YES
  noTokenId: string;         // Use this as symbol to buy NO
  yesPrice: number;          // 0.00–1.00 (implied probability)
  noPrice: number;
  volume: number;            // Total volume in USDC
  liquidity: number;
  active: boolean;
}
