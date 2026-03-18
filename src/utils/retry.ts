import logger from './logger';

export interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
  onRetry?: (error: Error, attempt: number) => void;
  shouldRetry?: (error: Error) => boolean;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 30000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error;
  let delay = opts.delayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (opts.shouldRetry && !opts.shouldRetry(lastError)) {
        throw lastError;
      }

      if (attempt === opts.maxAttempts) {
        break;
      }

      if (opts.onRetry) {
        opts.onRetry(lastError, attempt);
      } else {
        logger.warn(`Attempt ${attempt}/${opts.maxAttempts} failed: ${lastError.message}. Retrying in ${delay}ms...`);
      }

      await sleep(delay);

      if (opts.backoffMultiplier) {
        delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs ?? 30000);
      }
    }
  }

  throw lastError!;
}

/**
 * Retry specifically for non-retryable errors (network issues, rate limits).
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  const retryablePatterns = [
    'econnreset',
    'econnrefused',
    'etimedout',
    'enotfound',
    'network',
    'timeout',
    'rate limit',
    'too many requests',
    '429',
    '503',
    '502',
    '504',
  ];
  return retryablePatterns.some((pattern) => message.includes(pattern));
}
