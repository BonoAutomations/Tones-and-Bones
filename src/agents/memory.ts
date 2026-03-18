import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

export interface TradeRecord {
  id: string;
  platform: string;
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  pnl?: number;
  reason: string;
  timestamp: number;
  outcome?: 'win' | 'loss' | 'open';
}

export interface AgentNote {
  id: string;
  content: string;
  tags: string[];
  timestamp: number;
}

interface MemoryState {
  trades: TradeRecord[];
  notes: AgentNote[];
  sessionInsights: string[];
  lastSessionSummary?: string;
}

/**
 * Persistent memory for the MainBrain agent.
 * Stores trade history, notes, and session insights.
 * Persists to a JSON file between restarts.
 */
export class AgentMemory {
  private state: MemoryState;
  private readonly filePath: string;
  private readonly maxTrades = 200;
  private readonly maxNotes = 100;

  constructor(dataDir = './logs') {
    this.filePath = path.join(dataDir, 'agent-memory.json');
    this.state = this.load();
  }

  // ─── Trade History ────────────────────────────────────────────────────────

  addTrade(trade: TradeRecord): void {
    this.state.trades.unshift(trade);
    if (this.state.trades.length > this.maxTrades) {
      this.state.trades = this.state.trades.slice(0, this.maxTrades);
    }
    this.save();
  }

  updateTradeOutcome(tradeId: string, pnl: number, outcome: 'win' | 'loss'): void {
    const trade = this.state.trades.find((t) => t.id === tradeId);
    if (trade) {
      trade.pnl = pnl;
      trade.outcome = outcome;
      this.save();
    }
  }

  getRecentTrades(limit = 10): TradeRecord[] {
    return this.state.trades.slice(0, limit);
  }

  getTradeStats(): {
    total: number; wins: number; losses: number; winRate: number;
    totalPnl: number; avgWin: number; avgLoss: number;
  } {
    const closed = this.state.trades.filter((t) => t.outcome !== 'open' && t.pnl !== undefined);
    const wins = closed.filter((t) => t.outcome === 'win');
    const losses = closed.filter((t) => t.outcome === 'loss');
    const totalPnl = closed.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const avgWin = wins.length ? wins.reduce((s, t) => s + (t.pnl ?? 0), 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, t) => s + (t.pnl ?? 0), 0) / losses.length : 0;

    return {
      total: closed.length,
      wins: wins.length,
      losses: losses.length,
      winRate: closed.length ? wins.length / closed.length : 0,
      totalPnl,
      avgWin,
      avgLoss,
    };
  }

  // ─── Notes / Insights ─────────────────────────────────────────────────────

  saveNote(content: string, tags: string[] = []): string {
    const id = `note-${Date.now()}`;
    this.state.notes.unshift({ id, content, tags, timestamp: Date.now() });
    if (this.state.notes.length > this.maxNotes) {
      this.state.notes = this.state.notes.slice(0, this.maxNotes);
    }
    this.save();
    return id;
  }

  recallNotes(query?: string, limit = 5): AgentNote[] {
    if (!query) return this.state.notes.slice(0, limit);
    const q = query.toLowerCase();
    return this.state.notes
      .filter((n) => n.content.toLowerCase().includes(q) || n.tags.some((t) => t.includes(q)))
      .slice(0, limit);
  }

  addSessionInsight(insight: string): void {
    this.state.sessionInsights.unshift(insight);
    if (this.state.sessionInsights.length > 20) {
      this.state.sessionInsights = this.state.sessionInsights.slice(0, 20);
    }
    this.save();
  }

  getSessionInsights(): string[] {
    return this.state.sessionInsights.slice(0, 5);
  }

  // ─── Serialization ────────────────────────────────────────────────────────

  private load(): MemoryState {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        return JSON.parse(raw) as MemoryState;
      }
    } catch (err) {
      logger.warn(`[AgentMemory] Could not load memory: ${err}`);
    }
    return { trades: [], notes: [], sessionInsights: [] };
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
    } catch (err) {
      logger.warn(`[AgentMemory] Could not save memory: ${err}`);
    }
  }

  /**
   * Get total closed PnL for trades closed today (UTC).
   */
  getDailyPnL(): number {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    return this.state.trades
      .filter((t) => t.outcome !== 'open' && t.pnl !== undefined && t.timestamp >= todayStart.getTime())
      .reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  }

  saveSessionSummary(summary: string): void {
    this.state.lastSessionSummary = summary;
    this.save();
  }

  getLastSessionSummary(): string | undefined {
    return this.state.lastSessionSummary;
  }

  /** Compact summary for brain context injection */
  toContextString(): string {
    const stats = this.getTradeStats();
    const recentTrades = this.getRecentTrades(5)
      .map((t) => `  [${t.platform}] ${t.side} ${t.amount} ${t.symbol} @ $${t.price} (${t.outcome ?? 'open'}) — ${t.reason}`)
      .join('\n');
    const insights = this.getSessionInsights().map((i) => `  • ${i}`).join('\n');

    return [
      `TRADE HISTORY: ${stats.total} closed trades, ${(stats.winRate * 100).toFixed(0)}% win rate, PnL: $${stats.totalPnl.toFixed(2)}`,
      recentTrades ? `RECENT TRADES:\n${recentTrades}` : 'RECENT TRADES: none',
      insights ? `SESSION INSIGHTS:\n${insights}` : '',
    ].filter(Boolean).join('\n');
  }
}
