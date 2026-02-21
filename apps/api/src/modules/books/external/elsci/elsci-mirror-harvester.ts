/**
 * Elsci Mirror Harvester
 *
 * Uses Playwright (Chromium) to solve Cloudflare challenges natively,
 * then downloads Elsci light novel files from *within* the browser
 * context using `page.evaluate(fetch(...))` — which inherits the solved
 * TLS fingerprint + cookies automatically. The binary file data is
 * returned as a base64 string, decoded in Node, and uploaded to R2.
 *
 * Flow:
 *   1. Launch headless Chromium via Playwright
 *   2. Navigate to Elsci root → Cloudflare challenge auto-solves
 *   3. Query DB for unmirrored Elsci books
 *   4. For each book: use in-browser `fetch()` to download → base64 → Node
 *   5. Upload to R2 under `books/elsci/<slug>.<ext>`
 *   6. Update DB downloadUrl to local path
 *   7. Close browser
 */

import { chromium, type Browser, type Page } from 'playwright';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { PrismaClient } from '@prisma/client';
import { StorageService } from '../../../../shared/services/storage.service';

// ── Types ────────────────────────────────────────────────────────────────────

export type MirrorResult = {
  attempted: number;
  mirrored: number;
  skipped: number;
  failed: number;
  errors: string[];
  reAuthCount: number;
};

export type MirrorOptions = {
  batchSize?: number;
  maxReAuthAttempts?: number;
  perFileTimeoutMs?: number;
  maxFileSizeBytes?: number;
  delayBetweenDownloadsMs?: number;
  dryRun?: boolean;
};

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_ELSCI_BASE_URL = 'https://server.elsci.one';
const MAX_FILE_SIZE_BYTES = 80 * 1024 * 1024; // 80 MB
const CHALLENGE_WAIT_MS = 12_000; // time to let Cloudflare JS challenge complete

// ── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const getBaseUrl = (): string =>
  (process.env.ELSCI_LIGHT_NOVELS_BASE_URL || DEFAULT_ELSCI_BASE_URL).trim().replace(/\/+$/, '') ||
  DEFAULT_ELSCI_BASE_URL;

/**
 * Launch a headless Chromium browser suitable for solving Cloudflare.
 */
const launchBrowser = async (): Promise<Browser> => {
  return chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
    ],
  });
};

/**
 * Navigate to Elsci and wait for any Cloudflare challenge to resolve.
 * Returns the page (which now has valid cookies / fingerprint).
 */
const solveChallenge = async (page: Page, baseUrl: string): Promise<void> => {
  console.log(`[ElsciMirror] Navigating to ${baseUrl}/ to solve challenge...`);

  await page.goto(`${baseUrl}/`, { waitUntil: 'load', timeout: 60_000 });
  // Give Cloudflare JS challenge time to complete
  await page.waitForTimeout(CHALLENGE_WAIT_MS);

  // Check if we landed on the real page (h5ai) or are still on a challenge page
  const title = await page.title();
  const url = page.url();
  console.log(`[ElsciMirror] After challenge wait — title: "${title}", url: ${url}`);

  // If still on a challenge page, wait a bit more
  if (title.toLowerCase().includes('checking') || title.toLowerCase().includes('just a moment')) {
    console.log('[ElsciMirror] Still on challenge page, waiting another 15s...');
    await page.waitForTimeout(15_000);
    const title2 = await page.title();
    console.log(`[ElsciMirror] After extra wait — title: "${title2}"`);
  }
};

/**
 * Download a file using the browser's fetch() API.
 *
 * This runs inside the Chromium browser context, so it inherits the TLS
 * fingerprint and all cookies that passed Cloudflare. The file is read as
 * an ArrayBuffer, converted to base64, and returned to Node.
 *
 * For files > ~30 MB, we chunk the base64 conversion to avoid V8 stack
 * overflow on btoa() with very large strings.
 */
