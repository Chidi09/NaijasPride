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
