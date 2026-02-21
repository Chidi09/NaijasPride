/**
 * Anna's Archive Mirror Harvester
 *
 * Uses Playwright (Chromium) to navigate Anna's Archive md5 pages,
 * find the actual download links, download files via in-browser fetch,
 * and upload them to R2 storage.
 *
 * This mirrors the Elsci harvester pattern:
 *   1. Launch headless Chromium via Playwright
 *   2. Navigate to Anna's Archive → solve any Cloudflare/CAPTCHA
 *   3. Query DB for unmirrored Anna's Archive books
 *   4. For each book: visit md5 page → find download link → fetch file → base64 → Node
 *   5. Upload to R2 under `books/annas/<slug>.<ext>`
 *   6. Update DB downloadUrl to local path
 *   7. Close browser
 */

import { chromium, type Browser, type Page } from 'playwright';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { PrismaClient } from '@prisma/client';
import { StorageService } from '../../../../shared/services/storage.service';

// ── Types ────────────────────────────────────────────────────────────────────

export type AnnasMirrorResult = {
  attempted: number;
  mirrored: number;
  skipped: number;
  failed: number;
  errors: string[];
};

export type AnnasMirrorOptions = {
  batchSize?: number;
  perFileTimeoutMs?: number;
  maxFileSizeBytes?: number;
  delayBetweenDownloadsMs?: number;
  dryRun?: boolean;
};

// ── Constants ────────────────────────────────────────────────────────────────

const ANNAS_HOSTS = [
  'https://annas-archive.li',
  'https://annas-archive.se',
];

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const CHALLENGE_WAIT_MS = 8_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

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
 * Navigate to Anna's Archive and wait for any challenge to resolve.
 */
const solveChallenge = async (page: Page, baseUrl: string): Promise<void> => {
  console.log(`[AnnasMirror] Navigating to ${baseUrl}/ to solve challenge...`);

  await page.goto(`${baseUrl}/`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(CHALLENGE_WAIT_MS);

  const title = await page.title();
  console.log(`[AnnasMirror] After challenge wait — title: "${title}"`);

  if (title.toLowerCase().includes('checking') || title.toLowerCase().includes('just a moment')) {
    console.log('[AnnasMirror] Still on challenge page, waiting another 15s...');
    await page.waitForTimeout(15_000);
  }
};

/**
 * Visit an Anna's Archive /md5/<hash> page and extract all download links.
 * 
 * Anna's Archive md5 pages show multiple download options:
 *   - "Slow Partner Server" links (direct downloads from various mirrors)
 *   - Library Genesis mirrors
 *   - IPFS links
 *   - Z-Library links
 *
 * We look for links that contain actual file download URLs, prioritizing
 * direct download links from libgen/ipfs mirrors.
 */
const findDownloadLinks = async (
  page: Page,
  md5Url: string,
): Promise<string[]> => {
  console.log(`[AnnasMirror] Visiting md5 page: ${md5Url}`);

  await page.goto(md5Url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(3_000);

  // Extract download links from the page, prioritized by reliability:
  // 1. LibGen mirrors (direct file downloads, no auth needed)
  // 2. Direct file links (.epub/.pdf URLs)
  // 3. Slow partner server links (may require waiting but no login)
  // fast_download links are EXCLUDED — they require a paid account/login.
  const links = await page.evaluate(() => {
    const anchors = document.querySelectorAll('a[href]');
    const libgenLinks: string[] = [];
    const directFileLinks: string[] = [];
    const slowPartnerLinks: string[] = [];

    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      const text = (a.textContent || '').toLowerCase();

      // Skip fast_download — requires paid account/login
      if (href.includes('/fast_download/') || text.includes('fast partner') || text.includes('fast download')) {
        continue;
      }

      // LibGen mirrors — highest priority (direct downloads)
      if (
        href.includes('libgen.') ||
        href.includes('library.lol') ||
        href.includes('libgen.li') ||
        href.includes('libgen.gs') ||
        href.includes('lib-nwcdljpfb3ferhycbhb.b-cdn.net')
      ) {
        libgenLinks.push(href);
        continue;
      }

      // Direct file links (epub/pdf)
      if (
        href.match(/\.(epub|pdf|mobi|azw3?)(\?|$)/i) &&
        !href.includes('javascript:')
      ) {
        directFileLinks.push(href);
        continue;
      }

      // Slow partner server links (free but may require waiting)
      if (
        href.includes('/slow_download/') ||
        text.includes('slow partner') ||
        text.includes('slow download')
      ) {
        slowPartnerLinks.push(href);
        continue;
      }
    }

    // Return in priority order: libgen first, then direct files, then slow partner
    return [...libgenLinks, ...directFileLinks, ...slowPartnerLinks];
  });

  console.log(`[AnnasMirror] Found ${links.length} potential download links on md5 page`);
  return links;
};

/**
 * Try to download a file from a URL using the browser's fetch API.
 * Returns base64-encoded file data.
 */
const downloadFileViaBrowser = async (
  page: Page,
  fileUrl: string,
  maxBytes: number,
  timeoutMs: number,
): Promise<{ base64: string; size: number; contentType: string } | null> => {
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
          return { error: `File too large: ${contentLength} bytes`, status: 200 };
        }

        const arrayBuffer = await resp.arrayBuffer();

        if (arrayBuffer.byteLength > maxSize) {
          return { error: `File too large: ${arrayBuffer.byteLength} bytes`, status: 200 };
        }

        // Convert to base64 in chunks
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
    console.warn(`[AnnasMirror] Download failed from ${fileUrl}: ${result.error}`);
    return null;
  }

  return {
    base64: (result as { base64: string }).base64,
    size: (result as { size: number }).size,
    contentType: (result as { contentType: string }).contentType,
  };
};