const downloadFileViaBrowser = async (
  page: Page,
  fileUrl: string,
  maxBytes: number,
  timeoutMs: number,
): Promise<{ base64: string; size: number; contentType: string }> => {
  const result = await page.evaluate(
    async ({ url, maxSize, timeout }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const resp = await fetch(url, {
          signal: controller.signal,
          credentials: 'include',
          redirect: 'follow',
        });

        if (!resp.ok) {
          return { error: `HTTP ${resp.status} ${resp.statusText}`, status: resp.status };
        }

        const contentType = resp.headers.get('content-type') || 'application/octet-stream';
        const contentLength = parseInt(resp.headers.get('content-length') || '0', 10);

        if (contentLength > maxSize) {
          return { error: `File too large: ${contentLength} bytes (max ${maxSize})`, status: 200 };
        }

        const arrayBuffer = await resp.arrayBuffer();

        if (arrayBuffer.byteLength > maxSize) {
          return { error: `File too large: ${arrayBuffer.byteLength} bytes (max ${maxSize})`, status: 200 };
        }

        // Convert to base64 in chunks to avoid stack overflow
        const bytes = new Uint8Array(arrayBuffer);
        const CHUNK = 32768;
        let binary = '';
        for (let i = 0; i < bytes.length; i += CHUNK) {
          const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
          binary += String.fromCharCode(...slice);
        }
        const b64 = btoa(binary);

        return {
          base64: b64,
          size: arrayBuffer.byteLength,
          contentType,
          error: null,
          status: resp.status,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { error: msg, status: 0 };
      } finally {
        clearTimeout(timer);
      }
    },
    { url: fileUrl, maxSize: maxBytes, timeout: timeoutMs },
  );

  if (result.error) {
    const err = new Error(result.error) as Error & { status?: number };
    err.status = result.status ?? 0;
    throw err;
  }

  return {
    base64: (result as { base64: string }).base64,
    size: (result as { size: number }).size,
    contentType: (result as { contentType: string }).contentType,
  };
};

/**
 * Upload a file buffer to R2 storage.
 */
