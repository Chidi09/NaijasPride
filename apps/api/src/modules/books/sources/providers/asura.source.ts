import * as cheerio from 'cheerio';
import { sourceMetrics } from '../observability/source-metrics';
import { BaseHtmlSource } from '../base/base-html.source';
import {
  MangaChapter,
  MangaDetail,
  MangaDiscoverResult,
  MangaPagesResult,
  MangaSearchFilters,
  MangaSummary,
  MangaTag,
} from '../types';
import { summarizeSourceError } from '../utils/error-summary';

const BASE_URL = 'https://asuracomic.net';

type AsuraApiProbeState = 'unknown' | 'available' | 'unavailable';

export class AsuraSource extends BaseHtmlSource {
  readonly id = 'asura';
  readonly displayName = 'Asura';
  readonly capabilities = {
    supportsFilters: false,
    supportsLanguages: true,
    supportsSimilar: false,
    supportsDiscover: true,
    supportsTags: false,
    supportsExternalRedirect: true,
    needsAntiBot: true,
  } as const;

  private apiProbeState: AsuraApiProbeState = 'unknown';

  constructor() {
    super({
      baseUrl: BASE_URL,
      cachePrefix: 'asura',
      defaultCacheTtlSeconds: 600,
    });
  }

  private mapAsuraApiResults(payload: unknown, limit: number): MangaSummary[] {
    const data = payload as {
      data?: unknown;
      results?: unknown;
      items?: unknown;
      series?: unknown;
      comics?: unknown;
    };

    const candidates = [data.data, data.results, data.items, data.series, data.comics, payload];
    const list = candidates.find((entry): entry is Array<Record<string, unknown>> => Array.isArray(entry));
    if (!list) return [];

    const seen = new Set<string>();
    const mapped: MangaSummary[] = [];

    for (const item of list) {
      const slugOrPath =
        (typeof item.path === 'string' ? item.path : undefined) ||
        (typeof item.url === 'string' ? item.url : undefined) ||
        (typeof item.slug === 'string' ? item.slug : undefined) ||
        (typeof item.seriesSlug === 'string' ? item.seriesSlug : undefined);

      if (!slugOrPath) continue;
      const id = this.normalizePath(slugOrPath, '/series');
      if (seen.has(id)) continue;
      seen.add(id);

      const title =
        (typeof item.title === 'string' ? item.title : undefined) ||
        (typeof item.name === 'string' ? item.name : undefined) ||
        (typeof item.seriesTitle === 'string' ? item.seriesTitle : undefined) ||
        'Unknown Title';

      mapped.push({
        id,
        title: this.strip(title),
        description: this.strip(typeof item.description === 'string' ? item.description : ''),
        coverUrl: this.toAbsoluteUrl(typeof item.cover === 'string' ? item.cover : typeof item.thumbnail === 'string' ? item.thumbnail : null),
        status: null,
        year: null,
        originalLanguage: null,
        tags: [],
        latestChapter: null,
      });

      if (mapped.length >= limit) break;
    }

    return mapped;
  }

  private async searchViaInternalApi(query: string, limit: number): Promise<MangaSummary[] | null> {
    if (this.apiProbeState === 'unavailable') {
      return null;
    }

    const candidates = [
      `/api/v1/search?query=${encodeURIComponent(query)}`,
      `/api/v1/series/search?query=${encodeURIComponent(query)}`,
      `/api/search?query=${encodeURIComponent(query)}`,
      `/api/series?query=${encodeURIComponent(query)}`,
    ];

    for (const endpoint of candidates) {
      try {
        const response = await this.fetchGateway.get(`${BASE_URL}${endpoint}`, {
          sourceId: this.id,
          timeoutMs: 12_000,
          headers: {
            Accept: 'application/json, text/plain, */*',
          },
        });

        if (response.status === 404) {
          continue;
        }

        if (response.status < 200 || response.status >= 300) {
          continue;
        }

        const text = (response.body || '').trim();
        if (!text.startsWith('{') && !text.startsWith('[')) {
          continue;
        }

        const parsed = JSON.parse(text) as unknown;
        const mapped = this.mapAsuraApiResults(parsed, limit);
        if (mapped.length > 0) {
          this.apiProbeState = 'available';
          return mapped;
        }
      } catch {
        continue;
      }
    }

    this.apiProbeState = 'unavailable';
    return null;
  }

