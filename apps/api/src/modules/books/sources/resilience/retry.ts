const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const isRetryableError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;

  const maybeError = error as { code?: string; response?: { status?: number } };

  const status = maybeError.response?.status;
  if (typeof status === 'number') {
    if (status === 408 || status === 429) return true;
    if (status >= 500 && status <= 599) return true;
    return false;
  }

  const code = maybeError.code;
  if (!code) return false;
  return ['ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(code);
};

export const withRetry = async <T>(
  operation: () => Promise<T>,
  options?: { maxAttempts?: number; initialDelayMs?: number }
): Promise<T> => {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 3);
  const initialDelayMs = Math.max(50, options?.initialDelayMs ?? 200);

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableError(error)) {
        throw error;
      }

      const jitter = Math.floor(Math.random() * 100);
      const backoff = initialDelayMs * 2 ** (attempt - 1) + jitter;
      await sleep(backoff);
    }
  }

  throw lastError;
};
