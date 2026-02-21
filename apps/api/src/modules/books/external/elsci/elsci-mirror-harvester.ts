/**
 * Elsci Mirror Harvester
 *
 * Uses FlareSolverr to solve the Cloudflare challenge once, then reuses
 * the `cf_clearance` cookie + matching user-agent to batch-download
 * Elsci light novel files and upload them to R2 storage.
 *
 * Flow:
 *   1. Solve challenge via FlareSolverr → get cf_clearance + user-agent
 *   2. Query DB for unmirrored Elsci books
 *   3. Download each file using solved cookies
 *   4. Upload to R2 under `books/elsci/<slug>.<ext>`
 *   5. Update DB downloadUrl to local path
 *
 * If the cookie expires mid-batch (403), re-solve and continue.
 */

import axios from 'axios';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { PrismaClient } from '@prisma/client';
import { StorageService } from '../../../../shared/services/storage.service';

// ── Types ────────────────────────────────────────────────────────────────────

type SolvedSession = {
  cookieHeader: string;
  userAgent: string;
  solvedAt: number;
};

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
const DEFAULT_FLARESOLVERR_URL = 'http://flaresolverr:8191';
const FLARESOLVERR_SESSION = 'np-elsci-mirror';
const CHALLENGE_STATUS_CODES = new Set([403, 429, 503, 520, 521, 522, 523]);
const MAX_FILE_SIZE_BYTES = 80 * 1024 * 1024; // 80 MB

// ── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const getBaseUrl = (): string =>
  (process.env.ELSCI_LIGHT_NOVELS_BASE_URL || DEFAULT_ELSCI_BASE_URL).trim().replace(/\/+$/, '') ||
  DEFAULT_ELSCI_BASE_URL;

const getFlaresolverrUrl = (): string =>
  (process.env.FLARESOLVERR_URL || DEFAULT_FLARESOLVERR_URL).trim().replace(/\/+$/, '') ||
  DEFAULT_FLARESOLVERR_URL;

const isChallenge = (status: number | null | undefined): boolean =>
  typeof status === 'number' && CHALLENGE_STATUS_CODES.has(status);

/**
 * Solve the Cloudflare challenge via FlareSolverr and return cookies.
 */
const solveChallenge = async (baseUrl: string, timeoutMs = 60_000): Promise<SolvedSession> => {
  const flareUrl = getFlaresolverrUrl();

  // Destroy any stale session first, then create fresh
  try {
    await axios.post(
      `${flareUrl}/v1`,
      { cmd: 'sessions.destroy', session: FLARESOLVERR_SESSION },
      { timeout: 10_000, validateStatus: () => true },
    );
  } catch {
    // ignore — session may not exist
  }

  await sleep(500);

  // Create a fresh session and navigate to the Elsci root
  const response = await axios.post(
    `${flareUrl}/v1`,
    {
      cmd: 'request.get',
      session: FLARESOLVERR_SESSION,
      url: `${baseUrl}/`,
      maxTimeout: timeoutMs,
    },
    {
      timeout: Math.max(65_000, timeoutMs + 10_000),
      validateStatus: () => true,
    },
  );

  const data = response.data;
  if (!data || data.status !== 'ok' || !data.solution) {
    throw new Error(`FlareSolverr challenge solve failed: ${data?.message || 'unknown error'}`);
  }

  const cookies: Array<{ name?: string; value?: string }> = data.solution.cookies || [];
  const cfClearance = cookies.find((c) => c.name === 'cf_clearance');
  const phpSession = cookies.find((c) => c.name === 'PHPSESSID');

  if (!cfClearance?.value) {
    throw new Error('FlareSolverr solved but no cf_clearance cookie returned');
  }

  const parts: string[] = [];
  if (cfClearance?.value) parts.push(`cf_clearance=${cfClearance.value}`);
  if (phpSession?.value) parts.push(`PHPSESSID=${phpSession.value}`);

  // Also include any other cookies that might be relevant
  for (const c of cookies) {
    if (c.name && c.value && c.name !== 'cf_clearance' && c.name !== 'PHPSESSID') {
      parts.push(`${c.name}=${c.value}`);
    }
  }

  const userAgent =
    typeof data.solution.userAgent === 'string' && data.solution.userAgent.length > 10
      ? data.solution.userAgent
      : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

  return {
    cookieHeader: parts.join('; '),
    userAgent,
    solvedAt: Date.now(),
  };
};

/**
 * Download a single file from Elsci using solved cookies.
 * Returns the file buffer on success, or throws on failure.
 */
