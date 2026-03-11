import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

type AnimepaheSearchEntry = {
  id?: number;
  title?: string;
  episodes?: number;
  session?: string;
};

type AnimepaheSearchResponse = {
  data?: AnimepaheSearchEntry[];
};

type AnimepaheReleaseEntry = {
  episode?: number;
  session?: string;
  snapshot?: string;
  duration?: string;
};

type AnimepaheReleaseResponse = {
  total?: number;
  last_page?: number;
  data?: AnimepaheReleaseEntry[];
};

type AnimepaheLinksEntry = Record<string, { kwik?: string; audio?: string; filesize?: number }>;

type AnimepaheLinksResponse = {
  data?: AnimepaheLinksEntry[];
};

const ANIMEPAHE_SITE_ORIGIN = process.env.ANIMEPAHE_SITE_ORIGIN || 'https://animepahe.si';
const ANIMEPAHE_API_URL = process.env.ANIMEPAHE_API_URL || `${ANIMEPAHE_SITE_ORIGIN}/api?m=`;
const ANIMEPAHE_TIMEOUT_MS = Number(process.env.ANIMEPAHE_TIMEOUT_MS || 15000);
const ANIMEPAHE_BROWSER_WAIT_MS = Number(process.env.ANIMEPAHE_BROWSER_WAIT_MS || 5000);

let browserHandle: {
  browser: Browser;
  context: BrowserContext;
  page: Page;
} | null = null;
type AnimepaheBrowserHandle = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

let browserInitPromise: Promise<AnimepaheBrowserHandle> | null = null;
let browserQueue: Promise<void> = Promise.resolve();

const withBrowserLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  const run = browserQueue.then(fn, fn);
  browserQueue = run.then(() => undefined, () => undefined);
  return run;
};

const isDdosGuardChallenge = (value: string): boolean => {
  const text = value.toLowerCase();
  return text.includes('ddos-guard') || text.includes('js-challenge') || text.includes('checking your browser');
};

const disposeBrowserHandle = async (): Promise<void> => {
  if (!browserHandle) return;
  const current = browserHandle;
  browserHandle = null;
  try {
    await current.context.close();
  } catch {
    // ignore close errors
  }
  try {
    await current.browser.close();
  } catch {
    // ignore close errors
  }
};

const ensureBrowserHandle = async (): Promise<AnimepaheBrowserHandle> => {
  if (browserHandle) return browserHandle;
  if (!browserInitPromise) {
    browserInitPromise = (async () => {
      const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      });
      const page = await context.newPage();
      await page.goto(`${ANIMEPAHE_SITE_ORIGIN}/`, {
        waitUntil: 'domcontentloaded',
        timeout: ANIMEPAHE_TIMEOUT_MS,
      });
      await page.waitForTimeout(ANIMEPAHE_BROWSER_WAIT_MS);
      browserHandle = { browser, context, page };
      return browserHandle;
    })();
  }

  try {
    const handle = await browserInitPromise;
    if (!handle) {
      throw new Error('Failed to initialize browser handle');
    }
    return handle;
  } finally {
    browserInitPromise = null;
  }
};

const browserBackedFetchText = async (url: string): Promise<{ ok: boolean; status: number; contentType: string; text: string }> => {
  const execute = async () => {
    const handle = await ensureBrowserHandle();
    return handle.page.evaluate(async (target) => {
      const response = await fetch(target, {
        credentials: 'include',
        headers: {
          Accept: 'application/json,text/html,application/xhtml+xml',
        },
      });
      const text = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type') || '',
        text,
      };
    }, url);
  };

  let result = await withBrowserLock(execute);
  if (!isDdosGuardChallenge(result.text)) return result;

  await withBrowserLock(async () => {
    await disposeBrowserHandle();
    await ensureBrowserHandle();
  });

  result = await withBrowserLock(execute);
  return result;
};

export const computeAnimepaheReleasePage = (episode: number, pages: number, totalEpisodes: number): number => {
  if (episode <= 0 || pages <= 0 || totalEpisodes <= 0) return 1;
  return Math.max(1, Math.ceil((episode * pages) / totalEpisodes));
};

