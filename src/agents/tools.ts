import axios from 'axios';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { BaseExchange } from '../exchange/base';
import { PolymarketExchange } from '../exchange/polymarket';
import { RiskManager } from '../risk/manager';
import { AgentMemory } from './memory';
import { createStrategy } from '../strategies/factory';
import { Portfolio, BotState, Position, OrderSide } from '../types';
import logger from '../utils/logger';

export interface AgentPosition {
  id: string;
  platform: string;
  symbol: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  amount: number;
  stopLoss?: number;
  takeProfit?: number;
  openedAt: number;
  orderId: string;
}

export interface ToolContext {
  exchanges: Map<string, BaseExchange>;
  riskManager: RiskManager;
  memory: AgentMemory;
  positions: Map<string, AgentPosition>;
  dailyPnL: number;
  dryRun: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function ok(data: unknown): string {
  return JSON.stringify({ status: 'ok', data });
}

function fail(message: string): string {
  return JSON.stringify({ status: 'error', message });
}

function getExchange(ctx: ToolContext, platform: string): BaseExchange | null {
  return ctx.exchanges.get(platform.toLowerCase()) ?? null;
}

// ─── Tool Definitions ─────────────────────────────────────────────────────

/**
 * Build all betaZodTool instances for the MainBrain.
 * The context (exchanges, risk, memory, positions) is captured via closure.
 */
export function buildTools(ctx: ToolContext) {

  // ── 1. Get Market Data ──────────────────────────────────────────────────
  const getMarketData = betaZodTool({
    name: 'get_market_data',
    description: 'Fetch current price (ticker) or OHLCV candle data for a symbol on a specific platform.',
    inputSchema: z.object({
      platform: z.enum(['coinbase', 'cryptocom', 'polymarket']).describe('Exchange platform'),
      symbol: z.string().describe('Trading pair, e.g. BTC/USDT, or Polymarket token ID'),
      type: z.enum(['ticker', 'ohlcv']).describe('Data type to fetch'),
      timeframe: z.string().optional().describe('OHLCV timeframe: 1m, 5m, 15m, 1h, 4h, 1d'),
      limit: z.number().int().min(10).max(200).optional().describe('Number of candles (default 50)'),
    }),
    run: async ({ platform, symbol, type, timeframe = '1h', limit = 50 }) => {
      const exchange = getExchange(ctx, platform);
      if (!exchange) return fail(`Platform '${platform}' is not connected.`);
      try {
        if (type === 'ticker') {
          const ticker = await exchange.getTicker(symbol);
          return ok(ticker);
        } else {
          const candles = await exchange.getOHLCV(symbol, timeframe, limit);
          return ok({ symbol, timeframe, count: candles.length, candles: candles.slice(-20) });
        }
      } catch (err) {
        return fail(`Market data error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });

  // ── 2. Get Portfolio ────────────────────────────────────────────────────
  const getPortfolio = betaZodTool({
    name: 'get_portfolio',
    description: 'Fetch account balances from a specific platform.',
    inputSchema: z.object({
      platform: z.enum(['coinbase', 'cryptocom', 'polymarket', 'all']).describe('Platform or "all" for every connected exchange'),
    }),
    run: async ({ platform }) => {
      if (platform === 'all') {
        const results: Record<string, unknown> = {};
        for (const [name, exchange] of ctx.exchanges) {
          try {
            const balances = await exchange.getBalances();
            results[name] = Object.fromEntries(
              Array.from(balances.entries()).map(([k, v]) => [k, { free: v.free, total: v.total }])
            );
          } catch (err) {
            results[name] = { error: err instanceof Error ? err.message : String(err) };
          }
        }
        return ok(results);
      }

      const exchange = getExchange(ctx, platform);
      if (!exchange) return fail(`Platform '${platform}' is not connected.`);
      try {
        const balances = await exchange.getBalances();
        const formatted = Object.fromEntries(
          Array.from(balances.entries()).map(([k, v]) => [k, { free: v.free, used: v.used, total: v.total }])
        );
        return ok(formatted);
      } catch (err) {
        return fail(`Portfolio fetch error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });

  // ── 3. Run Technical Analysis ───────────────────────────────────────────
  const runAnalysis = betaZodTool({
    name: 'run_analysis',
    description: 'Run technical analysis on a symbol and get a trading signal (buy/sell/hold) with strength and reasoning.',
    inputSchema: z.object({
      platform: z.enum(['coinbase', 'cryptocom', 'polymarket']),
      symbol: z.string(),
      strategy: z.enum(['moving_average', 'rsi', 'combined', 'polymarket']).optional()
        .describe('Strategy to use (default: combined for crypto, polymarket for prediction markets)'),
      timeframe: z.string().optional().describe('Candle timeframe, default 1h'),
    }),
    run: async ({ platform, symbol, strategy, timeframe = '1h' }) => {
      const exchange = getExchange(ctx, platform);
      if (!exchange) return fail(`Platform '${platform}' is not connected.`);
      try {
        const strategyName = strategy ?? (platform === 'polymarket' ? 'polymarket' : 'combined');
        const strat = createStrategy({ name: strategyName, params: {} });
        const candles = await exchange.getOHLCV(symbol, timeframe, 100);

        if (candles.length < strat.minimumCandles) {
          return fail(`Insufficient candles: got ${candles.length}, need ${strat.minimumCandles}`);
        }

        const currentPrice = candles[candles.length - 1].close;
        const signal = strat.analyze(candles, symbol, currentPrice);

        return ok({
          signal: signal.type,
          strength: signal.strength,
          price: signal.price,
          reason: signal.reason,
          metadata: signal.metadata,
        });
      } catch (err) {
        return fail(`Analysis error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });

  // ── 4. Check Risk ───────────────────────────────────────────────────────
  const checkRisk = betaZodTool({
    name: 'check_risk',
    description: 'Validate a proposed trade against risk rules before placing it. Always call this before place_order.',
    inputSchema: z.object({
      platform: z.enum(['coinbase', 'cryptocom', 'polymarket']),
      symbol: z.string(),
      side: z.enum(['buy', 'sell']),
      amount: z.number().positive(),
      price: z.number().positive(),
    }),
    run: async ({ platform, symbol, side, amount, price }) => {
      const exchange = getExchange(ctx, platform);
      if (!exchange) return fail(`Platform '${platform}' is not connected.`);

      try {
        const balances = await exchange.getBalances();

        // Build a minimal portfolio for the risk manager
        const totalUSD = Array.from(balances.values()).reduce((sum, b) => {
          if (['USDT', 'USD', 'USDC'].includes(b.currency)) return sum + b.total;
          return sum + b.total * price;
        }, 0);

        const portfolio: Portfolio = {
          balances,
          totalValueUSD: totalUSD,
          timestamp: Date.now(),
        };

        // Minimal BotState for risk check — fetch live prices for existing positions
        const positionEntries = await Promise.allSettled(
          Array.from(ctx.positions.entries()).map(async ([id, p]) => {
            const posExchange = ctx.exchanges.get(p.platform);
            let currentPrice = p.entryPrice;
            if (posExchange) {
              try {
                const t = await posExchange.getTicker(p.symbol);
                currentPrice = t.last;
              } catch { /* fallback to entry price */ }
            }
            const unrealizedPnL = p.side === 'buy'
              ? (currentPrice - p.entryPrice) * p.amount
              : (p.entryPrice - currentPrice) * p.amount;
            return [id, {
              id: p.id, symbol: p.symbol, side: p.side as OrderSide,
              entryPrice: p.entryPrice, currentPrice, amount: p.amount,
              unrealizedPnL, unrealizedPnLPercent: p.entryPrice > 0 ? unrealizedPnL / (p.entryPrice * p.amount) : 0,
              stopLoss: p.stopLoss, takeProfit: p.takeProfit,
              openedAt: p.openedAt, orderId: p.orderId,
            } as Position] as [string, Position];
          })
        );
        const positionsAsMap = new Map<string, Position>(
          positionEntries
            .filter((r): r is PromiseFulfilledResult<[string, Position]> => r.status === 'fulfilled')
            .map((r) => r.value)
        );

        const state: BotState = {
          status: 'running',
          positions: positionsAsMap,
          portfolio,
          tradeHistory: [],
          dailyPnL: ctx.dailyPnL,
          dailyPnLPercent: totalUSD > 0 ? ctx.dailyPnL / totalUSD : 0,
          startedAt: Date.now(),
          lastTickAt: Date.now(),
          errorCount: 0,
        };

        const signal = {
          type: side as 'buy' | 'sell',
          symbol,
          strength: 1.0,
          price,
          reason: 'Brain-initiated trade',
          timestamp: Date.now(),
        };

        const result = ctx.riskManager.checkSignal(signal, portfolio, state);
        const balanceCheck = ctx.riskManager.validateBalance(amount, price, side, balances, symbol);

        const stopLoss = ctx.riskManager.calculateStopLoss(price, side);
        const takeProfit = ctx.riskManager.calculateTakeProfit(price, side);

        return ok({
          approved: result.approved && balanceCheck.approved,
          reason: result.reason ?? balanceCheck.reason,
          suggestedAmount: result.adjustedAmount,
          stopLoss,
          takeProfit,
          riskParams: ctx.riskManager.configuration,
        });
      } catch (err) {
        return fail(`Risk check error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });

  // ── 5. Place Order ──────────────────────────────────────────────────────
  const placeOrder = betaZodTool({
    name: 'place_order',
    description: 'Execute a trade on a platform. ALWAYS call check_risk first. In dry-run mode, this simulates the trade.',
    inputSchema: z.object({
      platform: z.enum(['coinbase', 'cryptocom', 'polymarket']),
      symbol: z.string(),
      side: z.enum(['buy', 'sell']),
      amount: z.number().positive().describe('Quantity of base asset to trade'),
      price: z.number().positive().describe('Price (or probability for Polymarket)'),
      orderType: z.enum(['market', 'limit']).default('market'),
      stopLoss: z.number().positive().optional(),
      takeProfit: z.number().positive().optional(),
      reason: z.string().describe('Why this trade is being placed (for memory/audit)'),
    }),
    run: async ({ platform, symbol, side, amount, price, orderType, stopLoss, takeProfit, reason }) => {
      const exchange = getExchange(ctx, platform);
      if (!exchange) return fail(`Platform '${platform}' is not connected.`);

      if (ctx.dryRun) {
        const simulatedId = `dry-${Date.now()}`;
        const position: AgentPosition = {
          id: simulatedId,
          platform,
          symbol,
          side,
          entryPrice: price,
          amount,
          stopLoss,
          takeProfit,
          openedAt: Date.now(),
          orderId: simulatedId,
        };
        ctx.positions.set(simulatedId, position);

        ctx.memory.addTrade({
          id: simulatedId,
          platform,
          symbol,
          side,
          amount,
          price,
          reason,
          timestamp: Date.now(),
          outcome: 'open',
        });

        logger.info(`[Brain/DryRun] ${side.toUpperCase()} ${amount} ${symbol} @ ${price} on ${platform}`);
        return ok({ dryRun: true, positionId: simulatedId, message: `Simulated ${side} ${amount} ${symbol} @ ${price}` });
      }

      try {
        const order = await exchange.placeOrder({
          symbol,
          side,
          type: orderType,
          amount,
          price: orderType === 'limit' ? price : undefined,
          clientOrderId: `brain-${Date.now()}`,
        });

        if (order.status === 'rejected') {
          return fail(`Order rejected: ${order.id}`);
        }

        const positionId = `${platform}-${order.id}`;
        const position: AgentPosition = {
          id: positionId,
          platform,
          symbol,
          side,
          entryPrice: order.avgFillPrice || price,
          amount: order.filledAmount || amount,
          stopLoss,
          takeProfit,
          openedAt: Date.now(),
          orderId: order.id,
        };
        ctx.positions.set(positionId, position);

        ctx.memory.addTrade({
          id: positionId,
          platform,
          symbol,
          side,
          amount: order.filledAmount || amount,
          price: order.avgFillPrice || price,
          reason,
          timestamp: Date.now(),
          outcome: 'open',
        });

        logger.info(`[Brain] Order placed: ${order.id} — ${side} ${amount} ${symbol} @ ${price} on ${platform}`);
        return ok({ orderId: order.id, positionId, status: order.status, filledAmount: order.filledAmount });
      } catch (err) {
        return fail(`Order failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });

  // ── 6. List Open Positions ──────────────────────────────────────────────
  const listPositions = betaZodTool({
    name: 'list_positions',
    description: 'List all currently open positions tracked by the brain across all platforms.',
    inputSchema: z.object({
      platform: z.enum(['coinbase', 'cryptocom', 'polymarket', 'all']).optional().default('all'),
    }),
    run: async ({ platform }) => {
      const positions = Array.from(ctx.positions.values())
        .filter((p) => platform === 'all' || p.platform === platform);

      // Enrich with live prices using allSettled so one slow exchange doesn't block others
      const results = await Promise.allSettled(
        positions.map(async (p) => {
          const exchange = getExchange(ctx, p.platform);
          if (!exchange) return { ...p, priceError: 'Exchange not connected' };
          const ticker = await exchange.getTicker(p.symbol);
          const currentPrice = ticker.last;
          const unrealizedPnL = p.side === 'buy'
            ? (currentPrice - p.entryPrice) * p.amount
            : (p.entryPrice - currentPrice) * p.amount;
          const pnlPct = (unrealizedPnL / (p.entryPrice * p.amount)) * 100;
          return { ...p, currentPrice, unrealizedPnL, unrealizedPnLPct: `${pnlPct.toFixed(2)}%` };
        })
      );

      const enriched = results.map((r, i) =>
        r.status === 'fulfilled'
          ? r.value
          : { ...positions[i], priceError: (r.reason as Error)?.message ?? 'fetch failed' }
      );

      return ok({ count: enriched.length, positions: enriched });
    },
  });

  // ── 7. Close Position ───────────────────────────────────────────────────
  const closePosition = betaZodTool({
    name: 'close_position',
    description: 'Close an open position (place the opposing order). Use for manual exit or stop-loss/take-profit.',
    inputSchema: z.object({
      positionId: z.string().describe('Position ID from list_positions'),
      reason: z.string().describe('Reason for closing'),
    }),
    run: async ({ positionId, reason }) => {
      const position = ctx.positions.get(positionId);
      if (!position) return fail(`Position '${positionId}' not found.`);

      const exchange = getExchange(ctx, position.platform);
      if (!exchange) return fail(`Platform '${position.platform}' is not connected.`);

      const closeSide = position.side === 'buy' ? 'sell' : 'buy';

      if (ctx.dryRun) {
        ctx.positions.delete(positionId);
        ctx.memory.addSessionInsight(`[DryRun] Closed position ${positionId}: ${reason}`);
        return ok({ dryRun: true, message: `Simulated close of ${position.symbol} position` });
      }

      try {
        const closeOrder = await exchange.placeOrder({
          symbol: position.symbol,
          side: closeSide,
          type: 'market',
          amount: position.amount,
        });

        const pnl = closeSide === 'sell'
          ? (closeOrder.avgFillPrice - position.entryPrice) * position.amount
          : (position.entryPrice - closeOrder.avgFillPrice) * position.amount;

        ctx.memory.updateTradeOutcome(positionId, pnl, pnl >= 0 ? 'win' : 'loss');
        ctx.positions.delete(positionId);
        ctx.memory.addSessionInsight(`Closed ${position.symbol} on ${position.platform}: PnL $${pnl.toFixed(2)} — ${reason}`);

        logger.info(`[Brain] Closed position ${positionId}: PnL $${pnl.toFixed(2)}`);
        return ok({ closed: true, pnl, closeOrderId: closeOrder.id, reason });
      } catch (err) {
        return fail(`Close position failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });

  // ── 8. Search Prediction Markets ────────────────────────────────────────
  const searchMarkets = betaZodTool({
    name: 'search_markets',
    description: 'Search Polymarket for prediction market opportunities by keyword. Returns markets with token IDs to trade.',
    inputSchema: z.object({
      query: z.string().describe('Search keywords, e.g. "bitcoin price", "election", "fed rate"'),
      limit: z.number().int().min(1).max(20).optional().default(5),
    }),
    run: async ({ query, limit }) => {
      const exchange = getExchange(ctx, 'polymarket');
      if (!exchange) return fail('Polymarket is not connected.');
      try {
        const polymarket = exchange as PolymarketExchange;
        const markets = await polymarket.searchMarkets(query, limit);
        return ok(markets);
      } catch (err) {
        return fail(`Polymarket search error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });

  // ── 9. Get Performance ──────────────────────────────────────────────────
  const getPerformance = betaZodTool({
    name: 'get_performance',
    description: 'Get overall trading performance stats, recent trades, and session insights from memory.',
    inputSchema: z.object({}),
    run: async () => {
      const stats = ctx.memory.getTradeStats();
      const recentTrades = ctx.memory.getRecentTrades(10);
      const insights = ctx.memory.getSessionInsights();
      const openCount = ctx.positions.size;

      return ok({
        stats: {
          ...stats,
          winRate: `${(stats.winRate * 100).toFixed(1)}%`,
          totalPnl: `$${stats.totalPnl.toFixed(2)}`,
        },
        openPositions: openCount,
        dailyPnL: `$${ctx.dailyPnL.toFixed(2)}`,
        recentTrades: recentTrades.slice(0, 5),
        insights,
      });
    },
  });

  // ── 10. Save Note ───────────────────────────────────────────────────────
  const saveNote = betaZodTool({
    name: 'save_note',
    description: 'Save a market insight, pattern, or observation to memory for future reference.',
    inputSchema: z.object({
      content: z.string().describe('The insight or note to save'),
      tags: z.array(z.string()).optional().describe('Optional tags for categorization'),
    }),
    run: async ({ content, tags }) => {
      const id = ctx.memory.saveNote(content, tags ?? []);
      return ok({ saved: true, id });
    },
  });

  // ── 11. Recall Notes ────────────────────────────────────────────────────
  const recallNotes = betaZodTool({
    name: 'recall_notes',
    description: 'Recall past notes, insights, or observations from memory.',
    inputSchema: z.object({
      query: z.string().optional().describe('Search term (optional, omit to get recent notes)'),
      limit: z.number().int().min(1).max(10).optional().default(5),
    }),
    run: async ({ query, limit }) => {
      const notes = ctx.memory.recallNotes(query, limit);
      return ok(notes);
    },
  });

  // ── 12. Market Context ──────────────────────────────────────────────────
  const getMarketContext = betaZodTool({
    name: 'get_market_context',
    description: [
      'Fetch macro crypto market context: BTC/ETH spot prices, 24h changes, BTC dominance,',
      'and the Crypto Fear & Greed Index. Use this to calibrate trade sizing and risk.',
      'Fear ≤ 25 = Extreme Fear (potential buy zone). Greed ≥ 75 = Extreme Greed (caution).',
    ].join(' '),
    inputSchema: z.object({}),
    run: async () => {
      try {
        const [priceRes, fngRes] = await Promise.allSettled([
          axios.get('https://api.coingecko.com/api/v3/simple/price', {
            params: {
              ids: 'bitcoin,ethereum,solana',
              vs_currencies: 'usd',
              include_24hr_change: true,
              include_market_cap: true,
            },
            timeout: 8000,
          }),
          axios.get('https://api.alternative.me/fng/', {
            params: { limit: 1 },
            timeout: 5000,
          }),
        ]);

        const prices = priceRes.status === 'fulfilled' ? priceRes.value.data : null;
        const fng = fngRes.status === 'fulfilled' ? fngRes.value.data?.data?.[0] : null;

        const btc = prices?.bitcoin;
        const eth = prices?.ethereum;
        const sol = prices?.solana;

        // Simple BTC dominance estimate from market caps
        const totalMcap = (btc?.usd_market_cap ?? 0) + (eth?.usd_market_cap ?? 0);
        const btcDominance = totalMcap > 0
          ? ((btc?.usd_market_cap ?? 0) / totalMcap * 100).toFixed(1)
          : 'unavailable';

        return ok({
          timestamp: new Date().toISOString(),
          bitcoin: btc ? {
            price: `$${btc.usd.toLocaleString()}`,
            change24h: `${btc.usd_24h_change?.toFixed(2) ?? '?'}%`,
          } : 'unavailable',
          ethereum: eth ? {
            price: `$${eth.usd.toLocaleString()}`,
            change24h: `${eth.usd_24h_change?.toFixed(2) ?? '?'}%`,
          } : 'unavailable',
          solana: sol ? {
            price: `$${sol.usd.toLocaleString()}`,
            change24h: `${sol.usd_24h_change?.toFixed(2) ?? '?'}%`,
          } : 'unavailable',
          btcDominance: `${btcDominance}%`,
          fearAndGreed: fng ? {
            value: parseInt(fng.value, 10),
            classification: fng.value_classification,
            interpretation: parseInt(fng.value, 10) <= 25
              ? 'Extreme Fear — market may be oversold'
              : parseInt(fng.value, 10) >= 75
              ? 'Extreme Greed — consider reducing exposure'
              : 'Neutral/moderate sentiment',
          } : 'unavailable',
        });
      } catch (err) {
        return fail(`Market context error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });

  // ── 13. Update SL/TP ────────────────────────────────────────────────────
  const updateSlTp = betaZodTool({
    name: 'update_sl_tp',
    description: 'Adjust the stop-loss or take-profit levels on an open position without closing it. Useful for trailing stops.',
    inputSchema: z.object({
      positionId: z.string().describe('Position ID from list_positions'),
      stopLoss: z.number().positive().optional().describe('New stop-loss price'),
      takeProfit: z.number().positive().optional().describe('New take-profit price'),
    }),
    run: async ({ positionId, stopLoss, takeProfit }) => {
      const position = ctx.positions.get(positionId);
      if (!position) return fail(`Position '${positionId}' not found.`);
      if (stopLoss !== undefined) position.stopLoss = stopLoss;
      if (takeProfit !== undefined) position.takeProfit = takeProfit;
      logger.info(`[Brain] Updated ${positionId}: SL=${stopLoss ?? 'unchanged'}, TP=${takeProfit ?? 'unchanged'}`);
      return ok({ updated: true, positionId, stopLoss: position.stopLoss, takeProfit: position.takeProfit });
    },
  });

  return [
    getMarketData,
    getPortfolio,
    runAnalysis,
    checkRisk,
    placeOrder,
    listPositions,
    closePosition,
    updateSlTp,
    searchMarkets,
    getMarketContext,
    getPerformance,
    saveNote,
    recallNotes,
  ];
}
