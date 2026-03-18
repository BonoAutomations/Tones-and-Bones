import { withRetry, isRetryableError } from '../utils/retry';

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const result = await withRetry(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });

  it('retries and succeeds on subsequent attempt', async () => {
    let calls = 0;
    const result = await withRetry(
      () => {
        calls++;
        if (calls < 3) throw new Error('transient error');
        return Promise.resolve('success');
      },
      { maxAttempts: 3, delayMs: 1 }
    );

    expect(result).toBe('success');
    expect(calls).toBe(3);
  });

  it('throws after max attempts', async () => {
    let calls = 0;
    await expect(
      withRetry(
        () => {
          calls++;
          throw new Error('persistent error');
        },
        { maxAttempts: 3, delayMs: 1 }
      )
    ).rejects.toThrow('persistent error');

    expect(calls).toBe(3);
  });

  it('calls onRetry callback', async () => {
    const retries: number[] = [];
    await expect(
      withRetry(
        () => { throw new Error('err'); },
        {
          maxAttempts: 3,
          delayMs: 1,
          onRetry: (_, attempt) => retries.push(attempt),
        }
      )
    ).rejects.toThrow();

    expect(retries).toEqual([1, 2]);
  });

  it('stops retrying when shouldRetry returns false', async () => {
    let calls = 0;
    await expect(
      withRetry(
        () => {
          calls++;
          throw new Error('non-retryable');
        },
        {
          maxAttempts: 5,
          delayMs: 1,
          shouldRetry: () => false,
        }
      )
    ).rejects.toThrow('non-retryable');

    expect(calls).toBe(1);
  });
});

describe('isRetryableError', () => {
  const retryableCases = [
    'ECONNRESET',
    'ETIMEDOUT',
    'network error',
    'rate limit exceeded',
    '429 Too Many Requests',
    '503 Service Unavailable',
  ];

  retryableCases.forEach((msg) => {
    it(`identifies "${msg}" as retryable`, () => {
      expect(isRetryableError(new Error(msg))).toBe(true);
    });
  });

  it('identifies non-retryable errors correctly', () => {
    expect(isRetryableError(new Error('Invalid API key'))).toBe(false);
    expect(isRetryableError(new Error('Insufficient balance'))).toBe(false);
    expect(isRetryableError(new Error('Order not found'))).toBe(false);
  });
});
