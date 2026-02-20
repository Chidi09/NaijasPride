import { chromium } from 'playwright';

export type RemoteProvider = 'generic' | 'soap2day';

export type StreamCandidate = {
  url: string;
  host: string;
  status: number;
  contentType: string;
  kind: 'hls' | 'mp4' | 'other';
  referer?: string;
};

export type ResolveStreamResult = {
  provider: RemoteProvider;
  pageUrl: string;
  streamUrl: string;
  kind: 'hls' | 'mp4' | 'other';
  referer?: string;
  host: string;
  hostAllowed: boolean;
  candidates: StreamCandidate[];
};

export type ResolverOptions = {
  provider?: RemoteProvider;
  timeoutMs?: number;
  captureWindowMs?: number;
  allowedHosts?: string[];
  userAgent?: string;
};

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_CAPTURE_WINDOW_MS = 15_000;
const SOAP2DAY_MAX_IFRAME_HOPS = 4;
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36';

const MEDIA_HOST_BLOCKLIST = [/doubleclick\./i, /googlesyndication\./i, /googlevideo\.com\/(?:generate_204|api\/stats)/i];

const PLAY_SELECTORS = [
  'button[aria-label*="Play" i]',
  '.jw-icon-play',
  '.vjs-big-play-button',
  '.plyr__control[data-plyr="play"]',
  '.play-button',
  '.btn-play',
  'video',
];

const SOAP2DAY_PLAY_SELECTORS = [
  '.btn-play',
  '.play',
  '.jw-icon-display',
  '.jw-display-icon-container',
  'iframe',
  ...PLAY_SELECTORS,
];

export const normalizeAllowedHosts = (rawHosts: string[]): string[] =>
  [...new Set(rawHosts.map((host) => host.trim().toLowerCase()).filter(Boolean))];

const detectKind = (url: string, contentType: string): StreamCandidate['kind'] => {
  const lowerUrl = url.toLowerCase();
  const lowerType = contentType.toLowerCase();

  if (lowerUrl.includes('.m3u8') || lowerType.includes('application/vnd.apple.mpegurl')) {
    return 'hls';
  }

  if (lowerUrl.includes('.mp4') || lowerType.includes('video/mp4')) {
    return 'mp4';
  }

  if (lowerType.startsWith('video/')) {
    return 'other';
  }

  return 'other';
};

const isBlockedHost = (url: string): boolean => MEDIA_HOST_BLOCKLIST.some((pattern) => pattern.test(url));

export const isCandidateResponse = (url: string, status: number, contentType: string): boolean => {
  if (status < 200 || status >= 400) return false;
  if (isBlockedHost(url)) return false;

  const lowerUrl = url.toLowerCase();
  const lowerType = contentType.toLowerCase();
  return (
    lowerUrl.includes('.m3u8') ||
    lowerUrl.includes('.mp4') ||
    lowerType.includes('application/vnd.apple.mpegurl') ||
    lowerType.includes('application/x-mpegurl') ||
    lowerType.startsWith('video/')
  );
};