/**
 * Navigate to a download link page (e.g. /slow_download/...) and
 * attempt to get the actual file. Some pages redirect directly,
 * others show a "click here" page.
 */
const downloadFromPartnerLink = async (
  page: Page,
  partnerUrl: string,
  maxBytes: number,
  timeoutMs: number,
): Promise<{ base64: string; size: number; contentType: string } | null> => {
  // First try direct fetch
  const direct = await downloadFileViaBrowser(page, partnerUrl, maxBytes, timeoutMs);
  if (direct && direct.size > 1024) {
    // Sanity check: not an HTML page
    const preview = Buffer.from(direct.base64.slice(0, 200), 'base64').toString('utf-8');
    if (!preview.includes('<html') && !preview.includes('<!DOCTYPE')) {
      return direct;
    }
  }

  // If direct fetch returned HTML, navigate to the page and look for
  // the actual download link or wait for redirect
  console.log(`[AnnasMirror] Partner link returned HTML, navigating to page: ${partnerUrl}`);
  await page.goto(partnerUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(5_000);

  // Look for download link on the partner page
  const downloadUrl = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href]');
    for (const a of links) {
      const href = a.getAttribute('href') || '';
      const text = (a.textContent || '').toLowerCase();
      if (
        href.match(/\.(epub|pdf|mobi)(\?|$)/i) ||
        text.includes('download') ||
        href.includes('/get/') ||
        href.includes('/download/')
      ) {
        return href;
      }
    }
    return null;
  });

  if (downloadUrl) {
    // Make the URL absolute if relative
    const absoluteUrl = downloadUrl.startsWith('http')
      ? downloadUrl
      : new URL(downloadUrl, page.url()).toString();
    console.log(`[AnnasMirror] Found download URL on partner page: ${absoluteUrl}`);
    return downloadFileViaBrowser(page, absoluteUrl, maxBytes, timeoutMs);
  }

  return null;
};

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
 * Run the Anna's Archive mirror harvester.
 *
 * Queries DB for Anna's Archive books whose downloadUrl still points to
 * an external Anna's Archive URL (e.g. https://annas-archive.li/md5/...),
 * launches Playwright, visits each md5 page, finds download links,
 * downloads the file, and uploads to R2.
 */
