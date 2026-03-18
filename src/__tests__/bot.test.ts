import { TradingBot } from '../bot';
import { MockExchange } from '../exchange/mock';
import { MovingAverageStrategy } from '../strategies/moving-average';
import { BotConfig } from '../types';

const testConfig: BotConfig = {
  symbol: 'BTC/USDT',
  baseCurrency: 'USDT',
  quoteCurrency: 'BTC',
  dryRun: true,
  pollIntervalMs: 999999, // Very long to prevent auto-ticking in tests
  exchange: { name: 'mock' },
  strategy: {
    name: 'moving_average',
    params: { fastPeriod: 5, slowPeriod: 10, signalPeriod: 3 },
  },
  risk: {
    maxPositionSizePercent: 0.1,
    maxDailyLossPercent: 0.05,
    stopLossPercent: 0.02,
    takeProfitPercent: 0.04,
    maxOpenPositions: 3,
  },
  circuitBreaker: {
    failureThreshold: 5,
    successThreshold: 2,
    timeoutMs: 60000,
  },
};

describe('TradingBot', () => {
  let bot: TradingBot;
  let exchange: MockExchange;
  let strategy: MovingAverageStrategy;

  beforeEach(() => {
    exchange = new MockExchange(testConfig.exchange);
    strategy = new MovingAverageStrategy(testConfig.strategy);
    bot = new TradingBot(testConfig, exchange, strategy);
  });

  afterEach(async () => {
    if (bot.getState().status === 'running' || bot.getState().status === 'paused') {
      await bot.stop(false);
    }
  });

  it('starts in idle state', () => {
    expect(bot.getState().status).toBe('idle');
  });

  it('starts and transitions to running', async () => {
    let started = false;
    bot.on('bot:started', () => { started = true; });

    await bot.start();

    expect(bot.getState().status).toBe('running');
    expect(bot.getState().startedAt).toBeGreaterThan(0);
    expect(started).toBe(true);
  }, 10000);

  it('stops and transitions to stopped', async () => {
    await bot.start();
    await bot.stop(false);

    expect(bot.getState().status).toBe('stopped');
  }, 10000);

  it('can pause and resume', async () => {
    await bot.start();
    expect(bot.getState().status).toBe('running');

    bot.pause();
    expect(bot.getState().status).toBe('paused');

    await bot.resume();
    expect(bot.getState().status).toBe('running');
  }, 10000);

  it('does not double-start', async () => {
    await bot.start();
    const stateBefore = bot.getState().startedAt;

    // Second call should be a no-op
    await bot.start();
    expect(bot.getState().startedAt).toBe(stateBefore);
  }, 10000);

  it('returns stats', async () => {
    await bot.start();
    const stats = bot.getStats();

    expect(stats).toHaveProperty('status', 'running');
    expect(stats).toHaveProperty('totalTrades', 0);
    expect(stats).toHaveProperty('openPositions', 0);
    expect(stats).toHaveProperty('dailyPnL', 0);
    expect(stats).toHaveProperty('winRate', 0);
    expect(stats).toHaveProperty('circuitBreaker');
  }, 10000);

  it('emits tick events', async () => {
    const ticks: unknown[] = [];
    bot.on('tick', (ticker) => ticks.push(ticker));

    await bot.start();

    // The start() call runs one tick immediately
    expect(ticks.length).toBeGreaterThanOrEqual(1);
  }, 10000);

  it('emits signal events', async () => {
    const signals: unknown[] = [];
    bot.on('signal', (signal) => signals.push(signal));

    await bot.start();

    // Should have received at least one signal from the initial tick
    expect(signals.length).toBeGreaterThanOrEqual(1);
  }, 10000);

  it('dry run does not place real orders', async () => {
    const orders: unknown[] = [];
    bot.on('order:placed', (order) => orders.push(order));

    await bot.start();

    // In dry run mode, no orders should be placed even if signals are generated
    expect(orders).toHaveLength(0);
  }, 10000);

  it('portfolio is loaded after start', async () => {
    await bot.start();
    expect(bot.getState().portfolio).not.toBeNull();
    expect(bot.getState().portfolio!.totalValueUSD).toBeGreaterThan(0);
  }, 10000);
});
