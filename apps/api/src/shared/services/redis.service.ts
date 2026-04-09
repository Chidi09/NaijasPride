import IORedis from 'ioredis';

// Lazy Redis connection — only connects if REDIS_URL is set
let _redis: IORedis | null = null;

export const getRedis = (): IORedis | null => {
  if (_redis) return _redis;
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn('[Redis] REDIS_URL not set — caching disabled');
    return null;
  }
  _redis = new IORedis(url, { maxRetriesPerRequest: null });
  _redis.on('error', (err) => console.error('[Redis] Connection error:', err.message));
  return _redis;
};

export const closeRedis = async (): Promise<void> => {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
};

/**
 * Read-through cache helper. Checks Redis first; on miss calls fn(), stores the
 * result under key for ttlSeconds, then returns it. Cache errors are silently
 * swallowed so a Redis outage never breaks the request.
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached) return JSON.parse(cached) as T;
    } catch {
      // ignore — treat as a cache miss
    }
  }

  const result = await fn();

  if (redis) {
    try {
      await redis.set(key, JSON.stringify(result), 'EX', ttlSeconds);
    } catch {
      // ignore — result still served from fn()
    }
  }

  return result;
}
