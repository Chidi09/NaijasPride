import axios from 'axios';
import * as cheerio from 'cheerio';
import { getRedis } from '../../../../shared/services/redis.service';
import { sourceMetrics } from '../observability/source-metrics';
import { extractChapterImageUrls } from '../parsers/html-parsers';
import {
  MangaChapter,
  MangaDetail,
  MangaDiscoverResult,
  MangaPagesResult,
  MangaSearchFilters,
  MangaSource,
  MangaSummary,
  MangaTag,
} from '../types';

const WEEBCENTRAL_BASE_URL = 'https://weebcentral.com';
const CACHE_TTL_SECONDS = 600;

const toAbsoluteUrl = (url?: string | null): string | null => {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return `${WEEBCENTRAL_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

const strip = (value?: string | null): string => (value || '').replace(/\s+/g, ' ').trim();

const normalizeSeriesPath = (mangaId: string): string => {
  const trimmed = mangaId.trim();
  if (!trimmed) return '/';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const url = new URL(trimmed);
    return url.pathname;
  }
  if (trimmed.startsWith('/')) return trimmed;
  if (trimmed.startsWith('series/')) return `/${trimmed}`;
  return `/series/${trimmed}`;
};

const normalizeChapterPath = (chapterId: string): string => {
  const trimmed = chapterId.trim();
  if (!trimmed) return '/';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const url = new URL(trimmed);
    return url.pathname;
  }
  if (trimmed.startsWith('/')) return trimmed;
  if (trimmed.startsWith('chapter/')) return `/${trimmed}`;
  return `/chapter/${trimmed}`;
};

export class WeebCentralSource implements MangaSource {
  readonly id = 'weebcentral';
  readonly displayName = 'WeebCentral';
  readonly capabilities = {
    supportsFilters: false,
    supportsLanguages: true,
    supportsSimilar: false,
    supportsDiscover: true,
    supportsTags: false,
    supportsExternalRedirect: true,
    needsAntiBot: false,
  } as const;

  private async getFromCache<T>(key: string): Promise<T | null> {
    const redis = getRedis();
    if (!redis) return null;
    try {
      const raw = await redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private async setCache(key: string, value: unknown, ttl = CACHE_TTL_SECONDS): Promise<void> {
    const redis = getRedis();
    if (!redis) return;
    try {
      await redis.setex(key, ttl, JSON.stringify(value));
    } catch {
      // no-op
    }
  }

  async searchManga(query?: string, limit = 20, _filters: MangaSearchFilters = {}): Promise<MangaSummary[]> {
    const normalized = strip(query);
    if (!normalized) return [];

    const cacheKey = `manga:weebcentral:search:${normalized.toLowerCase()}:${limit}`;
    const cached = await this.getFromCache<MangaSummary[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${WEEBCENTRAL_BASE_URL}/search/data`, {
        params: { q: normalized },
        timeout: 15000,
      });

      const $ = cheerio.load(String(response.data || ''));
      const seen = new Set<string>();
      const results: MangaSummary[] = [];

      $('a[href*="/series/"]').each((_idx, el) => {
        if (results.length >= limit) return;
        const href = $(el).attr('href');
        const seriesPath = href ? normalizeSeriesPath(href) : null;
        if (!seriesPath || seen.has(seriesPath)) return;

        seen.add(seriesPath);
        const title = strip($(el).find('h3, h4, .title').first().text()) || strip($(el).text()) || 'Unknown Title';
        const cover = toAbsoluteUrl($(el).find('img').first().attr('src') || null);
        const description = strip($(el).find('p, .description').first().text());

        results.push({
          id: seriesPath,
          title,
          description,
          coverUrl: cover,
          status: null,
          year: null,
          originalLanguage: null,
          tags: [],
          latestChapter: null,
        });
      });

      await this.setCache(cacheKey, results, CACHE_TTL_SECONDS);
      return results;
    } catch (error) {
      console.error('[WeebCentral] search failed:', error);
      return [];
    }
  }

  async getDiscoverManga(limit = 12): Promise<MangaDiscoverResult> {
    const safeLimit = Math.min(24, Math.max(1, limit));
    const cacheKey = `manga:weebcentral:discover:${safeLimit}`;
    const cached = await this.getFromCache<MangaDiscoverResult>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(WEEBCENTRAL_BASE_URL, { timeout: 15000 });
      const $ = cheerio.load(String(response.data || ''));

      const cards: MangaSummary[] = [];
      const seen = new Set<string>();
      $('a[href*="/series/"]').each((_idx, el) => {
        if (cards.length >= safeLimit) return;
        const href = $(el).attr('href');
        const id = href ? normalizeSeriesPath(href) : null;
        if (!id || seen.has(id)) return;
        seen.add(id);

        cards.push({
          id,
          title: strip($(el).find('h3, h4, .title').first().text()) || strip($(el).text()) || 'Unknown Title',
          description: strip($(el).find('p, .description').first().text()),
          coverUrl: toAbsoluteUrl($(el).find('img').first().attr('src') || null),
          status: null,
          year: null,
          originalLanguage: null,
          tags: [],
          latestChapter: null,
        });
      });

      const payload: MangaDiscoverResult = {
        trending: cards.slice(0, safeLimit),
        recentlyUpdated: cards.slice(0, safeLimit),
        newTitles: cards.slice(0, safeLimit),
      };

      await this.setCache(cacheKey, payload, CACHE_TTL_SECONDS);
      return payload;
    } catch (error) {
      console.error('[WeebCentral] discover failed:', error);
      return { trending: [], recentlyUpdated: [], newTitles: [] };
    }
  }

  async getMangaTags(): Promise<MangaTag[]> {
    return [];
  }

  async getMangaDetail(mangaId: string): Promise<MangaDetail | null> {
    const seriesPath = normalizeSeriesPath(mangaId);
    const cacheKey = `manga:weebcentral:detail:${seriesPath}`;
    const cached = await this.getFromCache<MangaDetail>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${WEEBCENTRAL_BASE_URL}${seriesPath}`, { timeout: 15000 });
      const $ = cheerio.load(String(response.data || ''));

      const title =
        strip($('h1').first().text()) ||
        strip($('meta[property="og:title"]').attr('content')) ||
        'Unknown Title';

      const description =
        strip($('meta[property="og:description"]').attr('content')) ||
        strip($('.description, .synopsis, .summary').first().text());

      const cover =
        toAbsoluteUrl($('meta[property="og:image"]').attr('content')) ||
        toAbsoluteUrl($('img').first().attr('src') || null);

      const statusText = strip($('*:contains("Status")').first().parent().text()) || null;
      const tags = $('.tag, .genre a, a[href*="genre"]').map((_idx, el) => strip($(el).text())).get().filter(Boolean);

      const detail: MangaDetail = {
        id: seriesPath,
        title,
        description,
        coverUrl: cover,
        status: statusText,
        year: null,
        originalLanguage: null,
        tags,
        latestChapter: null,
        author: null,
        artist: null,
        contentRating: null,
        publicationDemographic: null,
        availableTranslatedLanguages: [],
      };

      await this.setCache(cacheKey, detail, CACHE_TTL_SECONDS * 3);
      return detail;
    } catch (error) {
      console.error('[WeebCentral] detail failed:', error);
      return null;
    }
  }

  async getSimilarManga(_mangaId: string, _limit = 6): Promise<MangaSummary[]> {
    return [];
  }

  async getChapters(mangaId: string, translatedLanguage?: string, limit = 100): Promise<MangaChapter[]> {
    const seriesPath = normalizeSeriesPath(mangaId);
    const languageKey = translatedLanguage?.trim()?.toLowerCase() || 'all';
    const cacheKey = `manga:weebcentral:chapters:${seriesPath}:${languageKey}:${limit}`;
    const cached = await this.getFromCache<MangaChapter[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${WEEBCENTRAL_BASE_URL}${seriesPath}`, { timeout: 15000 });
      const $ = cheerio.load(String(response.data || ''));
      const results: MangaChapter[] = [];
      const seen = new Set<string>();

      $('a[href*="/chapter/"]').each((_idx, el) => {
        if (results.length >= limit) return;

        const href = $(el).attr('href');
        const chapterPath = href ? normalizeChapterPath(href) : null;
        if (!chapterPath || seen.has(chapterPath)) return;
        seen.add(chapterPath);

        const text = strip($(el).text());
        const chapterMatch = text.match(/chapter\s*([\d.]+)/i);
        const langMatch = text.match(/\b(EN|JP|KR|CN|ES|PT|FR|DE|ID|TH|VI|TR|RU)\b/i);
        const chapterLanguage = langMatch?.[1]?.toLowerCase() || null;

        if (translatedLanguage && chapterLanguage && chapterLanguage !== translatedLanguage.toLowerCase()) {
          return;
        }

        results.push({
          id: chapterPath,
          chapter: chapterMatch?.[1] || null,
          volume: null,
          title: text || null,
          pages: 0,
          publishedAt: null,
          readableAt: null,
          translatedLanguage: chapterLanguage,
          scanlationGroup: null,
          externalUrl: null,
          isExternal: false,
        });
      });

      await this.setCache(cacheKey, results, CACHE_TTL_SECONDS);
      return results;
    } catch (error) {
      console.error('[WeebCentral] chapter fetch failed:', error);
      return [];
    }
  }

  async getChapterPages(chapterId: string): Promise<MangaPagesResult> {
    const chapterPath = normalizeChapterPath(chapterId);
    const cacheKey = `manga:weebcentral:pages:${chapterPath}`;
    const cached = await this.getFromCache<MangaPagesResult>(cacheKey);
    if (cached && cached.pages.length > 0) return cached;

    try {
      const response = await axios.get(`${WEEBCENTRAL_BASE_URL}${chapterPath}`, { timeout: 20000 });
      const html = String(response.data || '');
      const pages = extractChapterImageUrls(html, toAbsoluteUrl);
      if (pages.length === 0) {
        sourceMetrics.incrementParseEmptyPages(this.id);
      }
      const result: MangaPagesResult = {
        chapterId: chapterPath,
        readerMode: 'manga',
        pages,
        externalUrl: null,
        isExternal: false,
      };

      await this.setCache(cacheKey, result, CACHE_TTL_SECONDS * 2);
      return result;
    } catch (error) {
      console.error('[WeebCentral] page fetch failed:', error);
      return {
        chapterId: chapterPath,
        readerMode: 'manga',
        pages: [],
        externalUrl: null,
        isExternal: false,
      };
    }
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }> {
    const startedAt = Date.now();
    try {
      await axios.get(WEEBCENTRAL_BASE_URL, { timeout: 10000 });
      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : 'WeebCentral health check failed',
      };
    }
  }
}