const downloadFile = async (
  fileUrl: string,
  session: SolvedSession,
  options: { timeoutMs: number; maxBytes: number },
): Promise<{ buffer: Buffer; contentType: string | null }> => {
  const response = await axios.get(fileUrl, {
    timeout: options.timeoutMs,
    responseType: 'arraybuffer',
    maxContentLength: options.maxBytes,
    maxBodyLength: options.maxBytes,
    headers: {
      'user-agent': session.userAgent,
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.9',
      referer: `${getBaseUrl()}/`,
      origin: getBaseUrl(),
      cookie: session.cookieHeader,
    },
    validateStatus: (status) => status >= 200 && status < 400,
  });

  return {
    buffer: Buffer.from(response.data),
    contentType: typeof response.headers['content-type'] === 'string' ? response.headers['content-type'] : null,
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
 * solves Cloudflare once, then batch-downloads and uploads to R2.
 */
export const runElsciMirrorHarvester = async (
  prisma: PrismaClient,
  options: MirrorOptions = {},
): Promise<MirrorResult> => {
  const batchSize = Math.min(options.batchSize || 20, 100);
  const maxReAuth = options.maxReAuthAttempts ?? 3;
  const perFileTimeoutMs = options.perFileTimeoutMs ?? 120_000;
  const maxFileSizeBytes = options.maxFileSizeBytes ?? MAX_FILE_SIZE_BYTES;
  const delayMs = options.delayBetweenDownloadsMs ?? 2_000;
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

  console.log(`[ElsciMirror] Found ${unmirrored.length} unmirrored Elsci books. Solving challenge...`);

  if (dryRun) {
    console.log('[ElsciMirror] DRY RUN — would mirror these:');
    for (const book of unmirrored) {
      console.log(`  - ${book.slug} (${book.title})`);
    }
    result.attempted = unmirrored.length;
    result.skipped = unmirrored.length;
    return result;
  }

  // 2. Solve Cloudflare challenge
  let session: SolvedSession;
  try {
    session = await solveChallenge(baseUrl);
    console.log(`[ElsciMirror] Challenge solved. Cookie obtained (${session.cookieHeader.length} chars).`);
  } catch (error) {
    const msg = `Challenge solve failed: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[ElsciMirror] ${msg}`);
    result.errors.push(msg);
    result.failed = unmirrored.length;
    result.attempted = unmirrored.length;
    return result;
  }

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

    console.log(`[ElsciMirror] [${result.attempted}/${unmirrored.length}] Downloading: ${book.title}`);

    let downloaded = false;
    let retries = 0;

    while (!downloaded && retries <= maxReAuth) {
      try {
        const { buffer } = await downloadFile(fileUrl, session, {
          timeoutMs: perFileTimeoutMs,
          maxBytes: maxFileSizeBytes,
        });

        // Sanity check: file should be > 1KB (not an HTML challenge page)
        if (buffer.length < 1024) {
          const preview = buffer.toString('utf-8', 0, Math.min(200, buffer.length));
          if (preview.includes('<html') || preview.includes('<!DOCTYPE') || preview.includes('challenge')) {
            throw Object.assign(new Error('Received HTML challenge page instead of file'), {
              response: { status: 403 },
            });
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
            fileSize: buffer.byteLength,
          },
        });

        console.log(
          `[ElsciMirror] ✓ Mirrored "${book.title}" (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB) → ${storageKey}`,
        );
        result.mirrored++;
        downloaded = true;
      } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : null;

        if (isChallenge(status) && retries < maxReAuth) {
          retries++;
          result.reAuthCount++;
          console.warn(
            `[ElsciMirror] Cookie expired (${status}). Re-solving challenge (attempt ${retries}/${maxReAuth})...`,
          );

          try {
            session = await solveChallenge(baseUrl);
            console.log('[ElsciMirror] Re-solved challenge successfully.');
            // Retry this file immediately after re-auth
            continue;
          } catch (reAuthError) {
            const msg = `${book.slug}: re-auth failed: ${reAuthError instanceof Error ? reAuthError.message : String(reAuthError)}`;
            console.error(`[ElsciMirror] ${msg}`);
            result.errors.push(msg);
            result.failed++;
            downloaded = true; // Exit inner loop
          }
        } else {
          const msg = `${book.slug}: ${error instanceof Error ? error.message : String(error)}`;
          console.error(`[ElsciMirror] ✗ ${msg}`);
          result.errors.push(msg);
          result.failed++;
          downloaded = true; // Exit inner loop
        }
      }
    }

    // Delay between downloads to be polite
    if (result.attempted < unmirrored.length) {
      await sleep(delayMs);
    }
  }

  console.log(
    `[ElsciMirror] Batch complete: ${result.mirrored} mirrored, ${result.failed} failed, ${result.skipped} skipped, ${result.reAuthCount} re-auths`,
  );

  return result;
};
