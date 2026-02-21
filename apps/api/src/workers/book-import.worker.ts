import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { importEpubBooksCatalog, type EpubBooksImportOptions, type EpubBooksImportSort } from '../modules/books/external/epubbooks/importer';
import {
  importElsciLightNovelsCatalog,
  type ElsciLightNovelImportOptions,
} from '../modules/books/external/elsci/importer';

type EpubBooksImportJobData = {
  source: 'epubbooks';
  mode: 'manual' | 'auto';
  options?: Partial<EpubBooksImportOptions> & {
    sort?: EpubBooksImportSort;
  };
  requestedByUserId?: string;
  requestedAt?: number;
};

type ElsciImportJobData = {
  source: 'elsci-lightnovels';
  mode: 'manual';
  options?: Partial<ElsciLightNovelImportOptions>;
  requestedByUserId?: string;
  requestedAt?: number;
};

type BookImportJobData = EpubBooksImportJobData | ElsciImportJobData;

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  console.error('[BookImportWorker] REDIS_URL is not set. Exiting.');
  process.exit(1);
}

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

const coverQueue = new Queue('book-cover-processing', { connection });

const prisma = new PrismaClient();

const AUTO_CURSOR_KEY = (process.env.EPUBBOOKS_AUTO_IMPORT_CURSOR_KEY || 'np:epubbooks:auto:page').trim();
const AUTO_DEFAULT_SORT = ((process.env.EPUBBOOKS_AUTO_IMPORT_SORT || 'title').trim().toLowerCase() as EpubBooksImportSort) || 'title';
const AUTO_DEFAULT_MAX_BOOKS = Number.parseInt(process.env.EPUBBOOKS_AUTO_IMPORT_MAX_BOOKS || '8', 10);
const AUTO_DEFAULT_CONCURRENCY = Number.parseInt(process.env.EPUBBOOKS_AUTO_IMPORT_CONCURRENCY || '2', 10);
const MAX_RETURN_RESULTS = Number.parseInt(process.env.BOOK_IMPORT_MAX_RETURN_RESULTS || '200', 10);

const clampInt = (value: unknown, fallback: number, min = 1, max = 1_000_000) => {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  const n = Math.floor(parsed);
  return Math.max(min, Math.min(max, n));
};

const readAutoCursor = async (): Promise<number> => {
  try {
    const raw = await connection.get(AUTO_CURSOR_KEY);
    const page = Number.parseInt(raw || '1', 10);
    return Number.isFinite(page) && page > 0 ? page : 1;
  } catch {
    return 1;
  }
};

const writeAutoCursor = async (page: number): Promise<void> => {
  const next = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  await connection.set(AUTO_CURSOR_KEY, String(next));
};

const buildSafeReturnValue = (result: any) => {
  if (!result || typeof result !== 'object') return result;
  const list = Array.isArray(result.results) ? result.results : [];
  const cap = Number.isFinite(MAX_RETURN_RESULTS) && MAX_RETURN_RESULTS > 0 ? MAX_RETURN_RESULTS : 200;
  return {
    ...result,
    results: list.slice(0, cap),
    resultsTruncated: list.length > cap,
  };
};

const enqueueBookCoverJobsBySlugs = async (slugs: string[]): Promise<number> => {
  const uniqueSlugs = Array.from(new Set(slugs.map((value) => value.trim()).filter(Boolean)));
  if (uniqueSlugs.length === 0) return 0;

  const books = await prisma.book.findMany({
    where: {
      slug: { in: uniqueSlugs },
      status: 'active',
      OR: [{ coverUrl: null }, { coverUrl: '' }],
    },
    select: { id: true, slug: true },
  });

  if (books.length === 0) return 0;

  const attemptsRaw = Number.parseInt(process.env.BOOK_COVER_JOB_ATTEMPTS || '3', 10);
  const attempts = Number.isFinite(attemptsRaw) && attemptsRaw > 0 ? Math.min(attemptsRaw, 8) : 3;
  const backoffMsRaw = Number.parseInt(process.env.BOOK_COVER_JOB_BACKOFF_MS || '30000', 10);
  const backoffMs = Number.isFinite(backoffMsRaw) && backoffMsRaw > 0 ? Math.min(backoffMsRaw, 10 * 60 * 1000) : 30_000;

  let enqueued = 0;
  for (const book of books) {
    try {
      await coverQueue.add('extract-book-cover', {
        bookId: book.id,
        reason: 'book-import',
        timestamp: Date.now(),
      }, {
        jobId: `book-cover:${book.id}`,
        removeOnComplete: true,
        removeOnFail: false,
        attempts,
        backoff: {
          type: 'exponential',
          delay: backoffMs,
        },
      });
      enqueued++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/job.+exists/i.test(message)) {
        continue;
      }
      console.error(`[BookImportWorker] Failed to enqueue cover job for ${book.slug}: ${message}`);
    }
  }

  return enqueued;
};

