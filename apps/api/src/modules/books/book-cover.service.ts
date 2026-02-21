import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { PrismaClient } from '@prisma/client';
import axios from 'axios';
import * as cheerio from 'cheerio';
import StreamZip from 'node-stream-zip';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { StorageService } from '../../shared/services/storage.service';
import {
  fetchEpubBooksBookDetail,
  fetchEpubBooksFileStream,
  pickEpubBooksOffer,
} from './external/epubbooks/epubbooks';
import { fetchElsciLightNovelFileStream } from './external/elsci/elsci-lightnovels';

type LoggerLike = Pick<Console, 'info' | 'warn' | 'error'>;

type BookRecord = {
  id: string;
  slug: string;
  title: string;
  format: string;
  publisher: string | null;
  downloadUrl: string | null;
  coverUrl: string | null;
  status: string;
};

type ExtractedCover = {
  buffer: Buffer;
  contentType: string;
  extension: string;
};

type BookCoverResult = {
  updated: boolean;
  reason?: string;
  coverUrl?: string;
  key?: string;
};

const STORAGE_PUBLIC_BASE_URL = (process.env.STORAGE_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL || '').trim();
const BOOK_COVER_TMP_DIR = (process.env.BOOK_COVER_TMP_DIR || path.join(os.tmpdir(), 'naijaspride-book-covers')).trim();
const FFMPEG_PATH = (process.env.FFMPEG_PATH || 'ffmpeg').trim() || 'ffmpeg';

const parsePositiveInt = (value: string | undefined, fallback: number, min: number, max: number): number => {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(min, Math.min(parsed, max));
};

const BOOK_COVER_DOWNLOAD_TIMEOUT_MS = parsePositiveInt(process.env.BOOK_COVER_DOWNLOAD_TIMEOUT_MS, 120_000, 15_000, 5 * 60 * 1000);
const BOOK_COVER_MAX_FILE_BYTES = parsePositiveInt(process.env.BOOK_COVER_MAX_FILE_BYTES, 250 * 1024 * 1024, 5 * 1024 * 1024, 1024 * 1024 * 1024);
const BOOK_COVER_FFMPEG_TIMEOUT_MS = parsePositiveInt(process.env.BOOK_COVER_FFMPEG_TIMEOUT_MS, 120_000, 30_000, 10 * 60 * 1000);

const parseBooleanFlag = (value: string | undefined, fallback: boolean): boolean => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const BOOK_COVER_EXTRACTION_ENABLED = parseBooleanFlag(process.env.BOOK_COVER_EXTRACTION_ENABLED, true);

const toPublicUrl = (baseUrl: string, key: string): string => {
  const trimmedBase = baseUrl.replace(/\/+$/, '');
  const trimmedKey = key.replace(/^\/+/, '');
  return `${trimmedBase}/${trimmedKey}`;
};

const inferFormatFromFilePath = (filePath: string): 'epub' | 'pdf' | null => {
  const lower = (filePath || '').toLowerCase();
  if (lower.endsWith('.epub')) return 'epub';
  if (lower.endsWith('.pdf')) return 'pdf';
  return null;
};

const inferImageTypeFromPath = (filePath: string): { contentType: string; extension: string } => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return { contentType: 'image/png', extension: 'png' };
  if (ext === '.webp') return { contentType: 'image/webp', extension: 'webp' };
  if (ext === '.gif') return { contentType: 'image/gif', extension: 'gif' };
  if (ext === '.avif') return { contentType: 'image/avif', extension: 'avif' };
  if (ext === '.svg') return { contentType: 'image/svg+xml', extension: 'svg' };
  return { contentType: 'image/jpeg', extension: 'jpg' };
};

const extractDownloadKeyFromUrl = (downloadUrl: string): string | null => {
  const raw = (downloadUrl || '').trim();
  if (!raw) return null;
  if (raw.startsWith('books/')) return raw;

  try {
    const parsed = new URL(raw, 'http://localhost');
    const keyParam = parsed.searchParams.get('key');
    if (keyParam && keyParam.trim()) return keyParam.trim();

    const marker = '/books/';
    const index = parsed.pathname.indexOf(marker);
    if (index >= 0) {
      const keyFromPath = parsed.pathname.slice(index + 1).replace(/^\/+/, '');
      if (keyFromPath.trim()) return keyFromPath.trim();
    }
  } catch {
    const match = raw.match(/[?&]key=([^&]+)/i);
    if (match?.[1]) {
      try {
        return decodeURIComponent(match[1]).trim();
      } catch {
        return match[1].trim();
      }
    }
  }

  return null;
};