  async searchManga(query?: string, limit = 20, _filters: MangaSearchFilters = {}): Promise<MangaSummary[]> {
    const normalized = this.strip(query);
    if (!normalized) return [];

    const cacheKey = this.buildCacheKey('search', normalized.toLowerCase(), limit);
    const cached = await this.getFromCache<MangaSummary[]>(cacheKey);
    if (cached) return cached;

    try {
      const internalApiResults = await this.searchViaInternalApi(normalized, limit);
      if (internalApiResults && internalApiResults.length > 0) {
        await this.setCache(cacheKey, internalApiResults);
        return internalApiResults;
      }

      const html = await this.fetchHtml('/search', { q: normalized });
      const $ = cheerio.load(html);
      const results: MangaSummary[] = [];
      const seen = new Set<string>();

      $('a[href*="/series/"]').each((_idx, el) => {
        if (results.length >= limit) return;
        const title = this.strip($(el).text());
        if (!title.toLowerCase().includes(normalized.toLowerCase())) return;

        const href = $(el).attr('href');
        const id = href ? this.normalizePath(href, '/series') : null;
        if (!id || seen.has(id)) return;
        seen.add(id);

        results.push({
          id,
          title,
          description: '',
          coverUrl: this.toAbsoluteUrl($(el).find('img').first().attr('src') || null),
          status: null,
          year: null,
          originalLanguage: null,
          tags: [],
          latestChapter: null,
        });
      });

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error(`[Asura] search failed: ${summarizeSourceError(error)}`);
      return [];
    }
  }

