import { CircuitBreakerConfig, CircuitState } from '../types';
import logger from './logger';

/**
 * Circuit Breaker pattern implementation.
 *
 * States:
 *   CLOSED  → Normal operation. Failures are counted.
 *   OPEN    → Calls are rejected immediately. Timeout triggers HALF_OPEN.
 *   HALF_OPEN → One test call allowed. Success → CLOSED. Failure → OPEN.
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly name: string;

  constructor(name: string, config: CircuitBreakerConfig) {
    this.name = name;
    this.config = config;
  }

  get currentState(): CircuitState {
    return this.state;
  }

  get isOpen(): boolean {
    return this.state === 'open';
  }

  /**
   * Execute an operation through the circuit breaker.
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.config.timeoutMs) {
        this.transitionTo('half_open');
      } else {
        throw new CircuitOpenError(
          `Circuit breaker [${this.name}] is OPEN. Calls rejected until ${new Date(this.lastFailureTime + this.config.timeoutMs).toISOString()}`
        );
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'half_open') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo('closed');
      }
    }
  }

  private onFailure(error: Error): void {
    this.lastFailureTime = Date.now();
    this.failureCount++;

    logger.warn(`Circuit breaker [${this.name}] failure ${this.failureCount}/${this.config.failureThreshold}: ${error.message}`);

    if (this.state === 'half_open' || this.failureCount >= this.config.failureThreshold) {
      this.transitionTo('open');
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === 'closed') {
      this.failureCount = 0;
      this.successCount = 0;
    } else if (newState === 'open') {
      this.successCount = 0;
    } else if (newState === 'half_open') {
      this.successCount = 0;
    }

    logger.info(`Circuit breaker [${this.name}]: ${oldState.toUpperCase()} → ${newState.toUpperCase()}`);
  }

  reset(): void {
    this.transitionTo('closed');
    logger.info(`Circuit breaker [${this.name}] manually reset`);
  }

  getStats(): { state: CircuitState; failureCount: number; lastFailureTime: number } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}
