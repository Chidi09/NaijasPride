import * as cheerio from 'cheerio';
import { BaseHtmlSource } from '../base/base-html.source';
import { sourceMetrics } from '../observability/source-metrics';
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

const BASE_URL = 'https://mangabuddy.com';

export class MangabuddySource extends BaseHtmlSource {
  readonly id = 'mangabuddy';
  readonly displayName = 'MangaBuddy';
  readonly capabilities = {
    supportsFilters: false,
    supportsLanguages: true,
    supportsSimilar: false,
    supportsDiscover: true,
    supportsTags: true,
    supportsExternalRedirect: true,
    needsAntiBot: false,
  } as const;

  constructor() {
    super({
      baseUrl: BASE_URL,
      cachePrefix: 'mangabuddy',
      defaultCacheTtlSeconds: 600,
    });
  }

  private extractSeriesId(href: string): string | null {
    const trimmed = href.trim();
    if (!trimmed) return null;

    const pathname = this.normalizePath(trimmed, '/').replace(/^\/+|\/+$/g, '');
    if (!pathname) return null;
    if (pathname.startsWith('search') || pathname.startsWith('genres') || pathname.startsWith('top')) return null;
    if (pathname.includes('chapter-')) return null;
    return pathname;
  }

  private extractChapterId(href: string): string | null {
    const trimmed = href.trim();
    if (!trimmed) return null;
    const pathname = this.normalizePath(trimmed, '/').replace(/^\/+|\/+$/g, '');
    if (!pathname) return null;
    return pathname;
  }

  private coerceSeriesId(value: string): string | null {
    const trimmed = value.trim().replace(/^\/+|\/+$/g, '');
    if (!trimmed) return null;
    if (trimmed.includes('chapter-')) return null;
    return this.extractSeriesId(trimmed) || trimmed;
  }

  private coerceChapterId(value: string): string | null {
    const trimmed = value.trim().replace(/^\/+|\/+$/g, '');
    if (!trimmed) return null;
    return this.extractChapterId(trimmed) || trimmed;
  }

  private toSeriesPath(seriesId: string): string {
    return `/${seriesId}`;
  }

  private toChapterPath(chapterId: string): string {
    return `/${chapterId}`;
  }