  async getDiscoverManga(limit = 12): Promise<MangaDiscoverResult> {
    const safeLimit = Math.min(24, Math.max(1, limit));
    const cacheKey = this.buildCacheKey('discover', safeLimit);
    const cached = await this.getFromCache<MangaDiscoverResult>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml('/');
      const $ = cheerio.load(html);

      const cards: MangaSummary[] = [];
      const seen = new Set<string>();
      $('a[href*="/series/"]').each((_idx, el) => {
        if (cards.length >= safeLimit) return;
        const href = $(el).attr('href');
        const id = href ? this.normalizePath(href, '/series') : null;
        if (!id || seen.has(id)) return;
        seen.add(id);

        cards.push({
          id,
          title: this.strip($(el).find('h3, h4, .title').first().text()) || this.strip($(el).text()) || 'Unknown Title',
          description: this.strip($(el).find('p, .description').first().text()),
          coverUrl: this.toAbsoluteUrl($(el).find('img').first().attr('src') || null),
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

      await this.setCache(cacheKey, payload);
      return payload;
    } catch (error) {
      console.error(`[Asura] discover failed: ${summarizeSourceError(error)}`);
      return { trending: [], recentlyUpdated: [], newTitles: [] };
    }
  }

  async getMangaTags(): Promise<MangaTag[]> {
    return [];
  }

  async getMangaDetail(mangaId: string): Promise<MangaDetail | null> {
    const seriesPath = this.normalizePath(mangaId, '/series');
    const cacheKey = this.buildCacheKey('detail', seriesPath);
    const cached = await this.getFromCache<MangaDetail>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(seriesPath);
      const $ = cheerio.load(html);

      const detail: MangaDetail = {
        id: seriesPath,
        title: this.strip($('h1').first().text()) || 'Unknown Title',
        description:
          this.strip($('meta[property="og:description"]').attr('content')) ||
          this.strip($('.description, .summary, .synopsis').first().text()),
        coverUrl:
          this.toAbsoluteUrl($('meta[property="og:image"]').attr('content')) ||
          this.toAbsoluteUrl($('img').first().attr('src') || null),
        status: null,
        year: null,
        originalLanguage: null,
        tags: $('.tag, .genre a, a[href*="genre"]').map((_idx, el) => this.strip($(el).text())).get().filter(Boolean),
        latestChapter: null,
        author: null,
        artist: null,
        contentRating: null,
        publicationDemographic: null,
        availableTranslatedLanguages: [],
      };

      await this.setCache(cacheKey, detail, this.defaultCacheTtlSeconds * 2);
      return detail;
    } catch (error) {
      console.error(`[Asura] detail failed: ${summarizeSourceError(error)}`);
      return null;
    }
  }

  async getSimilarManga(_mangaId: string, _limit = 6): Promise<MangaSummary[]> {
    return [];
  }

  async getChapters(mangaId: string, translatedLanguage?: string, limit = 100): Promise<MangaChapter[]> {
    const seriesPath = this.normalizePath(mangaId, '/series');
    const languageKey = translatedLanguage?.trim()?.toLowerCase() || 'all';
    const cacheKey = this.buildCacheKey('chapters', seriesPath, languageKey, limit);
    const cached = await this.getFromCache<MangaChapter[]>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(seriesPath);
      const $ = cheerio.load(html);

      const chapters: MangaChapter[] = [];
      const seen = new Set<string>();
      $('a[href*="/chapter/"]').each((_idx, el) => {
        if (chapters.length >= limit) return;
        const href = $(el).attr('href');
        const chapterPath = href ? this.normalizePath(href, '/chapter') : null;
        if (!chapterPath || seen.has(chapterPath)) return;
        seen.add(chapterPath);

        const text = this.strip($(el).text());
        const chapterMatch = text.match(/chapter\s*([\d.]+)/i);
        const langMatch = text.match(/\b(EN|JP|KR|CN|ES|PT|FR|DE|ID|TH|VI|TR|RU)\b/i);
        const chapterLanguage = langMatch?.[1]?.toLowerCase() || null;

        if (translatedLanguage && chapterLanguage && chapterLanguage !== translatedLanguage.toLowerCase()) {
          return;
        }

        chapters.push({
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

      await this.setCache(cacheKey, chapters);
      return chapters;
    } catch (error) {
      console.error(`[Asura] chapter fetch failed: ${summarizeSourceError(error)}`);
      return [];
    }
  }

  async getChapterPages(chapterId: string): Promise<MangaPagesResult> {
    const chapterPath = this.normalizePath(chapterId, '/chapter');
    const cacheKey = this.buildCacheKey('pages', chapterPath);
    const cached = await this.getFromCache<MangaPagesResult>(cacheKey);
    if (cached && (cached.pages.length > 0 || cached.externalUrl)) return cached;

    try {
      const html = await this.fetchHtml(chapterPath);
      const pages = this.extractChapterImageUrls(html);
      if (pages.length === 0) {
        sourceMetrics.incrementParseEmptyPages(this.id);
        const externalResult: MangaPagesResult = {
          chapterId: chapterPath,
          readerMode: 'manga',
          pages: [],
          externalUrl: `${BASE_URL}${chapterPath}`,
          isExternal: true,
        };
        await this.setCache(cacheKey, externalResult, this.defaultCacheTtlSeconds * 2);
        return externalResult;
      }

      const result: MangaPagesResult = {
        chapterId: chapterPath,
        readerMode: 'manga',
        pages,
        externalUrl: null,
        isExternal: false,
      };

      await this.setCache(cacheKey, result, this.defaultCacheTtlSeconds * 2);
      return result;
    } catch (error) {
      console.error(`[Asura] page fetch failed: ${summarizeSourceError(error)}`);
      return {
        chapterId: chapterPath,
        readerMode: 'manga',
        pages: [],
        externalUrl: `${BASE_URL}${chapterPath}`,
        isExternal: true,
      };
    }
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }> {
    const startedAt = Date.now();
    try {
      const response = await this.fetchGateway.get(BASE_URL, {
        sourceId: this.id,
        timeoutMs: 15_000,
      });

      const ok = response.status >= 200 && response.status < 500;
      return {
        ok,
        latencyMs: Date.now() - startedAt,
        message: ok ? undefined : `Asura status ${response.status}`,
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        message: summarizeSourceError(error),
      };
    }
  }
}
