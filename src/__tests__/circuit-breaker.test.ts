import { CircuitBreaker, CircuitOpenError } from '../utils/circuit-breaker';

describe('CircuitBreaker', () => {
  const config = {
    failureThreshold: 3,
    successThreshold: 2,
    timeoutMs: 100,
  };

  it('starts in CLOSED state', () => {
    const cb = new CircuitBreaker('test', config);
    expect(cb.currentState).toBe('closed');
    expect(cb.isOpen).toBe(false);
  });

  it('executes operations in CLOSED state', async () => {
    const cb = new CircuitBreaker('test', config);
    const result = await cb.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('opens after threshold failures', async () => {
    const cb = new CircuitBreaker('test', config);
    const fail = () => Promise.reject(new Error('failure'));

    for (let i = 0; i < config.failureThreshold; i++) {
      await expect(cb.execute(fail)).rejects.toThrow('failure');
    }

    expect(cb.currentState).toBe('open');
    expect(cb.isOpen).toBe(true);
  });

  it('rejects calls immediately when OPEN', async () => {
    const cb = new CircuitBreaker('test', config);
    const fail = () => Promise.reject(new Error('failure'));

    for (let i = 0; i < config.failureThreshold; i++) {
      await expect(cb.execute(fail)).rejects.toThrow();
    }

    await expect(cb.execute(() => Promise.resolve(1))).rejects.toThrow(CircuitOpenError);
  });

  it('transitions to HALF_OPEN after timeout', async () => {
    const cb = new CircuitBreaker('test', config);
    const fail = () => Promise.reject(new Error('failure'));

    for (let i = 0; i < config.failureThreshold; i++) {
      await expect(cb.execute(fail)).rejects.toThrow();
    }

    expect(cb.currentState).toBe('open');

    // Wait for timeout
    await new Promise((r) => setTimeout(r, config.timeoutMs + 10));

    // Next call should try (half-open)
    await cb.execute(() => Promise.resolve('ok'));
    // After success, state should move toward closed
    expect(['half_open', 'closed']).toContain(cb.currentState);
  });

  it('closes after enough successes in HALF_OPEN', async () => {
    const cb = new CircuitBreaker('test', config);
    const fail = () => Promise.reject(new Error('failure'));

    // Open the circuit
    for (let i = 0; i < config.failureThreshold; i++) {
      await expect(cb.execute(fail)).rejects.toThrow();
    }

    // Wait for timeout
    await new Promise((r) => setTimeout(r, config.timeoutMs + 10));

    // Execute enough successes to close
    for (let i = 0; i < config.successThreshold; i++) {
      await cb.execute(() => Promise.resolve('ok'));
    }

    expect(cb.currentState).toBe('closed');
  });

  it('manually resets to CLOSED', () => {
    const cb = new CircuitBreaker('test', config);
    cb.reset();
    expect(cb.currentState).toBe('closed');
  });

  it('returns stats', async () => {
    const cb = new CircuitBreaker('test', config);
    const stats = cb.getStats();
    expect(stats).toHaveProperty('state');
    expect(stats).toHaveProperty('failureCount');
    expect(stats).toHaveProperty('lastFailureTime');
  });
});
