/**
 * Token bucket rate limiter for API calls.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefillTime: number;
  private readonly maxTokens: number;
  private readonly refillRatePerMs: number;
  private readonly queue: Array<() => void> = [];

  constructor(requestsPerSecond: number, burstSize?: number) {
    this.maxTokens = burstSize ?? requestsPerSecond;
    this.tokens = this.maxTokens;
    this.refillRatePerMs = requestsPerSecond / 1000;
    this.lastRefillTime = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;
    const newTokens = elapsed * this.refillRatePerMs;
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefillTime = now;
  }

  /**
   * Acquire a token, waiting if necessary.
   */
  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    const waitTime = (1 - this.tokens) / this.refillRatePerMs;
    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
      setTimeout(() => {
        const idx = this.queue.indexOf(resolve);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
          this.refill();
          this.tokens = Math.max(0, this.tokens - 1);
          resolve();
        }
      }, waitTime);
    });
  }

  /**
   * Wrap an async operation with rate limiting.
   */
  async wrap<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquire();
    return operation();
  }
}