export const pickBestStreamCandidate = (
  candidates: StreamCandidate[],
  allowedHosts: string[]
): StreamCandidate | null => {
  if (!candidates.length) return null;
  const allowed = normalizeAllowedHosts(allowedHosts);

  const scored = candidates
    .filter((candidate) => {
      if (!allowed.length) return true;
      return allowed.includes(candidate.host.toLowerCase());
    })
    .map((candidate) => {
      let score = 0;
      if (candidate.kind === 'hls') score += 100;
      if (candidate.kind === 'mp4') score += 80;
      if (candidate.status === 200) score += 10;
      if (candidate.url.toLowerCase().startsWith('https://')) score += 5;
      if (candidate.url.includes('master.m3u8')) score += 10;
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    return scored[0].candidate;
  }

  const fallbackScored = candidates
    .map((candidate) => {
      let score = 0;
      if (candidate.kind === 'hls') score += 100;
      if (candidate.kind === 'mp4') score += 80;
      if (candidate.status === 200) score += 10;
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score);

  return fallbackScored[0]?.candidate || null;
};

export class RemoteStreamResolverService {
  private readonly defaultAllowedHosts: string[];
  private readonly soap2dayAllowedMirrors: string[];

  constructor() {
    this.defaultAllowedHosts = normalizeAllowedHosts(
      (process.env.REMOTE_INGEST_ALLOWED_HOSTS || '')
        .split(',')
        .map((entry) => entry.trim())
    );
    this.soap2dayAllowedMirrors = normalizeAllowedHosts(
      (process.env.SOAP2DAY_ALLOWED_MIRRORS || '')
        .split(',')
        .map((entry) => entry.trim())
    );
  }

  async resolveFromPage(pageUrl: string, options: ResolverOptions = {}): Promise<ResolveStreamResult> {
    const provider = options.provider || 'generic';
    const timeoutMs =
      Number.isFinite(options.timeoutMs) && (options.timeoutMs as number) > 0
        ? Math.max(10_000, options.timeoutMs as number)
        : DEFAULT_TIMEOUT_MS;
    const captureWindowMs =
      Number.isFinite(options.captureWindowMs) && (options.captureWindowMs as number) > 0
        ? Math.max(3_000, options.captureWindowMs as number)
        : DEFAULT_CAPTURE_WINDOW_MS;
    const userAgent = options.userAgent || DEFAULT_USER_AGENT;

    const providerHosts = provider === 'soap2day' ? this.soap2dayAllowedMirrors : [];
    const allowedHosts = normalizeAllowedHosts([
      ...this.defaultAllowedHosts,
      ...providerHosts,
      ...(options.allowedHosts || []),
    ]);

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ userAgent });
      const page = await context.newPage();
      const visitedPageUrls = new Set<string>();
      visitedPageUrls.add(pageUrl);

      const candidates: StreamCandidate[] = [];
      const seen = new Set<string>();

      const clickPlaybackSelectors = async (selectors: string[], includeFrames: boolean): Promise<void> => {
        for (const selector of selectors) {
          try {
            const element = page.locator(selector).first();
            if (await element.count()) {
              await element.click({ timeout: 1_500, force: true });
              await page.waitForTimeout(350);
            }
          } catch {
            // Ignore interaction failures and continue trying other selectors.
          }
        }

        try {
          await page.keyboard.press('Space');
        } catch {
          // Ignore if keyboard focus/playback trigger fails.
        }

        if (!includeFrames) return;

        try {
          const frames = page.frames();
          for (const frame of frames) {
            for (const selector of selectors) {
              try {
                const candidate = frame.locator(selector).first();
                if (await candidate.count()) {
                  await candidate.click({ timeout: 1_000, force: true });
                  await page.waitForTimeout(250);
                }
              } catch {
                // Ignore per-frame selector failures and continue.
              }
            }
          }
        } catch {
          // Ignore iframe interaction failures.
        }
      };

      const collectSoap2daySourceUrls = async (): Promise<string[]> => {
        const urls = await page.evaluate(() => {
          const collected: string[] = [];
          const pushIfValid = (value: string | null | undefined) => {
            if (!value) return;
            try {
              const absolute = new URL(value, window.location.href).toString();
              if (absolute.startsWith('http://') || absolute.startsWith('https://')) {
                collected.push(absolute);
              }
            } catch {
              // Ignore invalid/unsupported URL values.
            }
          };

          document.querySelectorAll('iframe[src]').forEach((frame) => {
            pushIfValid(frame.getAttribute('src'));
          });

          document.querySelectorAll('#serverSelect option').forEach((option) => {
            pushIfValid(option.getAttribute('value'));
          });

          return Array.from(new Set(collected));
        });

        return urls;
      };

      page.on('response', async (response) => {
        const url = response.url();
        const status = response.status();
        const headers = response.headers();
        const contentType = headers['content-type'] || '';

        if (!isCandidateResponse(url, status, contentType)) return;
        if (seen.has(url)) return;
        seen.add(url);

        let host = '';
        try {
          host = new URL(url).host.toLowerCase();
        } catch {
          host = '';
        }

        let referer: string | undefined;
        try {
          const requestHeaders = await response.request().headers();
          referer = requestHeaders['referer'];
        } catch {
          referer = undefined;
        }

        candidates.push({
          url,
          host,
          status,
          contentType,
          kind: detectKind(url, contentType),
          referer,
        });
      });

      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

      const playSelectors = provider === 'soap2day' ? SOAP2DAY_PLAY_SELECTORS : PLAY_SELECTORS;

      await clickPlaybackSelectors(playSelectors, provider === 'soap2day');

      await page.waitForTimeout(captureWindowMs);

      let winner = pickBestStreamCandidate(candidates, allowedHosts);

      if (!winner && provider === 'soap2day') {
        const iframeSources = await collectSoap2daySourceUrls();
        const hopTimeoutMs = Math.min(timeoutMs, 30_000);

        for (const sourceUrl of iframeSources.slice(0, SOAP2DAY_MAX_IFRAME_HOPS)) {
          if (visitedPageUrls.has(sourceUrl)) continue;
          visitedPageUrls.add(sourceUrl);

          try {
            await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: hopTimeoutMs });
            await clickPlaybackSelectors(PLAY_SELECTORS, true);
            await page.waitForTimeout(Math.min(captureWindowMs, 10_000));
            winner = pickBestStreamCandidate(candidates, allowedHosts);
            if (winner) break;
          } catch {
            // Ignore source navigation failures and continue trying alternatives.
          }
        }
      }

      if (!winner) {
        throw new Error(
          `No playable stream URL was detected from page network requests (candidates=${candidates.length})`
        );
      }

      const hostAllowed = !allowedHosts.length || allowedHosts.includes(winner.host.toLowerCase());

      await context.close();

      return {
        provider,
        pageUrl,
        streamUrl: winner.url,
        kind: winner.kind,
        referer: winner.referer,
        host: winner.host,
        hostAllowed,
        candidates,
      };
    } finally {
      await browser.close();
    }
  }
}