export const runAnnasMirrorHarvester = async (
  prisma: PrismaClient,
  options: AnnasMirrorOptions = {},
): Promise<AnnasMirrorResult> => {
  const batchSize = Math.min(options.batchSize || 10, 50);
  const perFileTimeoutMs = options.perFileTimeoutMs ?? 120_000;
  const maxFileSizeBytes = options.maxFileSizeBytes ?? MAX_FILE_SIZE_BYTES;
  const delayMs = options.delayBetweenDownloadsMs ?? 5_000;
  const dryRun = options.dryRun ?? false;

  const result: AnnasMirrorResult = {
    attempted: 0,
    mirrored: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  // 1. Find unmirrored Anna's Archive books
  const unmirrored = await prisma.book.findMany({
    where: {
      OR: [
        { publisher: { equals: "Anna's Archive", mode: 'insensitive' } },
        { downloadUrl: { startsWith: 'https://annas-archive' } },
      ],
      downloadUrl: { startsWith: 'https://' },
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
    console.log('[AnnasMirror] No unmirrored Anna\'s Archive books found. Nothing to do.');
    return result;
  }

  console.log(`[AnnasMirror] Found ${unmirrored.length} unmirrored Anna's Archive books.`);

  if (dryRun) {
    console.log('[AnnasMirror] DRY RUN — would mirror these:');
    for (const book of unmirrored) {
      console.log(`  - ${book.slug} (${book.title})`);
    }
    result.attempted = unmirrored.length;
    result.skipped = unmirrored.length;
    return result;
  }

  // 2. Launch browser
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

    // Pick a working host
    let activeHost = ANNAS_HOSTS[0]!;
    for (const host of ANNAS_HOSTS) {
      try {
        await solveChallenge(page, host);
        activeHost = host;
        break;
      } catch (err) {
        console.warn(`[AnnasMirror] Host ${host} challenge failed, trying next...`);
      }
    }

    // 3. Process each book
    for (const book of unmirrored) {
      result.attempted++;

      // Extract md5 hash from the downloadUrl
      const md5Match = (book.downloadUrl || '').match(/\/md5\/([a-f0-9]+)/i);
      if (!md5Match?.[1]) {
        const msg = `${book.slug}: could not extract md5 from downloadUrl: ${book.downloadUrl}`;
        console.warn(`[AnnasMirror] ${msg}`);
        result.errors.push(msg);
        result.failed++;
        continue;
      }

      const md5 = md5Match[1].toLowerCase();
      const md5Url = `${activeHost}/md5/${md5}`;
      const ext = (book.format || 'epub').toLowerCase() === 'pdf' ? 'pdf' : 'epub';
      const storageKey = `books/annas/${book.slug}.${ext}`;
      const contentType = ext === 'pdf' ? 'application/pdf' : 'application/epub+zip';

      console.log(
        `[AnnasMirror] [${result.attempted}/${unmirrored.length}] Processing: ${book.title}`,
      );

      try {
        // Visit md5 page and find download links
        const downloadLinks = await findDownloadLinks(page, md5Url);

        if (downloadLinks.length === 0) {
          const msg = `${book.slug}: no download links found on md5 page`;
          console.warn(`[AnnasMirror] ${msg}`);
          result.errors.push(msg);
          result.failed++;
          continue;
        }

        // Try each download link until one works
        let downloaded = false;
        for (const link of downloadLinks) {
          const absoluteLink = link.startsWith('http')
            ? link
            : new URL(link, `${activeHost}/`).toString();

          console.log(`[AnnasMirror] Trying download link: ${absoluteLink}`);

          const fileData = await downloadFromPartnerLink(
            page,
            absoluteLink,
            maxFileSizeBytes,
            perFileTimeoutMs,
          );

          if (fileData && fileData.size > 1024) {
            const buffer = Buffer.from(fileData.base64, 'base64');

            // Sanity: ensure it's not HTML
            const preview = buffer.toString('utf-8', 0, Math.min(500, buffer.length));
            if (preview.includes('<html') || preview.includes('<!DOCTYPE') || preview.includes('challenge-platform')) {
              console.warn(`[AnnasMirror] Got HTML instead of file from ${absoluteLink}, trying next link...`);
              continue;
            }

            // Upload to R2
            await uploadToR2(storageKey, buffer, contentType);

            // Update DB
            const localUrl = `/api/v1/books/download?key=${encodeURIComponent(storageKey)}`;
            await prisma.book.update({
              where: { id: book.id },
              data: {
                downloadUrl: localUrl,
                fileSize: fileData.size,
              },
            });

            console.log(
              `[AnnasMirror] Mirrored "${book.title}" (${(fileData.size / 1024 / 1024).toFixed(1)} MB) -> ${storageKey}`,
            );
            result.mirrored++;
            downloaded = true;
            break;
          }
        }

        if (!downloaded) {
          const msg = `${book.slug}: all download links failed`;
          console.warn(`[AnnasMirror] ${msg}`);
          result.errors.push(msg);
          result.failed++;
        }

        // Navigate back to base to keep cookies fresh
        if (result.attempted < unmirrored.length) {
          try {
            await page.goto(`${activeHost}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
            await page.waitForTimeout(2_000);
          } catch {
            // ignore nav errors
          }
        }
      } catch (error) {
        const msg = `${book.slug}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[AnnasMirror] Failed: ${msg}`);
        result.errors.push(msg);
        result.failed++;
      }

      // Delay between books to avoid rate limiting
      if (result.attempted < unmirrored.length) {
        await sleep(delayMs);
      }
    }
  } catch (error) {
    const msg = `Browser-level error: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[AnnasMirror] ${msg}`);
    result.errors.push(msg);
    const remaining = unmirrored.length - result.attempted;
    result.failed += remaining;
    result.attempted += remaining;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }

  console.log(
    `[AnnasMirror] Batch complete: ${result.mirrored} mirrored, ${result.failed} failed, ${result.skipped} skipped`,
  );

  return result;
};
