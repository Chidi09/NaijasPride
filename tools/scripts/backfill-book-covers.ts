import path from 'node:path';
import dotenv from 'dotenv';
import { Prisma, PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const parsePositiveInt = (value: string | undefined, fallback: number, min: number, max: number): number => {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(min, Math.min(parsed, max));
};

const hasArg = (name: string): boolean => process.argv.includes(name);

const readArgValue = (name: string): string | undefined => {
  const index = process.argv.findIndex((arg) => arg === name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
};

const limit = parsePositiveInt(readArgValue('--limit'), 1_000, 1, 200_000);
const batchSize = parsePositiveInt(readArgValue('--batch'), 100, 1, 1_000);
const attempts = parsePositiveInt(readArgValue('--attempts'), Number.parseInt(process.env.BOOK_COVER_JOB_ATTEMPTS || '3', 10), 1, 8);
const backoffMs = parsePositiveInt(
  readArgValue('--backoff-ms'),
  Number.parseInt(process.env.BOOK_COVER_JOB_BACKOFF_MS || '30000', 10),
  1_000,
  10 * 60 * 1_000,
);
const force = hasArg('--force');
const dryRun = hasArg('--dry-run');

const REDIS_URL = (process.env.REDIS_URL || '').trim();

if (!REDIS_URL) {
  console.error('[BackfillBookCovers] REDIS_URL is required.');
  process.exit(1);
}

const prisma = new PrismaClient();
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue('book-cover-processing', { connection });

const run = async () => {
  console.log('[BackfillBookCovers] Starting...');
  console.log(
    JSON.stringify(
      {
        limit,
        batchSize,
        force,
        dryRun,
        attempts,
        backoffMs,
      },
      null,
      2,
    ),
  );

  const where: Prisma.BookWhereInput = {
    status: 'active',
    ...(force ? {} : { OR: [{ coverUrl: null }, { coverUrl: '' }] }),
  };

  let cursor: string | null = null;
  let scanned = 0;
  let queued = 0;

  while (scanned < limit) {
    const take = Math.min(batchSize, limit - scanned);
    const books = await prisma.book.findMany({
      where,
      orderBy: { id: 'asc' },
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
      take,
      select: {
        id: true,
        slug: true,
        coverUrl: true,
      },
    });

    if (books.length === 0) {
      break;
    }

    scanned += books.length;
    cursor = books[books.length - 1]?.id || null;

    for (const book of books) {
      const payload = {
        bookId: book.id,
        force,
        reason: 'backfill-script',
        timestamp: Date.now(),
      };

      if (!dryRun) {
        try {
          await queue.add('extract-book-cover', payload, {
            jobId: `book-cover:${book.id}`,
            removeOnComplete: true,
            removeOnFail: false,
            attempts,
            backoff: {
              type: 'exponential',
              delay: backoffMs,
            },
          });
          queued++;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (/job.+exists/i.test(message)) {
            continue;
          }
          console.error(`[BackfillBookCovers] Failed queue add for ${book.slug}: ${message}`);
        }
      }
    }

    console.log(`[BackfillBookCovers] Progress: scanned=${scanned} queued=${queued}`);
  }

  console.log(
    JSON.stringify(
      {
        scanned,
        queued,
        limit,
        force,
        dryRun,
      },
      null,
      2,
    ),
  );
};

run()
  .catch((error) => {
    console.error('[BackfillBookCovers] Failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await queue.close();
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
  });
