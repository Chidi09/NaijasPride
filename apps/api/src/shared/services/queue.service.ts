import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// Lazy Redis + Queue initialization — only connects if REDIS_URL is set
let _connection: IORedis | null = null;
const _queues = new Map<string, Queue>();

const getConnection = (): IORedis | null => {
  if (_connection) return _connection;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  _connection = new IORedis(url, { maxRetriesPerRequest: null });
  _connection.on('error', (err) => console.error('[Queue Redis] Connection error:', err.message));
  return _connection;
};

const getQueue = (name: string): Queue | null => {
  const normalized = (name || '').trim();
  if (!normalized) return null;
  const existing = _queues.get(normalized);
  if (existing) return existing;
  const connection = getConnection();
  if (!connection) return null;
  const queue = new Queue(normalized, { connection });
  _queues.set(normalized, queue);
  return queue;
};

export const torrentQueue = { get: () => getQueue('torrent-processing') };
export const bookImportQueue = { get: () => getQueue('book-import') };
export const bookCoverQueue = { get: () => getQueue('book-cover-processing') };
export const elsciMirrorQueue = { get: () => getQueue('elsci-mirror') };
export const annasMirrorQueue = { get: () => getQueue('annas-mirror') };
export const remoteIngestQueue = { get: () => getQueue('remote-ingest-processing') };
export const remoteIngestDeadLetterQueue = { get: () => getQueue('remote-ingest-dead-letter') };

export type RemoteIngestJobPayload = {
  movieId: string;
  sourcePageUrl?: string;
  sourceStreamUrl?: string;
  provider?: 'generic' | 'soap2day';
  referer?: string;
  headers?: Record<string, string>;
};

export type AnnasMirrorJobPayload = {
  batchSize?: number;
  perFileTimeoutMs?: number;
  maxFileSizeBytes?: number;
  delayBetweenDownloadsMs?: number;
  dryRun?: boolean;
  triggeredBy?: string;
};

export type BookCoverJobPayload = {
  bookId: string;
  force?: boolean;
  reason?: string;
};

export class QueueService {
  async addTorrentJob(magnetLink: string, movieId: string) {
    const queue = torrentQueue.get();
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

  async addBookImportJob(payload: Record<string, unknown>) {
    const queue = bookImportQueue.get();
    if (!queue) {
      console.warn(`[Queue] REDIS_URL not set — skipping book import job`);
      return;
    }
    await queue.add('import-books', payload, {
      removeOnComplete: true,
      removeOnFail: false,
    });
    console.log(`[Queue] Added book import job`);
  }

  async addBookCoverJob(payload: BookCoverJobPayload) {
    const queue = bookCoverQueue.get();
    if (!queue) {
      console.warn('[Queue] REDIS_URL not set — skipping book cover job');
      return;
    }

    if (!payload.bookId || !payload.bookId.trim()) {
      throw new Error('bookId is required for book cover extraction job');
    }

    const attemptsRaw = Number.parseInt(process.env.BOOK_COVER_JOB_ATTEMPTS || '3', 10);
    const attempts = Number.isFinite(attemptsRaw) && attemptsRaw > 0 ? Math.min(attemptsRaw, 8) : 3;
    const backoffMsRaw = Number.parseInt(process.env.BOOK_COVER_JOB_BACKOFF_MS || '30000', 10);
    const backoffMs = Number.isFinite(backoffMsRaw) && backoffMsRaw > 0 ? Math.min(backoffMsRaw, 10 * 60 * 1000) : 30_000;

    const jobId = `book-cover-${payload.bookId.trim()}`;

    try {
      await queue.add('extract-book-cover', {
        ...payload,
        bookId: payload.bookId.trim(),
        timestamp: Date.now(),
      }, {
        jobId,
        removeOnComplete: true,
        removeOnFail: false,
        attempts,
        backoff: {
          type: 'exponential',
          delay: backoffMs,
        },
      });
      console.log(`[Queue] Added book cover job for book ${payload.bookId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/job.+exists/i.test(message)) {
        return;
      }
      throw error;
    }
  }

  async addAnnasMirrorJob(payload: AnnasMirrorJobPayload = {}) {
    const queue = annasMirrorQueue.get();
    if (!queue) {
      console.warn('[Queue] REDIS_URL not set — skipping Anna\'s Archive mirror job');
      return;
    }

    const jobId = `annas-mirror:${Date.now()}`;

    await queue.add('mirror-annas-books', {
      ...payload,
      timestamp: Date.now(),
    }, {
      jobId,
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 1, // Harvester handles retries internally per-book
    });
    console.log(`[Queue] Added Anna's Archive mirror job (batch=${payload.batchSize || 10}, dryRun=${!!payload.dryRun})`);
  }

  async addRemoteIngestJob(payload: RemoteIngestJobPayload) {
    const queue = remoteIngestQueue.get();
    if (!queue) {
      console.warn('[Queue] REDIS_URL not set — skipping remote ingest job');
      return;
    }
    const attemptsRaw = Number.parseInt(process.env.REMOTE_INGEST_JOB_ATTEMPTS || '3', 10);
    const attempts = Number.isFinite(attemptsRaw) && attemptsRaw > 0 ? Math.min(attemptsRaw, 8) : 3;
    const backoffMsRaw = Number.parseInt(process.env.REMOTE_INGEST_JOB_BACKOFF_MS || '30000', 10);
    const backoffMs = Number.isFinite(backoffMsRaw) && backoffMsRaw > 0 ? Math.min(backoffMsRaw, 10 * 60 * 1000) : 30_000;

    await queue.add('ingest-remote-stream', {
      ...payload,
      timestamp: Date.now(),
    }, {
      removeOnComplete: true,
      removeOnFail: false,
      attempts,
      backoff: {
        type: 'exponential',
        delay: backoffMs,
      },
    });
    console.log(`[Queue] Added remote ingest job for movie ${payload.movieId}`);
  }
}