const normalizeTitle = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const animepaheRequest = async <T>(url: string, json = true): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANIMEPAHE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: json ? 'application/json' : 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Animepahe request failed with status ${response.status}`);
    }
    const text = await response.text();
    if (!json) {
      if (isDdosGuardChallenge(text)) {
        const browserResponse = await browserBackedFetchText(url);
        if (!browserResponse.ok) {
          throw new Error(`Animepahe browser request failed with status ${browserResponse.status}`);
        }
        return browserResponse.text as T;
      }
      return text as T;
    }

    const isJsonResponse = (response.headers.get('content-type') || '').includes('application/json');
    if (isJsonResponse) {
      return JSON.parse(text) as T;
    }

    if (isDdosGuardChallenge(text)) {
      const browserResponse = await browserBackedFetchText(url);
      if (!browserResponse.ok) {
        throw new Error(`Animepahe browser request failed with status ${browserResponse.status}`);
      }
      return JSON.parse(browserResponse.text) as T;
    }

    throw new Error('Animepahe returned non-JSON response');
  } finally {
    clearTimeout(timeout);
  }
};

const animepaheSearch = async (query: string): Promise<AnimepaheSearchEntry[]> => {
  const encoded = encodeURIComponent(query);
  const payload = await animepaheRequest<AnimepaheSearchResponse>(`${ANIMEPAHE_API_URL}search&q=${encoded}`);
  return payload.data || [];
};

const pickBestAnimepaheMatch = (entries: AnimepaheSearchEntry[], titles: string[]): AnimepaheSearchEntry | null => {
  const normalizedTitles = titles.map((title) => normalizeTitle(title)).filter(Boolean);
  if (normalizedTitles.length === 0) {
    return entries.find((entry) => !!entry.session) || null;
  }

  const scored = entries
    .filter((entry) => !!entry.session && !!entry.title)
    .map((entry) => {
      const entryTitle = normalizeTitle(entry.title || '');
      let score = 0;

      if (normalizedTitles.includes(entryTitle)) score += 100;
      if (normalizedTitles.some((title) => entryTitle.includes(title) || title.includes(entryTitle))) score += 40;
      if ((entry.episodes || 0) > 0) score += 10;

      return { entry, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.entry || null;
};

const animepaheReleasePage = async (animeSession: string, page?: number): Promise<AnimepaheReleaseResponse> => {
  const query = new URLSearchParams({ id: animeSession, sort: 'episode_asc' });
  if (page && page > 1) {
    query.set('page', String(page));
  }
  return animepaheRequest<AnimepaheReleaseResponse>(`${ANIMEPAHE_API_URL}release&${query.toString()}`);
};

const findAnimepaheEpisodeRelease = async (animeSession: string, episodeNumber: number): Promise<AnimepaheReleaseEntry | null> => {
  const firstPage = await animepaheReleasePage(animeSession);
  const total = Number(firstPage.total || 0);
  const lastPage = Number(firstPage.last_page || 1);

  const fromFirst = (firstPage.data || []).find((entry) => entry.episode === episodeNumber);
  if (fromFirst) return fromFirst;

  if (total > 0 && episodeNumber > total) return null;
  if (lastPage <= 1) return null;

  const targetPage = computeAnimepaheReleasePage(episodeNumber, lastPage, total || episodeNumber);
  const pageData = await animepaheReleasePage(animeSession, targetPage);
  return (pageData.data || []).find((entry) => entry.episode === episodeNumber) || null;
};

export const extractAnimepaheM3u8FromHtml = (html: string): string | null => {
  const direct = html.match(/https?:\/\/[^"'\s]+\/hls\/[^"'\s]+\/owo\.m3u8/i)?.[0];
  if (direct) return direct;

  const scriptBlocks = Array.from(html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)).map((match) => match[1] || '');
  const plyrScript = scriptBlocks.find((script) => script.includes('Plyr') && script.includes('.split'));
  if (!plyrScript) return null;

  const tokenSource = plyrScript.match(/['"]([^'"]+)['"]\.split\('\|'\)/)?.[1];
  if (!tokenSource) return null;

  const tokens = tokenSource.split('|');
  if (tokens.length < 10) return null;

  const host = `${tokens[tokens.length - 2]}-${tokens[tokens.length - 3]}.${tokens[tokens.length - 4]}.${tokens[tokens.length - 5]}.${tokens[tokens.length - 6]}`;
  const path = `${tokens[tokens.length - 8]}/${tokens[tokens.length - 9]}/${tokens[tokens.length - 10]}`;
  return `https://${host}/hls/${path}/owo.m3u8`;
};

