import { chromium } from 'playwright';

type MediaCandidate = { url: string; isM3U8: boolean };

const EMBED_RESOLVE_TIMEOUT_MS = Number(process.env.ANIME_EMBED_RESOLVE_TIMEOUT_MS || 20000);
const EMBED_RESOLVE_WAIT_MS = Number(process.env.ANIME_EMBED_RESOLVE_WAIT_MS || 5000);

const MEDIA_URL_PATTERN = /https?:\/\/[^"'\s);,<]+\.(m3u8|mp4)(?:\?[^"'\s);,<]*)?/gi;

const normalizeCandidateUrl = (value: string): string | null => {
  const cleaned = value.trim().replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

export const extractMediaCandidatesFromText = (text: string): MediaCandidate[] => {
  const discovered: MediaCandidate[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(MEDIA_URL_PATTERN)) {
    const raw = match[0];
    if (!raw) continue;
    const normalized = normalizeCandidateUrl(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    discovered.push({
      url: normalized,
      isM3U8: normalized.toLowerCase().includes('.m3u8'),
    });
  }

  return discovered.sort((a, b) => Number(b.isM3U8) - Number(a.isM3U8));
};

const fetchEmbedHtml = async (url: string, timeoutMs: number): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0',
      },
      signal: controller.signal,
    });
    if (!response.ok) return '';
    return response.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
};

const sniffMediaFromEmbedPage = async (embedUrl: string, timeoutMs: number): Promise<MediaCandidate | null> => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  const seen = new Set<string>();
  const hits: MediaCandidate[] = [];

  const capture = (input: string) => {
    const normalized = normalizeCandidateUrl(input);
    if (!normalized || seen.has(normalized)) return;
    const lower = normalized.toLowerCase();
    if (!lower.includes('.m3u8') && !lower.includes('.mp4')) return;
    seen.add(normalized);
    hits.push({
      url: normalized,
      isM3U8: lower.includes('.m3u8'),
    });
  };

  const captureFromText = (text: string) => {
    for (const entry of extractMediaCandidatesFromText(text)) {
      capture(entry.url);
    }
  };

  page.on('request', (req) => capture(req.url()));
  page.on('response', (res) => {
    capture(res.url());
  });

  page.on('response', (res) => {
    const contentType = (res.headers()['content-type'] || '').toLowerCase();
    if (!contentType.includes('json') && !contentType.includes('javascript') && !contentType.includes('html')) {
      return;
    }
    void res.text().then(captureFromText).catch(() => undefined);
  });

  try {
    await page.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForLoadState('networkidle', { timeout: Math.max(2000, Math.floor(timeoutMs * 0.5)) }).catch(() => undefined);
    captureFromText(await page.content());
    await page.waitForTimeout(EMBED_RESOLVE_WAIT_MS);
    captureFromText(await page.content());
    return hits.sort((a, b) => Number(b.isM3U8) - Number(a.isM3U8))[0] || null;
  } catch {
    return null;
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
};

export const resolveDirectMediaFromEmbed = async (embedUrl: string): Promise<MediaCandidate | null> => {
  const html = await fetchEmbedHtml(embedUrl, EMBED_RESOLVE_TIMEOUT_MS);
  const fromHtml = extractMediaCandidatesFromText(html);
  if (fromHtml.length > 0) return fromHtml[0] || null;
  return sniffMediaFromEmbedPage(embedUrl, EMBED_RESOLVE_TIMEOUT_MS);
};