const uploadToR2 = async (key: string, body: Buffer, contentType: string): Promise<void> => {
  await StorageService.getClient().send(
    new PutObjectCommand({
      Bucket: StorageService.getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
};

// ── Main Harvester ───────────────────────────────────────────────────────────

/**
 * Run the mirror harvester.
 *
 * Queries DB for Elsci books whose downloadUrl still points to the
 * external proxy endpoint (`/api/v1/books/external/elsci/file?href=`),
 * launches Playwright to solve Cloudflare, then uses in-browser fetch
 * to download files and upload them to R2.
 */
export const runElsciMirrorHarvester = async (
  prisma: PrismaClient,
  options: MirrorOptions = {},
): Promise<MirrorResult> => {
  const batchSize = Math.min(options.batchSize || 20, 100);
  const maxReAuth = options.maxReAuthAttempts ?? 3;
  const perFileTimeoutMs = options.perFileTimeoutMs ?? 120_000;
  const maxFileSizeBytes = options.maxFileSizeBytes ?? MAX_FILE_SIZE_BYTES;
  const delayMs = options.delayBetweenDownloadsMs ?? 3_000;
  const dryRun = options.dryRun ?? false;
  const baseUrl = getBaseUrl();

  const result: MirrorResult = {
    attempted: 0,
    mirrored: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    reAuthCount: 0,
  };

  // 1. Find unmirrored Elsci books
  const unmirrored = await prisma.book.findMany({
    where: {
      OR: [
        { publisher: { contains: 'elsci', mode: 'insensitive' } },
        { slug: { startsWith: 'elsci-ln-' } },
      ],
      downloadUrl: { startsWith: '/api/v1/books/external/elsci/file' },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      format: true,
      downloadUrl: true,
    },
    orderBy: { updatedAt: 'asc' },
    take: batchSize,
  });

  if (unmirrored.length === 0) {
    console.log('[ElsciMirror] No unmirrored books found. Nothing to do.');
    return result;
  }

  console.log(`[ElsciMirror] Found ${unmirrored.length} unmirrored Elsci books.`);

  if (dryRun) {
    console.log('[ElsciMirror] DRY RUN — would mirror these:');
    for (const book of unmirrored) {
      console.log(`  - ${book.slug} (${book.title})`);
    }
    result.attempted = unmirrored.length;
    result.skipped = unmirrored.length;
    return result;
  }

  // 2. Launch browser and solve Cloudflare
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    browser = await launchBrowser();
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
    });
    page = await context.newPage();

    await solveChallenge(page, baseUrl);

    // 3. Process each book
    for (const book of unmirrored) {
      result.attempted++;

      // Extract the href from the downloadUrl
      const hrefMatch = (book.downloadUrl || '').match(/[?&]href=([^&]+)/);
      if (!hrefMatch?.[1]) {
        const msg = `${book.slug}: could not extract href from downloadUrl`;
        console.warn(`[ElsciMirror] ${msg}`);
        result.errors.push(msg);
        result.failed++;
        continue;
      }

      const href = decodeURIComponent(hrefMatch[1]);
      const fileUrl = new URL(href.startsWith('/') ? href : `/${href}`, `${baseUrl}/`).toString();
      const ext = (book.format || 'epub').toLowerCase() === 'pdf' ? 'pdf' : 'epub';
      const storageKey = `books/elsci/${book.slug}.${ext}`;
      const contentType = ext === 'pdf' ? 'application/pdf' : 'application/epub+zip';

      console.log(
        `[ElsciMirror] [${result.attempted}/${unmirrored.length}] Downloading: ${book.title}`,
      );

      let downloaded = false;
      let retries = 0;

      while (!downloaded && retries <= maxReAuth) {
        try {
          const { base64, size } = await downloadFileViaBrowser(
            page,
            fileUrl,
            maxFileSizeBytes,
            perFileTimeoutMs,
          );

          const buffer = Buffer.from(base64, 'base64');

          // Sanity: check it's not an HTML challenge page
          if (buffer.length < 2048) {
            const preview = buffer.toString('utf-8', 0, Math.min(500, buffer.length));
            if (
              preview.includes('<html') ||
              preview.includes('<!DOCTYPE') ||
              preview.includes('challenge-platform')
            ) {
              throw Object.assign(
                new Error('Received HTML challenge page instead of file'),
                { status: 403 },
              );
            }
          }

          // Upload to R2
          await uploadToR2(storageKey, buffer, contentType);

          // Update DB
          const localUrl = `/api/v1/books/download?key=${encodeURIComponent(storageKey)}`;
          await prisma.book.update({
            where: { id: book.id },
            data: {
              downloadUrl: localUrl,
              fileSize: size,
            },
          });

          console.log(
            `[ElsciMirror] Mirrored "${book.title}" (${(size / 1024 / 1024).toFixed(1)} MB) -> ${storageKey}`,
          );
          result.mirrored++;
          downloaded = true;
        } catch (error) {
          const status = (error as { status?: number }).status ?? 0;
          const isBlock = status === 403 || status === 429 || status === 503;

          if (isBlock && retries < maxReAuth) {
            retries++;
            result.reAuthCount++;
            console.warn(
              `[ElsciMirror] Blocked (${status}). Re-navigating to solve challenge (attempt ${retries}/${maxReAuth})...`,
            );

            try {
              await solveChallenge(page, baseUrl);
              console.log('[ElsciMirror] Re-solved challenge.');
              continue; // retry this file
            } catch (reAuthError) {
              const msg = `${book.slug}: re-auth failed: ${reAuthError instanceof Error ? reAuthError.message : String(reAuthError)}`;
              console.error(`[ElsciMirror] ${msg}`);
              result.errors.push(msg);
              result.failed++;
              downloaded = true;
            }
          } else {
            const msg = `${book.slug}: ${error instanceof Error ? error.message : String(error)}`;
            console.error(`[ElsciMirror] Failed: ${msg}`);
            result.errors.push(msg);
            result.failed++;
            downloaded = true;
          }
        }
      }

      // Delay between downloads
      if (result.attempted < unmirrored.length) {
        await sleep(delayMs);
      }
    }
  } catch (error) {
    const msg = `Browser-level error: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[ElsciMirror] ${msg}`);
    result.errors.push(msg);
    // Mark remaining as failed
    const remaining = unmirrored.length - result.attempted;
    result.failed += remaining;
    result.attempted += remaining;
  } finally {
    // Always close browser
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }

  console.log(
    `[ElsciMirror] Batch complete: ${result.mirrored} mirrored, ${result.failed} failed, ${result.skipped} skipped, ${result.reAuthCount} re-auths`,
  );

  return result;
};