const extractElsciHrefFromUrl = (downloadUrl: string): string | null => {
  try {
    const parsed = new URL(downloadUrl, 'http://localhost');
    const href = parsed.searchParams.get('href');
    return href && href.trim() ? href.trim() : null;
  } catch {
    return null;
  }
};

const normalizeExternalSlug = (slug: string): string | null => {
  const raw = (slug || '').trim().toLowerCase();
  if (!raw.startsWith('epubbooks-')) return null;
  const extracted = raw.slice('epubbooks-'.length).trim();
  return extracted || null;
};

const isEpubBooksRecord = (book: Pick<BookRecord, 'slug' | 'publisher'>): boolean => {
  const publisher = (book.publisher || '').trim().toLowerCase();
  return book.slug.toLowerCase().startsWith('epubbooks-') || publisher === 'epubbooks';
};

const isElsciRecord = (book: Pick<BookRecord, 'slug' | 'publisher'>): boolean => {
  const publisher = (book.publisher || '').trim().toLowerCase();
  return book.slug.toLowerCase().startsWith('elsci-ln-') || publisher === 'elsci';
};

const getPreferredBookFormat = (book: Pick<BookRecord, 'format' | 'downloadUrl'>): 'epub' | 'pdf' | null => {
  const format = (book.format || '').trim().toLowerCase();
  if (format.includes('epub')) return 'epub';
  if (format.includes('pdf')) return 'pdf';

  const fromUrl = inferFormatFromFilePath(book.downloadUrl || '');
  return fromUrl;
};

const streamToFileWithLimit = async (
  source: NodeJS.ReadableStream,
  destinationPath: string,
  maxBytes: number,
): Promise<void> => {
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        callback(new Error(`book file exceeds max size limit (${maxBytes} bytes)`));
        return;
      }
      callback(null, chunk);
    },
  });

  await pipeline(source as any, limiter, fs.createWriteStream(destinationPath));
};

