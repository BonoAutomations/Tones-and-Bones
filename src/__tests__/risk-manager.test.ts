import { RiskManager } from '../risk/manager';
import { RiskConfig, Signal, Portfolio, BotState } from '../types';

const defaultRiskConfig: RiskConfig = {
  maxPositionSizePercent: 0.1,   // 10%
  maxDailyLossPercent: 0.05,     // 5%
  stopLossPercent: 0.02,         // 2%
  takeProfitPercent: 0.04,       // 4%
  maxOpenPositions: 3,
};

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    type: 'buy',
    symbol: 'BTC/USDT',
    strength: 0.8,
    price: 40000,
    reason: 'test',
    timestamp: Date.now(),
    ...overrides,
  };
}

function makePortfolio(totalValueUSD = 10000): Portfolio {
  return {
    balances: new Map([
      ['USDT', { currency: 'USDT', free: totalValueUSD, used: 0, total: totalValueUSD }],
    ]),
    totalValueUSD,
    timestamp: Date.now(),
  };
}

function makeState(overrides: Partial<BotState> = {}): BotState {
  return {
    status: 'running',
    positions: new Map(),
    portfolio: null,
    tradeHistory: [],
    dailyPnL: 0,
    dailyPnLPercent: 0,
    startedAt: Date.now(),
    lastTickAt: Date.now(),
    errorCount: 0,
    ...overrides,
  };
}

describe('RiskManager', () => {
  let rm: RiskManager;

  beforeEach(() => {
    rm = new RiskManager(defaultRiskConfig);
  });

  describe('checkSignal', () => {
    it('approves valid signals', () => {
      const result = rm.checkSignal(makeSignal(), makePortfolio(), makeState());
      expect(result.approved).toBe(true);
      expect(result.adjustedAmount).toBeGreaterThan(0);
    });

    it('rejects when daily loss limit is hit', () => {
      const state = makeState({ dailyPnLPercent: -0.06 }); // exceeds 5% limit
      const result = rm.checkSignal(makeSignal(), makePortfolio(), state);
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('Daily loss limit');
    });

    it('rejects when max positions reached', () => {
      const positions = new Map();
      for (let i = 0; i < defaultRiskConfig.maxOpenPositions; i++) {
        positions.set(`pos-${i}`, {
          id: `pos-${i}`, symbol: 'BTC/USDT', side: 'buy' as const,
          entryPrice: 40000, currentPrice: 40000, amount: 0.01,
          unrealizedPnL: 0, unrealizedPnLPercent: 0,
          openedAt: Date.now(), orderId: `order-${i}`,
        });
      }
      const state = makeState({ positions });
      const result = rm.checkSignal(makeSignal(), makePortfolio(), state);
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('Max open positions');
    });

    it('rejects duplicate position in same direction', () => {
      const positions = new Map([
        ['pos-1', {
          id: 'pos-1', symbol: 'BTC/USDT', side: 'buy' as const,
          entryPrice: 40000, currentPrice: 40000, amount: 0.01,
          unrealizedPnL: 0, unrealizedPnLPercent: 0,
          openedAt: Date.now(), orderId: 'order-1',
        }],
      ]);
      const state = makeState({ positions });
      const result = rm.checkSignal(makeSignal({ type: 'buy' }), makePortfolio(), state);
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('Already have an open');
    });
  });

  describe('calculatePositionSize', () => {
    it('scales size by signal strength', () => {
      const weakSignal = makeSignal({ strength: 0.3, price: 40000 });
      const strongSignal = makeSignal({ strength: 1.0, price: 40000 });
      const portfolio = makePortfolio(10000);

      const weakResult = rm.calculatePositionSize(weakSignal, portfolio);
      const strongResult = rm.calculatePositionSize(strongSignal, portfolio);

      expect(weakResult.approved).toBe(true);
      expect(strongResult.approved).toBe(true);
      expect(strongResult.adjustedAmount!).toBeGreaterThan(weakResult.adjustedAmount!);
    });

    it('rejects when portfolio value is zero', () => {
      const result = rm.calculatePositionSize(makeSignal(), makePortfolio(0));
      expect(result.approved).toBe(false);
    });

    it('rejects when position size is too small', () => {
      // Very small portfolio + max position size = tiny position
      const result = rm.calculatePositionSize(makeSignal({ price: 100000 }), makePortfolio(1));
      expect(result.approved).toBe(false);
    });
  });

  describe('stop loss and take profit', () => {
    it('calculates stop loss for buy position', () => {
      const stopLoss = rm.calculateStopLoss(40000, 'buy');
      expect(stopLoss).toBe(40000 * (1 - defaultRiskConfig.stopLossPercent));
      expect(stopLoss).toBeLessThan(40000);
    });

    it('calculates stop loss for sell position', () => {
      const stopLoss = rm.calculateStopLoss(40000, 'sell');
      expect(stopLoss).toBe(40000 * (1 + defaultRiskConfig.stopLossPercent));
      expect(stopLoss).toBeGreaterThan(40000);
    });

    it('calculates take profit for buy position', () => {
      const tp = rm.calculateTakeProfit(40000, 'buy');
      expect(tp).toBe(40000 * (1 + defaultRiskConfig.takeProfitPercent));
      expect(tp).toBeGreaterThan(40000);
    });

    it('calculates take profit for sell position', () => {
      const tp = rm.calculateTakeProfit(40000, 'sell');
      expect(tp).toBe(40000 * (1 - defaultRiskConfig.takeProfitPercent));
      expect(tp).toBeLessThan(40000);
    });
  });

  describe('shouldClosePosition', () => {
    const basePosition = {
      id: 'pos-1',
      symbol: 'BTC/USDT',
      side: 'buy' as const,
      entryPrice: 40000,
      currentPrice: 40000,
      amount: 0.01,
      unrealizedPnL: 0,
      unrealizedPnLPercent: 0,
      stopLoss: 39200,
      takeProfit: 41600,
      openedAt: Date.now(),
      orderId: 'order-1',
    };

    it('triggers stop loss when price falls below threshold', () => {
      const result = rm.shouldClosePosition(basePosition, 39000);
      expect(result.close).toBe(true);
      expect(result.reason).toBe('stop_loss');
    });

    it('triggers take profit when price rises above threshold', () => {
      const result = rm.shouldClosePosition(basePosition, 42000);
      expect(result.close).toBe(true);
      expect(result.reason).toBe('take_profit');
    });

    it('holds when price is within range', () => {
      const result = rm.shouldClosePosition(basePosition, 40500);
      expect(result.close).toBe(false);
    });
  });

  describe('validateBalance', () => {
    const balances = new Map([
      ['USDT', { currency: 'USDT', free: 1000, total: 1000 }],
      ['BTC', { currency: 'BTC', free: 0.1, total: 0.1 }],
    ]);

    it('approves buy when sufficient quote balance', () => {
      const result = rm.validateBalance(0.01, 40000, 'buy', balances, 'BTC/USDT');
      expect(result.approved).toBe(true);
    });

    it('rejects buy when insufficient quote balance', () => {
      const result = rm.validateBalance(1, 40000, 'buy', balances, 'BTC/USDT'); // needs $40k, has $1k
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('Insufficient USDT');
    });

    it('approves sell when sufficient base balance', () => {
      const result = rm.validateBalance(0.05, 40000, 'sell', balances, 'BTC/USDT');
      expect(result.approved).toBe(true);
    });

    it('rejects sell when insufficient base balance', () => {
      const result = rm.validateBalance(1, 40000, 'sell', balances, 'BTC/USDT'); // needs 1 BTC, has 0.1
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('Insufficient BTC');
    });
  });
});