  async searchManga(query?: string, limit = 20, _filters: MangaSearchFilters = {}): Promise<MangaSummary[]> {
    const normalized = this.strip(query);
    if (!normalized) return [];

    const cacheKey = this.buildCacheKey('search', normalized.toLowerCase(), limit);
    const cached = await this.getFromCache<MangaSummary[]>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml('/search', { q: normalized });
      const $ = cheerio.load(html);
      const results: MangaSummary[] = [];
      const seen = new Set<string>();

      $('.book-item, .book-detailed-item, a[href^="/"]').each((_idx, el) => {
        if (results.length >= limit) return;

        const link = $(el).is('a') ? $(el) : $(el).find('a[href^="/"]').first();
        const href = link.attr('href');
        if (!href || href.startsWith('/search') || href.startsWith('/genres') || href.startsWith('/top')) return;

        const id = this.extractSeriesId(href);
        if (!id || seen.has(id)) return;
        seen.add(id);

        results.push({
          id,
          title:
            this.strip(link.find('.title').text()) ||
            this.strip($(el).find('.book-detailed-item-title, h3, h2').first().text()) ||
            this.strip(link.text()) ||
            'Unknown Title',
          description: this.strip($(el).find('.summary, .description').first().text()),
          coverUrl:
            this.toAbsoluteUrl($(el).find('img').first().attr('data-src')) ||
            this.toAbsoluteUrl($(el).find('img').first().attr('src')),
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
      console.error(`[MangaBuddy] search failed: ${summarizeSourceError(error)}`);
      return [];
    }
  }

  async getDiscoverManga(limit = 12): Promise<MangaDiscoverResult> {
    const safeLimit = Math.min(24, Math.max(1, limit));
    const cacheKey = this.buildCacheKey('discover', safeLimit);
    const cached = await this.getFromCache<MangaDiscoverResult>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml('/latest');
      const $ = cheerio.load(html);
      const cards: MangaSummary[] = [];
      const seen = new Set<string>();

      $('.book-item, .book-detailed-item, a[href^="/"]').each((_idx, el) => {
        if (cards.length >= safeLimit) return;

        const link = $(el).is('a') ? $(el) : $(el).find('a[href^="/"]').first();
        const href = link.attr('href');
        if (!href || href.startsWith('/search') || href.startsWith('/genres') || href.startsWith('/top')) return;

        const id = this.extractSeriesId(href);
        if (!id || seen.has(id)) return;
        seen.add(id);

        cards.push({
          id,
          title:
            this.strip(link.find('.title').text()) ||
            this.strip($(el).find('.book-detailed-item-title, h3, h2').first().text()) ||
            this.strip(link.text()) ||
            'Unknown Title',
          description: this.strip($(el).find('.summary, .description').first().text()),
          coverUrl:
            this.toAbsoluteUrl($(el).find('img').first().attr('data-src')) ||
            this.toAbsoluteUrl($(el).find('img').first().attr('src')),
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
      console.error(`[MangaBuddy] discover failed: ${summarizeSourceError(error)}`);
      return { trending: [], recentlyUpdated: [], newTitles: [] };
    }
  }

  async getMangaTags(): Promise<MangaTag[]> {
    const cacheKey = this.buildCacheKey('tags');
    const cached = await this.getFromCache<MangaTag[]>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml('/');
      const $ = cheerio.load(html);
      const tags: MangaTag[] = [];
      const seen = new Set<string>();

      $('a[href^="/genres/"]').each((_idx, el) => {
        const href = $(el).attr('href') || '';
        const id = href.replace('/genres/', '').trim();
        const name = this.strip($(el).text());
        if (!id || !name || seen.has(id)) return;
        seen.add(id);
        tags.push({ id, name, group: 'genre' });
      });

      await this.setCache(cacheKey, tags, this.defaultCacheTtlSeconds * 12);
      return tags;
    } catch {
      return [];
    }
  }

  async getMangaDetail(mangaId: string): Promise<MangaDetail | null> {
    const seriesId = this.coerceSeriesId(mangaId);
    if (!seriesId) return null;

    const seriesPath = this.toSeriesPath(seriesId);
    const cacheKey = this.buildCacheKey('detail', seriesId);
    const cached = await this.getFromCache<MangaDetail>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(seriesPath);
      const $ = cheerio.load(html);

      const detail: MangaDetail = {
        id: seriesId,
        title:
          this.strip($('h1').first().text()) ||
          this.strip($('meta[property="og:title"]').attr('content')) ||
          'Unknown Title',
        description:
          this.strip($('meta[property="og:description"]').attr('content')) ||
          this.strip($('.summary, .book-summary, .book-detailed-item').first().text()),
        coverUrl:
          this.toAbsoluteUrl($('meta[property="og:image"]').attr('content')) ||
          this.toAbsoluteUrl($('.book-cover img, .book-detail img, img').first().attr('data-src')) ||
          this.toAbsoluteUrl($('.book-cover img, .book-detail img, img').first().attr('src')),
        status: this.strip($('*:contains("Status")').first().parent().text()) || null,
        year: null,
        originalLanguage: null,
        tags: $('a[href^="/genres/"]').map((_idx, el) => this.strip($(el).text())).get().filter(Boolean),
        latestChapter: this.strip($('.latest-chapter a').first().text()) || null,
        author: this.strip($('*:contains("Authors")').first().parent().text()) || null,
        artist: null,
        contentRating: null,
        publicationDemographic: null,
        availableTranslatedLanguages: [],
      };

      await this.setCache(cacheKey, detail, this.defaultCacheTtlSeconds * 2);
      return detail;
    } catch (error) {
      console.error(`[MangaBuddy] detail failed: ${summarizeSourceError(error)}`);
      return null;
    }
  }

  async getSimilarManga(_mangaId: string, _limit = 6): Promise<MangaSummary[]> {
    return [];
  }

  async getChapters(mangaId: string, translatedLanguage?: string, limit = 100): Promise<MangaChapter[]> {
    const seriesId = this.coerceSeriesId(mangaId);
    if (!seriesId) return [];

    const seriesPath = this.toSeriesPath(seriesId);
    const languageKey = translatedLanguage?.trim()?.toLowerCase() || 'all';
    const cacheKey = this.buildCacheKey('chapters', seriesId, languageKey, limit);
    const cached = await this.getFromCache<MangaChapter[]>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(seriesPath);
      const $ = cheerio.load(html);
      const chapters: MangaChapter[] = [];
      const seen = new Set<string>();

      $('a[href*="/chapter-"]').each((_idx, el) => {
        if (chapters.length >= limit) return;

        const href = $(el).attr('href');
        const chapterId = href ? this.coerceChapterId(href) : null;
        if (!chapterId || seen.has(chapterId)) return;
        seen.add(chapterId);

        const text = this.strip($(el).text());
        const chapterMatch = text.match(/chapter\s*[:\-]?\s*([\d.]+)/i);
        const langMatch = text.match(/\b(EN|JP|KR|CN|ES|PT|FR|DE|ID|TH|VI|TR|RU)\b/i);
        const chapterLanguage = langMatch?.[1]?.toLowerCase() || null;

        if (translatedLanguage && chapterLanguage && chapterLanguage !== translatedLanguage.toLowerCase()) {
          return;
        }

        chapters.push({
          id: chapterId,
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
      console.error(`[MangaBuddy] chapter fetch failed: ${summarizeSourceError(error)}`);
      return [];
    }
  }

  async getChapterPages(chapterId: string): Promise<MangaPagesResult> {
    const chapterRawId = this.coerceChapterId(chapterId);
    if (!chapterRawId) {
      return {
        chapterId,
        readerMode: 'manga',
        pages: [],
        externalUrl: null,
        isExternal: false,
      };
    }

    const chapterPath = this.toChapterPath(chapterRawId);
    const cacheKey = this.buildCacheKey('pages', chapterRawId);
    const cached = await this.getFromCache<MangaPagesResult>(cacheKey);
    if (cached && (cached.pages.length > 0 || cached.externalUrl)) return cached;

    try {
      const html = await this.fetchHtml(chapterPath);
      const pages = this.extractChapterImageUrls(html);
      if (pages.length === 0) {
        sourceMetrics.incrementParseEmptyPages(this.id);
        const externalResult: MangaPagesResult = {
          chapterId: chapterRawId,
          readerMode: 'manga',
          pages: [],
          externalUrl: `${BASE_URL}${chapterPath}`,
          isExternal: true,
        };

        await this.setCache(cacheKey, externalResult, this.defaultCacheTtlSeconds * 2);
        return externalResult;
      }

      const result: MangaPagesResult = {
        chapterId: chapterRawId,
        readerMode: 'manga',
        pages,
        externalUrl: null,
        isExternal: false,
      };

      await this.setCache(cacheKey, result, this.defaultCacheTtlSeconds * 2);
      return result;
    } catch (error) {
      console.error(`[MangaBuddy] page fetch failed: ${summarizeSourceError(error)}`);
      return {
        chapterId: chapterRawId,
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
        timeoutMs: 10_000,
      });

      const ok = response.status >= 200 && response.status < 500;
      return {
        ok,
        latencyMs: Date.now() - startedAt,
        message: ok ? undefined : `MangaBuddy status ${response.status}`,
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