const extractSuccessfulSlugs = (result: any): string[] => {
  if (!result || typeof result !== 'object') return [];
  const rows: Array<{ ok?: boolean; slug?: unknown }> = Array.isArray(result.results) ? result.results : [];
  return rows
    .filter((entry) => entry && entry.ok === true)
    .map((entry) => String(entry.slug || '').trim())
    .filter(Boolean);
};

const worker = new Worker(
  'book-import',
  async (job) => {
    const data = job.data as BookImportJobData;
    if (!data || !data.source) {
      throw new Error('Unsupported import source');
    }

    if (data.source === 'elsci-lightnovels') {
      const mode = data.mode || 'manual';
      if (mode !== 'manual') {
        throw new Error('elsci-lightnovels import only supports manual mode');
      }

      const opts = data.options || {};
      const maxBooks = typeof opts.maxBooks === 'undefined' ? 120 : clampInt(opts.maxBooks, 120, 1, 2000);
      const formatPreference =
        opts.formatPreference === 'pdf' || opts.formatPreference === 'any' || opts.formatPreference === 'epub'
          ? opts.formatPreference
          : 'epub';
      const includePattern = typeof opts.includePattern === 'string' ? opts.includePattern.trim() : undefined;
      const excludePattern = typeof opts.excludePattern === 'string' ? opts.excludePattern.trim() : undefined;
      const rootPath = typeof opts.rootPath === 'string' && opts.rootPath.trim() ? opts.rootPath.trim() : undefined;
      const dryRun = !!opts.dryRun;

      const result = await importElsciLightNovelsCatalog(prisma, {
        maxBooks,
        formatPreference,
        includePattern,
        excludePattern,
        rootPath,
        dryRun,
      });

      if (!dryRun) {
        const slugs = extractSuccessfulSlugs(result);
        const queued = await enqueueBookCoverJobsBySlugs(slugs);
        if (queued > 0) {
          console.log(`[BookImportWorker] Queued ${queued} book cover jobs (elsci-lightnovels)`);
        }
      }

      return buildSafeReturnValue(result);
    }

    if (data.mode === 'auto') {
      const currentPage = await readAutoCursor();

      const sort = (data.options?.sort || AUTO_DEFAULT_SORT) as EpubBooksImportSort;
      const maxBooks = clampInt(data.options?.maxBooks, AUTO_DEFAULT_MAX_BOOKS, 1, 100);
      const concurrency = clampInt(data.options?.concurrency, AUTO_DEFAULT_CONCURRENCY, 1, 6);

      const result = await importEpubBooksCatalog(prisma, {
        startPage: currentPage,
        endPage: currentPage,
        sort,
        maxBooks,
        concurrency,
        dryRun: false,
      });

      const autoSlugs = extractSuccessfulSlugs(result);
      const autoQueued = await enqueueBookCoverJobsBySlugs(autoSlugs);
      if (autoQueued > 0) {
        console.log(`[BookImportWorker] Queued ${autoQueued} book cover jobs (epubbooks auto)`);
      }

      // If we hit a blank page, assume end of catalog and reset.
      const nextPage = result.discovered > 0 ? currentPage + 1 : 1;
      await writeAutoCursor(nextPage);

      return buildSafeReturnValue({
        ...result,
        auto: {
          cursorKey: AUTO_CURSOR_KEY,
          fromPage: currentPage,
          nextPage,
        },
      });
    }

    // Manual job
    const opts = data.options || {};
    const sort = ((opts.sort || 'title') as EpubBooksImportSort) || 'title';
    const startPage = clampInt(opts.startPage, 1, 1, 500);
    const endPage = clampInt(opts.endPage, startPage, 1, 500);
    const concurrency = clampInt(opts.concurrency, 3, 1, 6);
    const maxBooks = typeof opts.maxBooks === 'undefined' ? undefined : clampInt(opts.maxBooks, 100, 1, 5000);
    const dryRun = !!opts.dryRun;

    const result = await importEpubBooksCatalog(prisma, {
      startPage,
      endPage,
      sort,
      maxBooks,
      concurrency,
      dryRun,
    });

    if (!dryRun) {
      const slugs = extractSuccessfulSlugs(result);
      const queued = await enqueueBookCoverJobsBySlugs(slugs);
      if (queued > 0) {
        console.log(`[BookImportWorker] Queued ${queued} book cover jobs (epubbooks manual)`);
      }
    }

    return buildSafeReturnValue(result);
  },
  {
    connection,
    concurrency: clampInt(process.env.BOOK_IMPORT_WORKER_CONCURRENCY, 1, 1, 4),
  }
);

worker.on('completed', (job) => {
  console.log(`[BookImportWorker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[BookImportWorker] Job ${job?.id} failed: ${err.message}`);
});

const shutdown = async () => {
  try {
    await worker.close();
  } catch {
    // ignore
  }
  try {
    await coverQueue.close();
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
