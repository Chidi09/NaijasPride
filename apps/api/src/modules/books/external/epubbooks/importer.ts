import type { PrismaClient } from '@prisma/client';
import {
  fetchEpubBooksBookDetail,
  fetchEpubBooksCatalogPage,
  parseEpubBooksCatalogPageHtml,
  pickEpubBooksOffer,
} from './epubbooks';

export type EpubBooksImportSort = 'title' | 'released';

export type EpubBooksImportOptions = {
  startPage: number;
  endPage: number;
  sort: EpubBooksImportSort;
  maxBooks?: number;
  concurrency: number;
  dryRun: boolean;
};

export type EpubBooksImportResultEntry = {
  externalSlug: string;
  slug: string;
  ok: boolean;
  skipped: boolean;
  reason?: string;
};

export type EpubBooksImportResult = {
  mode: 'dry-run' | 'import';
  pages: { start: number; end: number; sort: EpubBooksImportSort };
  discovered: number;
  ok: number;
  skipped: number;
  errors: number;
  results: EpubBooksImportResultEntry[];
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      const current = cursor++;
      if (current >= items.length) return;
      results[current] = await mapper(items[current] as T, current);
    }
  });

  await Promise.all(workers);
  return results;
};

const clampPage = (value: number) => {
  const page = Number.isFinite(value) ? Math.floor(value) : 1;
  return page > 0 ? page : 1;
};

export const discoverEpubBooksSlugs = async (options: {
  startPage: number;
  endPage: number;
  sort: EpubBooksImportSort;
  maxBooks?: number;
  politeDelayMs?: number;
}): Promise<string[]> => {
  const startPage = clampPage(Math.min(options.startPage, options.endPage));
  const endPage = clampPage(Math.max(options.startPage, options.endPage));
  const maxBooks = options.maxBooks;
  const politeDelayMs = Number.isFinite(options.politeDelayMs) ? (options.politeDelayMs as number) : 250;

  const discovered = new Set<string>();
  for (let page = startPage; page <= endPage; page++) {
    const html = await fetchEpubBooksCatalogPage(page, options.sort);
    const slugs = parseEpubBooksCatalogPageHtml(html);
    for (const slug of slugs) {
      discovered.add(slug);
      if (maxBooks && discovered.size >= maxBooks) break;
    }
    if (maxBooks && discovered.size >= maxBooks) break;
    await sleep(politeDelayMs);
  }

  return Array.from(discovered);
};

export const importEpubBooksCatalog = async (
  prisma: PrismaClient,
  options: EpubBooksImportOptions
): Promise<EpubBooksImportResult> => {
  const startPage = clampPage(Math.min(options.startPage, options.endPage));
  const endPage = clampPage(Math.max(options.startPage, options.endPage));
  const concurrency = Math.max(1, Math.min(options.concurrency || 1, 8));
  const maxBooks = options.maxBooks;

  const externalSlugs = await discoverEpubBooksSlugs({
    startPage,
    endPage,
    sort: options.sort,
    maxBooks,
    politeDelayMs: 250,
  });

  const results = await mapWithConcurrency(externalSlugs, concurrency, async (externalSlug) => {
    const internalSlug = `epubbooks-${externalSlug}`;
    try {
      const detail = await fetchEpubBooksBookDetail(externalSlug);
      if (!detail.title || !detail.author) {
        return {
          externalSlug,
          slug: internalSlug,
          ok: false,
          skipped: true,
          reason: 'missing-title-or-author',
        } satisfies EpubBooksImportResultEntry;
      }

      const year = detail.year;
      if (!year || year < 1400 || year > new Date().getFullYear() + 1) {
        return {
          externalSlug,
          slug: internalSlug,
          ok: false,
          skipped: true,
          reason: `invalid-year:${year ?? 'null'}`,
        } satisfies EpubBooksImportResultEntry;
      }

      const offer = pickEpubBooksOffer(detail.offers, 'epub');
      const fileSize = offer?.fileSizeBytes ?? null;

      const createData = {
        title: detail.title,
        slug: internalSlug,
        author: detail.author,
        description: detail.description || undefined,
        year,
        coverUrl: detail.coverUrl || undefined,
        // Stable internal URL. The API streams/proxies the external bytes.
        downloadUrl: `/api/v1/books/${encodeURIComponent(internalSlug)}/file?disposition=attachment&format=epub`,
        fileSize: fileSize ?? undefined,
        format: 'EPUB',
        genre: detail.subjects.length > 0 ? detail.subjects : ['General'],
        language: detail.language || 'English',
        pageCount: detail.pageCount ?? undefined,
        publisher: 'epubBooks',
        downloadCount: detail.downloadCount ?? 0,
        status: 'active' as const,
      };

      if (!options.dryRun) {
        await prisma.book.upsert({
          where: { slug: internalSlug },
          create: createData,
          update: {
            title: createData.title,
            author: createData.author,
            description: createData.description,
            year: createData.year,
            coverUrl: createData.coverUrl,
            downloadUrl: createData.downloadUrl,
            fileSize: createData.fileSize,
            format: createData.format,
            genre: createData.genre,
            language: createData.language,
            pageCount: createData.pageCount,
            publisher: createData.publisher,
            downloadCount: createData.downloadCount,
            status: createData.status,
          },
        });
      }

      return {
        externalSlug,
        slug: internalSlug,
        ok: true,
        skipped: false,
      } satisfies EpubBooksImportResultEntry;
    } catch (error) {
      return {
        externalSlug,
        slug: internalSlug,
        ok: false,
        skipped: false,
        reason: error instanceof Error ? error.message : 'unknown-error',
      } satisfies EpubBooksImportResultEntry;
    } finally {
      await sleep(150);
    }
  });

  const okCount = results.filter((r) => r.ok).length;
  const skippedCount = results.filter((r) => r.skipped).length;
  const errorCount = results.filter((r) => !r.ok && !r.skipped).length;

  return {
    mode: options.dryRun ? 'dry-run' : 'import',
    pages: { start: startPage, end: endPage, sort: options.sort },
    discovered: externalSlugs.length,
    ok: okCount,
    skipped: skippedCount,
    errors: errorCount,
    results,
  };
};
