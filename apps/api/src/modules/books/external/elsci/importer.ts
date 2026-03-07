import { createHash } from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { PrismaClient } from '@prisma/client';
import {
  discoverElsciLightNovelFiles,
  fetchElsciLightNovelFileStream,
  type ElsciLightNovelFile,
  type ElsciRequestedFormat,
} from './elsci-lightnovels';
import { extractEpubMetadata, uploadCoverImage } from '../cover-extractor.service';
import { StorageService } from '../../../../shared/services/storage.service';

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

const parseVolumeNumber = (title: string): number | null => {
  const patterns = [
    /\bvol(?:ume)?\.?\s*(\d{1,4})\b/i,
    /\bv\.?\s*(\d{1,4})\b/i,
    /\bpart\s*(\d{1,4})\b/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (!match?.[1]) continue;
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
};

const buildElsciDescription = (entry: ElsciLightNovelFile): string => {
  const volumeNumber = parseVolumeNumber(entry.title);
  const lines = [
    'Imported from Elsci light novel index.',
    `Series: ${entry.series}`,
    `Volume: ${volumeNumber ?? 'Unknown'}`,
    `Source file: ${entry.fileName}`,
  ];
  return lines.join('\n');
};

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

const streamToBuffer = async (stream: NodeJS.ReadableStream, maxBytes: number): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array | string>) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += part.length;
    if (total > maxBytes) {
      throw new Error(`Elsci file exceeds mirror limit (${maxBytes} bytes)`);
    }
    chunks.push(part);
  }

  return Buffer.concat(chunks, total);
};

export const importElsciLightNovelsCatalog = async (
  prisma: PrismaClient,
  options: ElsciLightNovelImportOptions,
): Promise<ElsciLightNovelImportResult> => {
  const storageService = new StorageService();
  const shouldMirrorToR2 = (process.env.ELSCI_MIRROR_TO_R2 || 'true').trim().toLowerCase() !== 'false';
  const mirrorMaxBytes = Number.parseInt(process.env.ELSCI_MIRROR_MAX_BYTES || `${80 * 1024 * 1024}`, 10);
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
    let downloadUrl = buildStableDownloadUrl(entry.href);
    let fileSize = entry.sizeBytes || null;

    let coverUrl: string | null = null;
    let extractedAuthor: string | null = null;

    // Extract cover AND author from EPUB metadata in a single download pass
    if (format === 'EPUB' && !options.dryRun) {
      try {
        console.log(`[ElsciImporter] Extracting metadata from EPUB for "${title}"...`);
        const fullUrl = `${sourceBaseUrl}${entry.href}`;
        const { coverBuffer, author } = await extractEpubMetadata(fullUrl);

        if (coverBuffer) {
          console.log(`[ElsciImporter] ✓ Extracted cover from EPUB for "${title}"`);
          coverUrl = await uploadCoverImage(storageService, slug, coverBuffer);
          console.log(`[ElsciImporter] ✓ Uploaded cover for "${title}"`);
        } else {
          console.log(`[ElsciImporter] ✗ No cover found in EPUB for "${title}"`);
        }

        if (author) {
          extractedAuthor = author;
          console.log(`[ElsciImporter] ✓ Extracted author: "${author}" for "${title}"`);
        } else {
          console.log(`[ElsciImporter] ✗ No author found in EPUB metadata for "${title}"`);
        }
      } catch (error) {
        console.error(`[ElsciImporter] Failed to extract metadata for "${title}":`, error);
      }
    }

    if (!options.dryRun && shouldMirrorToR2) {
      try {
        const upstream = await fetchElsciLightNovelFileStream(entry.href, { timeoutMs: 120_000 });
        const ext = format === 'PDF' ? 'pdf' : 'epub';
        const storageKey = `books/elsci/${slug}.${ext}`;
        const contentType = format === 'PDF' ? 'application/pdf' : 'application/epub+zip';
        const body = await streamToBuffer(upstream.stream, Number.isFinite(mirrorMaxBytes) && mirrorMaxBytes > 0
          ? mirrorMaxBytes
          : 80 * 1024 * 1024);

        await StorageService.getClient().send(
          new PutObjectCommand({
            Bucket: StorageService.getBucket(),
            Key: storageKey,
            Body: body,
            ContentType: contentType,
          }),
        );

        downloadUrl = `/api/v1/books/download?key=${encodeURIComponent(storageKey)}`;
        fileSize = body.byteLength;
      } catch (error) {
        console.warn(
          `[ElsciImporter] Mirror skipped for "${title}": ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const payload = {
      title,
      slug,
      author: extractedAuthor || 'Unknown',
      description: buildElsciDescription(entry),
      year: deriveBookYear(entry),
      coverUrl,
      downloadUrl,
      fileSize,
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
