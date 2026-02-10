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

const BASE_URL = 'https://weebcentral.com';

export class WeebCentralSource extends BaseHtmlSource {
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

  constructor() {
    super({
      baseUrl: BASE_URL,
      cachePrefix: 'weebcentral',
      defaultCacheTtlSeconds: 600,
    });
  }

  private titleFromSeriesPath(id: string): string {
    const slug = id.split('/').filter(Boolean).pop() || '';
    const normalized = decodeURIComponent(slug)
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (value) => value.toUpperCase())
      .trim();
    return normalized || 'Unknown Title';
  }

  private extractSeriesTitle($: cheerio.CheerioAPI, el: any, id: string): string {
    const titleFromNode = this.strip($(el).find('h1, h2, h3, h4, .title, .series-title').first().text());
    const titleFromAttr = this.strip($(el).attr('title'));
    const titleFromImageAlt = this.strip($(el).find('img').first().attr('alt')).replace(/\s+cover$/i, '');
    const titleFromText = this.strip($(el).text()).replace(/\s+(chapter|episode|ch\.)\s*\d.*$/i, '');

    return titleFromNode || titleFromAttr || titleFromImageAlt || titleFromText || this.titleFromSeriesPath(id);
  }

  private addSeriesCard(
    map: Map<string, MangaSummary>,
    $: cheerio.CheerioAPI,
    el: any,
    limit: number
  ): void {
    if (map.size >= limit) return;
    const href = $(el).attr('href');
    const id = href ? this.normalizePath(href, '/series') : null;
    if (!id) return;

    const nextCard: MangaSummary = {
      id,
      title: this.extractSeriesTitle($, el, id),
      description: this.strip($(el).find('p, .description, .summary').first().text()),
      coverUrl:
        this.toAbsoluteUrl($(el).find('img').first().attr('src') || null) ||
        this.toAbsoluteUrl($(el).find('img').first().attr('data-src') || null),
      status: null,
      year: null,
      originalLanguage: null,
      tags: [],
      latestChapter: null,
    };

    const existing = map.get(id);
    if (!existing) {
      map.set(id, nextCard);
      return;
    }

    const existingUnknown = existing.title === 'Unknown Title';
    const nextKnown = nextCard.title !== 'Unknown Title';
    if (existingUnknown && nextKnown) {
      map.set(id, { ...existing, ...nextCard });
    }
  }

  async searchManga(query?: string, limit = 20, _filters: MangaSearchFilters = {}): Promise<MangaSummary[]> {
    const normalized = this.strip(query);
    if (!normalized) {
      const discover = await this.getDiscoverManga(Math.min(limit, 20));
      return discover.trending.slice(0, limit);
    }

    const cacheKey = this.buildCacheKey('search', normalized.toLowerCase(), limit);
    const cached = await this.getFromCache<MangaSummary[]>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml('/');
      const $ = cheerio.load(html);
      const map = new Map<string, MangaSummary>();

      $('a[href*="/series/"]').each((_idx, el) => {
        this.addSeriesCard(map, $, el, Math.max(limit * 3, 50));
      });

      const results = Array.from(map.values())
        .filter((entry) => entry.title.toLowerCase().includes(normalized.toLowerCase()))
        .slice(0, limit);

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error(`[WeebCentral] search failed: ${summarizeSourceError(error)}`);
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
      const map = new Map<string, MangaSummary>();

      $('a[href*="/series/"]').each((_idx, el) => {
        this.addSeriesCard(map, $, el, safeLimit * 4);
      });

      const cards = Array.from(map.values()).slice(0, safeLimit);

      const payload: MangaDiscoverResult = {
        trending: cards.slice(0, safeLimit),
        recentlyUpdated: cards.slice(0, safeLimit),
        newTitles: cards.slice(0, safeLimit),
      };

      await this.setCache(cacheKey, payload);
      return payload;
    } catch (error) {
      console.error(`[WeebCentral] discover failed: ${summarizeSourceError(error)}`);
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
        title:
          this.strip($('h1').first().text()) ||
          this.strip($('meta[property="og:title"]').attr('content')) ||
          this.titleFromSeriesPath(seriesPath),
        description:
          this.strip($('meta[property="og:description"]').attr('content')) ||
          this.strip($('.description, .synopsis, .summary').first().text()),
        coverUrl:
          this.toAbsoluteUrl($('meta[property="og:image"]').attr('content')) ||
          this.toAbsoluteUrl($('img').first().attr('src') || null),
        status: this.strip($('*:contains("Status")').first().parent().text()) || null,
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

      await this.setCache(cacheKey, detail, this.defaultCacheTtlSeconds * 3);
      return detail;
    } catch (error) {
      console.error(`[WeebCentral] detail failed: ${summarizeSourceError(error)}`);
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
      const results: MangaChapter[] = [];
      const seen = new Set<string>();

      $('a[href*="/chapters/"]').each((_idx, el) => {
        if (results.length >= limit) return;

        const href = $(el).attr('href');
        const chapterPath = href ? this.normalizePath(href, '/chapters') : null;
        if (!chapterPath || seen.has(chapterPath)) return;
        seen.add(chapterPath);

        const text = this.strip($(el).text());
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

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error(`[WeebCentral] chapter fetch failed: ${summarizeSourceError(error)}`);
      return [];
    }
  }

  async getChapterPages(chapterId: string): Promise<MangaPagesResult> {
    const chapterPath = this.normalizePath(chapterId, '/chapters');
    const cacheKey = this.buildCacheKey('pages', chapterPath);
    const cached = await this.getFromCache<MangaPagesResult>(cacheKey);
    if (cached && cached.pages.length > 0) return cached;

    try {
      const html = await this.fetchHtml(chapterPath);
      const pages = this.extractChapterImageUrls(html);
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

      await this.setCache(cacheKey, result, this.defaultCacheTtlSeconds * 2);
      return result;
    } catch (error) {
      console.error(`[WeebCentral] page fetch failed: ${summarizeSourceError(error)}`);
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
      const response = await this.fetchGateway.get(BASE_URL, {
        sourceId: this.id,
        timeoutMs: 10_000,
      });
      const ok = response.status >= 200 && response.status < 500;
      return {
        ok,
        latencyMs: Date.now() - startedAt,
        message: ok ? undefined : `WeebCentral status ${response.status}`,
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