const runFfmpeg = async (args: string[], timeoutMs: number): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 12_000) {
        stderr = stderr.slice(-12_000);
      }
    });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`ffmpeg timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
    });
  });
};

const collectEpubManifestItems = (xml: cheerio.CheerioAPI): Array<{
  id: string;
  href: string;
  mediaType: string | null;
  properties: string | null;
}> => {
  const result: Array<{ id: string; href: string; mediaType: string | null; properties: string | null }> = [];
  const seen = new Set<string>();

  xml('item, opf\\:item').each((_index, element) => {
    const id = (xml(element).attr('id') || '').trim();
    const href = (xml(element).attr('href') || '').trim();
    if (!href) return;

    const key = `${id}|${href}`;
    if (seen.has(key)) return;
    seen.add(key);

    result.push({
      id,
      href,
      mediaType: (xml(element).attr('media-type') || '').trim() || null,
      properties: (xml(element).attr('properties') || '').trim() || null,
    });
  });

  return result;
};

const pickEpubCoverItem = (
  xml: cheerio.CheerioAPI,
  items: Array<{ id: string; href: string; mediaType: string | null; properties: string | null }>,
) => {
  const coverId =
    (xml('meta[name="cover"], opf\\:meta[name="cover"]').first().attr('content') || '').trim() || null;

  if (coverId) {
    const byMetaCover = items.find((entry) => entry.id === coverId);
    if (byMetaCover) return byMetaCover;
  }

  const byProperty = items.find((entry) =>
    (entry.properties || '')
      .split(/\s+/)
      .map((value) => value.trim().toLowerCase())
      .includes('cover-image'),
  );
  if (byProperty) return byProperty;

  const byLikelyName = items.find((entry) => {
    const haystack = `${entry.id} ${entry.href}`.toLowerCase();
    return (entry.mediaType || '').startsWith('image/') && haystack.includes('cover');
  });
  if (byLikelyName) return byLikelyName;

  return items.find((entry) => (entry.mediaType || '').startsWith('image/')) || null;
};

export class BookCoverService {
  private readonly storageService = new StorageService();

  constructor(private readonly prisma: PrismaClient, private readonly logger: LoggerLike = console) {}

  async processBookCover(bookId: string, options: { force?: boolean } = {}): Promise<BookCoverResult> {
    if (!BOOK_COVER_EXTRACTION_ENABLED) {
      return { updated: false, reason: 'book-cover-extraction-disabled' };
    }

    const normalizedBookId = (bookId || '').trim();
    if (!normalizedBookId) {
      throw new Error('bookId is required');
    }

    const book = await this.prisma.book.findUnique({
      where: { id: normalizedBookId },
      select: {
        id: true,
        slug: true,
        title: true,
        format: true,
        publisher: true,
        downloadUrl: true,
        coverUrl: true,
        status: true,
      },
    });

    if (!book) return { updated: false, reason: 'book-not-found' };
    if (book.status === 'deleted') return { updated: false, reason: 'book-deleted' };
    if (book.coverUrl && !options.force) return { updated: false, reason: 'cover-already-present' };

    const tempDir = path.join(BOOK_COVER_TMP_DIR, book.id, String(Date.now()));
    await fs.promises.mkdir(tempDir, { recursive: true });

    try {
      const preferredFormat = getPreferredBookFormat(book);
      const sourceExt = preferredFormat ? `.${preferredFormat}` : '';
      const sourcePath = path.join(tempDir, `source${sourceExt}`);

      const downloadedFormat = await this.downloadBookSourceToFile(book, sourcePath);
      const effectiveFormat = downloadedFormat || preferredFormat || inferFormatFromFilePath(sourcePath);
      if (!effectiveFormat) {
        return { updated: false, reason: 'unsupported-book-format' };
      }

      let extracted: ExtractedCover;
      if (effectiveFormat === 'epub') {
        extracted = await this.extractCoverFromEpub(sourcePath);
      } else {
        extracted = await this.extractCoverFromPdf(sourcePath, tempDir);
      }

      const key = `covers/books/${book.slug}.${extracted.extension}`;
      await StorageService.getClient().send(
        new PutObjectCommand({
          Bucket: StorageService.getBucket(),
          Key: key,
          Body: extracted.buffer,
          ContentType: extracted.contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );

      const coverUrl = STORAGE_PUBLIC_BASE_URL
        ? toPublicUrl(STORAGE_PUBLIC_BASE_URL, key)
        : `/api/v1/books/download?key=${encodeURIComponent(key)}`;

      await this.prisma.book.update({
        where: { id: book.id },
        data: { coverUrl },
      });

      this.logger.info(`[BookCoverWorker] Cover extracted for book ${book.id}`);
      return { updated: true, coverUrl, key };
    } finally {
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors.
      }
    }
  }

  private async downloadBookSourceToFile(book: BookRecord, destinationPath: string): Promise<'epub' | 'pdf' | null> {
    // If the book file is already mirrored to R2, stream directly from S3
    // (avoids DNS resolution issues with public URLs inside worker containers).
    const r2Key = extractDownloadKeyFromUrl(book.downloadUrl || '');
    if (r2Key && r2Key.startsWith('books/')) {
      const s3Response = await StorageService.getClient().send(
        new GetObjectCommand({
          Bucket: StorageService.getBucket(),
          Key: r2Key,
        }),
      );
      if (!s3Response.Body) {
        throw new Error(`R2 returned empty body for key: ${r2Key}`);
      }
      await streamToFileWithLimit(s3Response.Body as NodeJS.ReadableStream, destinationPath, BOOK_COVER_MAX_FILE_BYTES);
      return inferFormatFromFilePath(r2Key);
    }

    if (isEpubBooksRecord(book)) {
      const externalSlug = normalizeExternalSlug(book.slug);
      if (!externalSlug) {
        throw new Error(`Invalid epubBooks slug: ${book.slug}`);
      }

      const detail = await fetchEpubBooksBookDetail(externalSlug);
      const offer = pickEpubBooksOffer(detail.offers, 'epub');
      if (!offer) {
        throw new Error(`No downloadable epubBooks offer found for ${book.slug}`);
      }

      const upstream = await fetchEpubBooksFileStream(offer.dlid);
      await streamToFileWithLimit(upstream.stream, destinationPath, BOOK_COVER_MAX_FILE_BYTES);
      return 'epub';
    }

    if (isElsciRecord(book)) {
      if (!book.downloadUrl) {
        throw new Error(`Missing downloadUrl for Elsci book ${book.id}`);
      }

      const href = extractElsciHrefFromUrl(book.downloadUrl);
      if (!href) {
        throw new Error(`Invalid Elsci href for ${book.id}`);
      }

      const upstream = await fetchElsciLightNovelFileStream(href);
      await streamToFileWithLimit(upstream.stream, destinationPath, BOOK_COVER_MAX_FILE_BYTES);
      return inferFormatFromFilePath(href);
    }

    if (!book.downloadUrl) {
      throw new Error(`Missing downloadUrl for book ${book.id}`);
    }

    const downloadUrl = await this.resolveDownloadUrl(book.downloadUrl);
    const response = await axios.get(downloadUrl, {
      timeout: BOOK_COVER_DOWNLOAD_TIMEOUT_MS,
      responseType: 'stream',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      validateStatus: (status) => status >= 200 && status < 400,
    });

    await streamToFileWithLimit(response.data, destinationPath, BOOK_COVER_MAX_FILE_BYTES);
    return inferFormatFromFilePath(downloadUrl);
  }

  private async resolveDownloadUrl(rawDownloadUrl: string): Promise<string> {
    const normalized = (rawDownloadUrl || '').trim();
    if (!normalized) {
      throw new Error('downloadUrl is empty');
    }

    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
      return normalized;
    }

    const key = extractDownloadKeyFromUrl(normalized) || (normalized.startsWith('books/') ? normalized : null);
    if (key) {
      return this.storageService.getDownloadUrl(key, { expiresInSeconds: 60 * 60 });
    }

    throw new Error(`Unsupported download URL format: ${normalized}`);
  }

  private async extractCoverFromEpub(epubPath: string): Promise<ExtractedCover> {
    const zip = new StreamZip.async({ file: epubPath });
    try {
      const containerXmlBuffer = await zip.entryData('META-INF/container.xml');
      const containerXml = cheerio.load(containerXmlBuffer.toString('utf8'), { xmlMode: true });
      const opfPath = (containerXml('rootfile').first().attr('full-path') || '').trim();
      if (!opfPath) {
        throw new Error('EPUB container.xml missing OPF reference');
      }

      const opfBuffer = await zip.entryData(opfPath);
      const opfXml = cheerio.load(opfBuffer.toString('utf8'), { xmlMode: true });
      const items = collectEpubManifestItems(opfXml);
      if (!items.length) {
        throw new Error('EPUB manifest contains no items');
      }

      const coverItem = pickEpubCoverItem(opfXml, items);
      if (!coverItem) {
        throw new Error('EPUB cover image not found in manifest');
      }

      const opfDir = path.posix.dirname(opfPath);
      const href = coverItem.href.replace(/\\/g, '/').replace(/^\/+/, '');
      const entryPath = path.posix.normalize(path.posix.join(opfDir, href));
      const imageBuffer = await zip.entryData(entryPath);

      const fallbackType = inferImageTypeFromPath(entryPath);
      const contentType = coverItem.mediaType || fallbackType.contentType;
      const extension = inferImageTypeFromPath(`cover.${contentType.split('/')[1] || fallbackType.extension}`).extension;

      return {
        buffer: imageBuffer,
        contentType,
        extension,
      };
    } catch (error) {
      throw new Error(`EPUB cover extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await zip.close();
    }
  }

  private async extractCoverFromPdf(pdfPath: string, tempDir: string): Promise<ExtractedCover> {
    const outputPath = path.join(tempDir, 'cover.jpg');

    await runFfmpeg(
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        pdfPath,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        outputPath,
      ],
      BOOK_COVER_FFMPEG_TIMEOUT_MS,
    );

    const imageBuffer = await fs.promises.readFile(outputPath);
    return {
      buffer: imageBuffer,
      contentType: 'image/jpeg',
      extension: 'jpg',
    };
  }
}
