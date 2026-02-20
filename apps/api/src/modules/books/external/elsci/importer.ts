import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  discoverElsciLightNovelFiles,
  type ElsciLightNovelFile,
  type ElsciRequestedFormat,
} from './elsci-lightnovels';

export type ElsciLightNovelImportOptions = {
  maxBooks?: number;
  formatPreference?: ElsciRequestedFormat;
  includePattern?: string;
  excludePattern?: string;
  rootPath?: string;
  timeoutMs?: number;
  dryRun: boolean;
};

export type ElsciLightNovelImportResultEntry = {
  href: string;
  slug: string;
  title: string;
  format: 'EPUB' | 'PDF';
  ok: boolean;
  skipped: boolean;
  reason?: string;
};

export type ElsciLightNovelImportResult = {
  mode: 'dry-run' | 'import';
  source: {
    baseUrl: string;
    rootPath: string;
  };
  discovered: number;
  ok: number;
  skipped: number;
  errors: number;
  results: ElsciLightNovelImportResultEntry[];
};

const cleanWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const slugify = (value: string): string =>
  cleanWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const deriveBookYear = (entry: ElsciLightNovelFile): number => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const fromTimestamp = entry.modifiedAtMs ? new Date(entry.modifiedAtMs).getFullYear() : NaN;
  if (Number.isFinite(fromTimestamp) && fromTimestamp >= 1900 && fromTimestamp <= currentYear + 1) {
    return fromTimestamp;
  }
  return currentYear;
};

const buildElsciSlug = (entry: ElsciLightNovelFile): string => {
  const series = slugify(entry.series).slice(0, 40) || 'series';
  const title = slugify(entry.title).slice(0, 60) || 'light-novel';
  const hash = createHash('sha1').update(entry.href).digest('hex').slice(0, 10);
  return `elsci-ln-${series}-${title}-${hash}`;
};

const buildStableDownloadUrl = (href: string): string =>
  `/api/v1/books/external/elsci/file?href=${encodeURIComponent(href)}`;

export const importElsciLightNovelsCatalog = async (
  prisma: PrismaClient,
  options: ElsciLightNovelImportOptions,
): Promise<ElsciLightNovelImportResult> => {
  const maxBooks =
    Number.isFinite(options.maxBooks) && (options.maxBooks as number) > 0
      ? Math.min(options.maxBooks as number, 2_000)
      : 120;

  const selected = await discoverElsciLightNovelFiles({
    maxFiles: maxBooks,
    formatPreference: options.formatPreference || 'epub',
    includePattern: options.includePattern,
    excludePattern: options.excludePattern,
    rootPath: options.rootPath,
    timeoutMs: options.timeoutMs,
  });

  const sourceBaseUrl = (process.env.ELSCI_LIGHT_NOVELS_BASE_URL || 'https://server.elsci.one').trim();
  const sourceRootPath =
    (options.rootPath || process.env.ELSCI_LIGHT_NOVELS_ROOT_PATH || '/Officially%20Translated%20Light%20Novels/').trim();

  const results: ElsciLightNovelImportResultEntry[] = [];
  for (const entry of selected) {
    const slug = buildElsciSlug(entry);
    const title = cleanWhitespace(entry.title || entry.series || 'Light Novel');
    const format = entry.format;

    const payload = {
      title,
      slug,
      author: 'Unknown',
      description: `Imported from Elsci light novel index (${entry.series}).`,
      year: deriveBookYear(entry),
      coverUrl: null,
      downloadUrl: buildStableDownloadUrl(entry.href),
      fileSize: entry.sizeBytes || null,
      format,
      genre: ['Light Novel'],
      language: 'English',
      pageCount: null,
      publisher: 'Elsci',
      downloadCount: 0,
      status: 'active' as const,
    };

    try {
      if (!options.dryRun) {
        await prisma.book.upsert({
          where: { slug },
          create: payload,
          update: {
            title: payload.title,
            author: payload.author,
            description: payload.description,
            year: payload.year,
            coverUrl: payload.coverUrl,
            downloadUrl: payload.downloadUrl,
            fileSize: payload.fileSize,
            format: payload.format,
            genre: payload.genre,
            language: payload.language,
            pageCount: payload.pageCount,
            publisher: payload.publisher,
            downloadCount: payload.downloadCount,
            status: payload.status,
          },
        });
      }

      results.push({
        href: entry.href,
        slug,
        title,
        format,
        ok: true,
        skipped: false,
      });
    } catch (error) {
      results.push({
        href: entry.href,
        slug,
        title,
        format,
        ok: false,
        skipped: false,
        reason: error instanceof Error ? error.message : 'unknown-error',
      });
    }
  }

  const ok = results.filter((entry) => entry.ok).length;
  const skipped = results.filter((entry) => entry.skipped).length;
  const errors = results.filter((entry) => !entry.ok && !entry.skipped).length;

  return {
    mode: options.dryRun ? 'dry-run' : 'import',
    source: {
      baseUrl: sourceBaseUrl,
      rootPath: sourceRootPath,
    },
    discovered: selected.length,
    ok,
    skipped,
    errors,
    results,
  };
};
