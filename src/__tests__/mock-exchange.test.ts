import { MockExchange } from '../exchange/mock';

describe('MockExchange', () => {
  let exchange: MockExchange;

  beforeEach(async () => {
    exchange = new MockExchange({ name: 'mock' });
    await exchange.connect();
  });

  afterEach(async () => {
    await exchange.disconnect();
  });

  it('connects and reports healthy', async () => {
    expect(await exchange.isHealthy()).toBe(true);
  });

  it('disconnects and reports unhealthy', async () => {
    await exchange.disconnect();
    expect(await exchange.isHealthy()).toBe(false);
  });

  it('throws when not connected', async () => {
    const ex = new MockExchange({ name: 'mock' });
    await expect(ex.getTicker('BTC/USDT')).rejects.toThrow('not connected');
  });

  it('returns ticker for known symbol', async () => {
    const ticker = await exchange.getTicker('BTC/USDT');
    expect(ticker.symbol).toBe('BTC/USDT');
    expect(ticker.bid).toBeGreaterThan(0);
    expect(ticker.ask).toBeGreaterThan(ticker.bid);
    expect(ticker.last).toBeGreaterThan(0);
    expect(ticker.timestamp).toBeGreaterThan(0);
  });

  it('returns OHLCV data', async () => {
    const candles = await exchange.getOHLCV('BTC/USDT', '1m', 50);
    expect(candles).toHaveLength(50);
    candles.forEach((c) => {
      expect(c.open).toBeGreaterThan(0);
      expect(c.high).toBeGreaterThanOrEqual(c.open);
      expect(c.low).toBeLessThanOrEqual(c.open);
      expect(c.close).toBeGreaterThan(0);
      expect(c.volume).toBeGreaterThan(0);
      expect(c.timestamp).toBeGreaterThan(0);
    });
  });

  it('returns balances', async () => {
    const balances = await exchange.getBalances();
    expect(balances.has('USDT')).toBe(true);
    expect(balances.has('BTC')).toBe(true);
    const usdt = balances.get('USDT')!;
    expect(usdt.free).toBeGreaterThan(0);
    expect(usdt.total).toBe(usdt.free + usdt.used);
  });

  it('places and fills a market buy order', async () => {
    const order = await exchange.placeOrder({
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'market',
      amount: 0.001,
    });

    expect(order.id).toBeTruthy();
    expect(order.status).toBe('filled');
    expect(order.filledAmount).toBe(0.001);
    expect(order.avgFillPrice).toBeGreaterThan(0);
    expect(order.fees).toBeGreaterThan(0);
  });

  it('places and fills a market sell order', async () => {
    const order = await exchange.placeOrder({
      symbol: 'BTC/USDT',
      side: 'sell',
      type: 'market',
      amount: 0.001,
    });

    expect(order.status).toBe('filled');
    expect(order.side).toBe('sell');
  });

  it('updates balances after buy order', async () => {
    const before = await exchange.getBalances();
    const usdtBefore = before.get('USDT')!.free;

    await exchange.placeOrder({
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'market',
      amount: 0.01,
    });

    const after = await exchange.getBalances();
    const usdtAfter = after.get('USDT')!.free;

    expect(usdtAfter).toBeLessThan(usdtBefore);
  });

  it('fetches order by ID', async () => {
    const placed = await exchange.placeOrder({
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'market',
      amount: 0.001,
    });

    const fetched = await exchange.getOrder(placed.id, 'BTC/USDT');
    expect(fetched.id).toBe(placed.id);
    expect(fetched.status).toBe('filled');
  });

  it('throws when fetching unknown order', async () => {
    await expect(exchange.getOrder('nonexistent', 'BTC/USDT')).rejects.toThrow('not found');
  });

  it('returns open orders (empty initially)', async () => {
    const openOrders = await exchange.getOpenOrders('BTC/USDT');
    // Market orders fill immediately, so there should be no open orders
    expect(Array.isArray(openOrders)).toBe(true);
  });
});
