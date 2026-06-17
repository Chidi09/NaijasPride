export class RetryableError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "RetryableError";
  }
}

export type RetryOptions = {
  maxAttempts: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const {
    maxAttempts,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    onRetry,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry non-retryable errors
      if (!(lastError instanceof RetryableError)) {
        throw lastError;
      }

      // Don't retry after last attempt
      if (attempt >= maxAttempts) {
        break;
      }

      // Calculate exponential backoff delay with jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(backoffMultiplier, attempt - 1),
        maxDelayMs,
      );
      const jitter = Math.random() * 0.3 * delay; // 30% jitter
      const actualDelay = Math.floor(delay + jitter);

      onRetry?.(attempt, lastError, actualDelay);
      await sleep(actualDelay);
    }
  }

  throw lastError;
}

export function isRetryableStatus(status: number): boolean {
  // Retry on rate limiting, server errors, and timeouts
  return (
    status === 429 ||
    status === 503 ||
    status === 502 ||
    status === 504 ||
    status >= 520
  );
}
