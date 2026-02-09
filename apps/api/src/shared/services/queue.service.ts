import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// Lazy Redis + Queue initialization — only connects if REDIS_URL is set
let _connection: IORedis | null = null;
let _queue: Queue | null = null;

const getConnection = (): IORedis | null => {
  if (_connection) return _connection;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  _connection = new IORedis(url, { maxRetriesPerRequest: null });
  _connection.on('error', (err) => console.error('[Queue Redis] Connection error:', err.message));
  return _connection;
};

const getQueue = (): Queue | null => {
  if (_queue) return _queue;
  const connection = getConnection();
  if (!connection) return null;
  _queue = new Queue('torrent-processing', { connection });
  return _queue;
};

export const torrentQueue = { get: getQueue };

export class QueueService {
  async addTorrentJob(magnetLink: string, movieId: string) {
    const queue = getQueue();
    if (!queue) {
      console.warn(`[Queue] REDIS_URL not set — skipping torrent job for movie ${movieId}`);
      return;
    }
    await queue.add('download-torrent', {
      magnetLink,
      movieId,
      timestamp: Date.now(),
    });
    console.log(`[Queue] Added job for movie ${movieId}`);
  }
}