const animepaheLinks = async (releaseSession: string): Promise<AnimepaheLinksEntry[]> => {
  const query = new URLSearchParams({ id: releaseSession, p: 'kwik' });
  const payload = await animepaheRequest<AnimepaheLinksResponse>(`${ANIMEPAHE_API_URL}links&${query.toString()}`);
  return payload.data || [];
};

const fetchKwikHtml = async (kwikUrl: string): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANIMEPAHE_TIMEOUT_MS);
  try {
    const response = await fetch(kwikUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        Referer: 'https://animepahe.com/',
        'User-Agent': 'Mozilla/5.0',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Kwik page fetch failed with status ${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
};

export async function resolveAnimepaheWatchByTitles(
  titles: string[],
  episodeNumber: number,
): Promise<{
  sources: Array<{ url: string; quality: string; isM3U8: boolean; isEmbed: boolean }>;
  headers: Record<string, string>;
  releaseSession: string | null;
  animeSession: string | null;
} | null> {
  const seedTitle = titles.find((title) => !!title.trim());
  if (!seedTitle) return null;

  const searchResults = await animepaheSearch(seedTitle);
  const match = pickBestAnimepaheMatch(searchResults, titles);
  if (!match?.session) return null;

  const release = await findAnimepaheEpisodeRelease(match.session, episodeNumber);
  if (!release?.session) return null;

  const linkEntries = await animepaheLinks(release.session);
  const sources: Array<{ url: string; quality: string; isM3U8: boolean; isEmbed: boolean }> = [];

  for (const entry of linkEntries) {
    const qualityKey = Object.keys(entry)[0];
    if (!qualityKey) continue;
    const kwikUrl = entry[qualityKey]?.kwik;
    if (!kwikUrl) continue;

    try {
      const html = await fetchKwikHtml(kwikUrl);
      const m3u8 = extractAnimepaheM3u8FromHtml(html);
      if (m3u8) {
        sources.push({
          url: m3u8,
          quality: qualityKey,
          isM3U8: true,
          isEmbed: false,
        });
      } else {
        sources.push({
          url: kwikUrl,
          quality: `${qualityKey}-kwik`,
          isM3U8: false,
          isEmbed: true,
        });
      }
    } catch {
      sources.push({
        url: kwikUrl,
        quality: `${qualityKey}-kwik`,
        isM3U8: false,
        isEmbed: true,
      });
    }
  }

  if (sources.length === 0) return null;

  return {
    sources,
    headers: {
      Referer: 'https://kwik.cx/',
    },
    releaseSession: release.session || null,
    animeSession: match.session,
  };
}

export async function resolveAnimepaheEpisodesByTitles(
  titles: string[],
): Promise<{
  episodes: Array<{ id: string; number: number; title: string | null; image: string | null; url: string | null; isFiller: boolean }>;
  provider: string;
  animeTitle: string | null;
} | null> {
  const seedTitle = titles.find((title) => !!title.trim());
  if (!seedTitle) return null;

  const searchResults = await animepaheSearch(seedTitle);
  const match = pickBestAnimepaheMatch(searchResults, titles);
  if (!match?.session) return null;

  const firstPage = await animepaheReleasePage(match.session);
  const total = Number(firstPage.total || 0);
  if (total <= 0) return null;

  const episodes = Array.from({ length: total }).map((_, index) => {
    const number = index + 1;
    return {
      id: `${match.session}-ep-${number}`,
      number,
      title: null,
      image: null,
      url: null,
      isFiller: false,
    };
  });

  return {
    episodes,
    provider: 'animepahe',
    animeTitle: match.title || null,
  };
}
