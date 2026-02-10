import * as cheerio from 'cheerio';
import { BaseHtmlSource } from './base-html.source';
import {
  MangaChapter,
  MangaDetail,
  MangaDiscoverResult,
  MangaPagesResult,
  MangaSearchFilters,
  MangaSummary,
  MangaTag,
} from '../types';
import { sourceMetrics } from '../observability/source-metrics';

export abstract class MadaraBaseSource extends BaseHtmlSource {
  readonly capabilities = {
    supportsFilters: false,
    supportsLanguages: true,
    supportsSimilar: false,
    supportsDiscover: true,
    supportsTags: false,
    supportsExternalRedirect: true,
    needsAntiBot: true,
  } as const;

  async searchManga(query?: string, limit = 20, _filters: MangaSearchFilters = {}): Promise<MangaSummary[]> {
    const normalized = this.strip(query);
    if (!normalized) return [];

    const cacheKey = this.buildCacheKey('search', normalized.toLowerCase(), limit);
    const cached = await this.getFromCache<MangaSummary[]>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml('/', {
        s: normalized,
        post_type: 'wp-manga',
      });
      const $ = cheerio.load(html);
      const seen = new Set<string>();
      const results: MangaSummary[] = [];

      $('.c-tabs-item__content, .page-item-detail.manga').each((_idx, el) => {
        if (results.length >= limit) return;

        const link = $(el).find('.post-title a, h3 a').first();
        const href = link.attr('href');
        const id = href ? this.normalizePath(href, '/') : null;
        if (!id || seen.has(id)) return;
        seen.add(id);

        results.push({
          id,
          title: this.strip(link.text()) || 'Unknown Title',
          description: this.strip($(el).find('.summary, .description').first().text()),
          coverUrl: this.toAbsoluteUrl($(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src')),
          status: null,
          year: null,
          originalLanguage: null,
          tags: [],
          latestChapter: null,
        });
      });

      await this.setCache(cacheKey, results);
      return results;
    } catch {
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
      const seen = new Set<string>();
      const cards: MangaSummary[] = [];

      $('.page-item-detail.manga, .c-tabs-item__content').each((_idx, el) => {
        if (cards.length >= safeLimit) return;

        const link = $(el).find('.post-title a, h3 a').first();
        const href = link.attr('href');
        const id = href ? this.normalizePath(href, '/') : null;
        if (!id || seen.has(id)) return;
        seen.add(id);

        cards.push({
          id,
          title: this.strip(link.text()) || 'Unknown Title',
          description: this.strip($(el).find('.summary, .description').first().text()),
          coverUrl: this.toAbsoluteUrl($(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src')),
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
    } catch {
      return { trending: [], recentlyUpdated: [], newTitles: [] };
    }
  }

  async getMangaTags(): Promise<MangaTag[]> {
    return [];
  }

  async getMangaDetail(mangaId: string): Promise<MangaDetail | null> {
    const seriesPath = this.normalizePath(mangaId, '/');
    const cacheKey = this.buildCacheKey('detail', seriesPath);
    const cached = await this.getFromCache<MangaDetail>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(seriesPath);
      const $ = cheerio.load(html);

      const detail: MangaDetail = {
        id: seriesPath,
        title:
          this.strip($('.post-title h1, h1').first().text()) ||
          this.strip($('meta[property="og:title"]').attr('content')) ||
          'Unknown Title',
        description:
          this.strip($('meta[property="og:description"]').attr('content')) ||
          this.strip($('.summary__content, .description-summary, .summary').first().text()),
        coverUrl:
          this.toAbsoluteUrl($('meta[property="og:image"]').attr('content')) ||
          this.toAbsoluteUrl($('.summary_image img, .manga-thumb img, img').first().attr('src')),
        status: this.strip($('.summary-content:contains("Status")').first().text()) || null,
        year: null,
        originalLanguage: null,
        tags: $('.genres-content a, .genres a, a[href*="genre"]').map((_idx, el) => this.strip($(el).text())).get().filter(Boolean),
        latestChapter: null,
        author: this.strip($('.summary-content:contains("Author")').first().text()) || null,
        artist: this.strip($('.summary-content:contains("Artist")').first().text()) || null,
        contentRating: null,
        publicationDemographic: null,
        availableTranslatedLanguages: [],
      };

      await this.setCache(cacheKey, detail, this.defaultCacheTtlSeconds * 2);
      return detail;
    } catch {
      return null;
    }
  }

  async getSimilarManga(_mangaId: string, _limit = 6): Promise<MangaSummary[]> {
    return [];
  }

  async getChapters(mangaId: string, translatedLanguage?: string, limit = 100): Promise<MangaChapter[]> {
    const seriesPath = this.normalizePath(mangaId, '/');
    const languageKey = translatedLanguage?.trim()?.toLowerCase() || 'all';
    const cacheKey = this.buildCacheKey('chapters', seriesPath, languageKey, limit);
    const cached = await this.getFromCache<MangaChapter[]>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(seriesPath);
      const $ = cheerio.load(html);
      const chapters: MangaChapter[] = [];
      const seen = new Set<string>();

      $('li.wp-manga-chapter a, .listing-chapters_wrap a').each((_idx, el) => {
        if (chapters.length >= limit) return;

        const href = $(el).attr('href');
        const chapterPath = href ? this.normalizePath(href, '/') : null;
        if (!chapterPath || seen.has(chapterPath)) return;
        seen.add(chapterPath);

        const title = this.strip($(el).text());
        const chapterMatch = title.match(/chapter\s*([\d.]+)/i);
        const langMatch = title.match(/\b(EN|JP|KR|CN|ES|PT|FR|DE|ID|TH|VI|TR|RU)\b/i);
        const chapterLanguage = langMatch?.[1]?.toLowerCase() || null;

        if (translatedLanguage && chapterLanguage && chapterLanguage !== translatedLanguage.toLowerCase()) {
          return;
        }

        chapters.push({
          id: chapterPath,
          chapter: chapterMatch?.[1] || null,
          volume: null,
          title: title || null,
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
    } catch {
      return [];
    }
  }

  async getChapterPages(chapterId: string): Promise<MangaPagesResult> {
    const chapterPath = this.normalizePath(chapterId, '/');
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
          externalUrl: `${this.baseUrl}${chapterPath}`,
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
    } catch {
      return {
        chapterId: chapterPath,
        readerMode: 'manga',
        pages: [],
        externalUrl: `${this.baseUrl}${chapterPath}`,
        isExternal: true,
      };
    }
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }> {
    const startedAt = Date.now();
    try {
      const response = await this.fetchGateway.get(this.baseUrl, {
        sourceId: this.id,
        timeoutMs: 15_000,
      });

      const ok = response.status >= 200 && response.status < 500;
      return {
        ok,
        latencyMs: Date.now() - startedAt,
        message: ok ? undefined : `${this.displayName} status ${response.status}`,
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : `${this.displayName} health check failed`,
      };
    }
  }
}
