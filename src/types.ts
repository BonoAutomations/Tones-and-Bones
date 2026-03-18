/**
 * Core types and interfaces for the trading bot
 */

// ─── Market Data ─────────────────────────────────────────────────────────────

export interface Ticker {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  timestamp: number;
}

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBook {
  symbol: string;
  bids: [number, number][]; // [price, amount]
  asks: [number, number][]; // [price, amount]
  timestamp: number;
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop_loss' | 'take_profit';
export type OrderStatus =
  | 'pending'
  | 'open'
  | 'filled'
  | 'partially_filled'
  | 'cancelled'
  | 'rejected'
  | 'expired';

export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  amount: number;
  price?: number;      // Required for limit orders
  stopPrice?: number;  // Required for stop orders
  clientOrderId?: string;
}

export interface Order extends OrderRequest {
  id: string;
  status: OrderStatus;
  filledAmount: number;
  remainingAmount: number;
  avgFillPrice: number;
  fees: number;
  createdAt: number;
  updatedAt: number;
}

// ─── Portfolio ────────────────────────────────────────────────────────────────

export interface Balance {
  currency: string;
  free: number;
  used: number;
  total: number;
}

export interface Portfolio {
  balances: Map<string, Balance>;
  totalValueUSD: number;
  timestamp: number;
}

export interface Position {
  id: string;
  symbol: string;
  side: OrderSide;
  entryPrice: number;
  currentPrice: number;
  amount: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  stopLoss?: number;
  takeProfit?: number;
  openedAt: number;
  orderId: string;
}

// ─── Strategies ───────────────────────────────────────────────────────────────

export type SignalType = 'buy' | 'sell' | 'hold';

export interface Signal {
  type: SignalType;
  symbol: string;
  strength: number;        // 0-1, confidence of the signal
  price: number;
  reason: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface StrategyConfig {
  name: string;
  params: Record<string, unknown>;
}

// ─── Risk Management ─────────────────────────────────────────────────────────

export interface RiskConfig {
  maxPositionSizePercent: number;   // Max % of portfolio per position
  maxDailyLossPercent: number;      // Circuit breaker: stop if daily loss exceeds
  stopLossPercent: number;          // Default stop loss %
  takeProfitPercent: number;        // Default take profit %
  maxOpenPositions: number;         // Max simultaneous positions
}

export interface RiskCheckResult {
  approved: boolean;
  reason?: string;
  adjustedAmount?: number;
}

// ─── Exchange ─────────────────────────────────────────────────────────────────

export interface ExchangeConfig {
  name: string;
  apiKey?: string;
  apiSecret?: string;
  testnet?: boolean;
  rateLimit?: number;  // ms between requests
}

export interface TradeRecord {
  id: string;
  symbol: string;
  side: OrderSide;
  amount: number;
  price: number;
  fees: number;
  pnl: number;
  pnlPercent: number;
  strategy: string;
  openedAt: number;
  closedAt: number;
}

// ─── Bot State ────────────────────────────────────────────────────────────────

export type BotStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'error'
  | 'circuit_open';

export interface BotConfig {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  strategy: StrategyConfig;
  risk: RiskConfig;
  exchange: ExchangeConfig;
  pollIntervalMs: number;
  dryRun: boolean;
  circuitBreaker: CircuitBreakerConfig;
}

export interface BotState {
  status: BotStatus;
  positions: Map<string, Position>;
  portfolio: Portfolio | null;
  tradeHistory: TradeRecord[];
  dailyPnL: number;
  dailyPnLPercent: number;
  startedAt: number | null;
  lastTickAt: number | null;
  errorCount: number;
}

// ─── Circuit Breaker ─────────────────────────────────────────────────────────

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
}

export type CircuitState = 'closed' | 'open' | 'half_open';

// ─── Events ──────────────────────────────────────────────────────────────────

export interface BotEvents {
  'tick': [ticker: Ticker];
  'signal': [signal: Signal];
  'order:placed': [order: Order];
  'order:filled': [order: Order];
  'order:cancelled': [order: Order];
  'order:failed': [error: Error, request: OrderRequest];
  'position:opened': [position: Position];
  'position:closed': [position: Position, trade: TradeRecord];
  'position:stopped': [position: Position, reason: 'stop_loss' | 'take_profit'];
  'risk:rejected': [reason: string, signal: Signal];
  'circuit:opened': [reason: string];
  'circuit:closed': [];
  'bot:started': [];
  'bot:stopped': [];
  'bot:error': [error: Error];
  'daily:loss:limit': [dailyPnL: number];
}
