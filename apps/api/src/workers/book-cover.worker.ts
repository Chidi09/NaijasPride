import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { BookCoverService } from '../modules/books/book-cover.service';

type BookCoverJobData = {
  bookId: string;
  force?: boolean;
  reason?: string;
  timestamp?: number;
};

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  console.error('[BookCoverWorker] REDIS_URL is not set. Exiting.');
  process.exit(1);
}

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

const prisma = new PrismaClient();
const coverService = new BookCoverService(prisma, console);

const parsePositiveInt = (value: string | undefined, fallback: number, min: number, max: number): number => {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(min, Math.min(parsed, max));
};

const worker = new Worker(
  'book-cover-processing',
  async (job) => {
    const payload = (job.data || {}) as BookCoverJobData;
    if (!payload.bookId || !payload.bookId.trim()) {
      throw new Error('bookId is required for book cover extraction');
    }

    console.log(`[BookCoverWorker] Processing job ${job.id} for book ${payload.bookId}`);

    const result = await coverService.processBookCover(payload.bookId.trim(), {
      force: !!payload.force,
    });

    if (result.updated) {
      console.log(`[BookCoverWorker] Cover ready for book ${payload.bookId}: ${result.coverUrl || result.key || 'ok'}`);
    } else {
      console.log(`[BookCoverWorker] Cover skipped for book ${payload.bookId}: ${result.reason || 'no-change'}`);
    }

    return result;
  },
  {
    connection,
    concurrency: parsePositiveInt(process.env.BOOK_COVER_WORKER_CONCURRENCY, 2, 1, 6),
  },
);

worker.on('completed', (job) => {
  console.log(`[BookCoverWorker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[BookCoverWorker] Job ${job?.id} failed: ${err.message}`);
});

const shutdown = async () => {
  try {
    await worker.close();
  } catch {
    // ignore
  }

  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }

  try {
    await connection.quit();
  } catch {
    // ignore
  }

  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
