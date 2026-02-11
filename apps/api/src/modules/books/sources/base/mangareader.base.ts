import * as cheerio from 'cheerio';
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
import { BaseHtmlSource } from './base-html.source';

export abstract class MangaReaderBaseSource extends BaseHtmlSource {
  readonly capabilities = {
    supportsFilters: true,
    supportsLanguages: false,
    supportsSimilar: false,
    supportsDiscover: true,
    supportsTags: true,
    supportsExternalRedirect: true,
    needsAntiBot: true,
  } as const;

  protected readonly listPath: string;

  constructor(options: {
    baseUrl: string;
    cachePrefix: string;
    listPath?: string;
    defaultCacheTtlSeconds?: number;
  }) {
    super(options);
    this.listPath = options.listPath || '/manga';
  }

  async searchManga(query?: string, limit = 20, _filters: MangaSearchFilters = {}): Promise<MangaSummary[]> {
    const normalized = this.strip(query);
    if (!normalized) return [];

    const cacheKey = this.buildCacheKey('search', normalized.toLowerCase(), limit);
    const cached = await this.getFromCache<MangaSummary[]>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml('/', { s: normalized });
      const $ = cheerio.load(html);
      const results = this.extractMangaCards($, limit);
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
      const html = await this.fetchHtml(this.listPath, { page: 1, order: 'update' });
      const $ = cheerio.load(html);
      const cards = this.extractMangaCards($, safeLimit);
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
    const cacheKey = this.buildCacheKey('tags');
    const cached = await this.getFromCache<MangaTag[]>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(this.listPath);
      const $ = cheerio.load(html);
      const tags: MangaTag[] = [];
      const seen = new Set<string>();

      $('ul.genrez li').each((_idx, el) => {
        const key = this.strip($(el).find('input').attr('value'));
        const name = this.strip($(el).text());
        if (!key || !name || seen.has(key)) return;
        seen.add(key);
        tags.push({ id: key, name, group: 'genre' });
      });

      await this.setCache(cacheKey, tags, this.defaultCacheTtlSeconds * 8);
      return tags;
    } catch {
      return [];
    }
  }

  async getMangaDetail(mangaId: string): Promise<MangaDetail | null> {
    const seriesPath = this.normalizePath(mangaId, '/manga');
    const cacheKey = this.buildCacheKey('detail', seriesPath);
    const cached = await this.getFromCache<MangaDetail>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(seriesPath);
      const $ = cheerio.load(html);

      const status = this.parseStatusText(
        this.strip(
          $('.infotable td:contains("Status")').last().text() ||
            $('.tsinfo div:contains("Status")').last().text() ||
            $('.summary-content:contains("Status")').last().text()
        )
      );

      const detail: MangaDetail = {
        id: seriesPath,
        title:
          this.strip($('h1.entry-title, .entry-title, .seriestucontent h1, h1').first().text()) ||
          this.strip($('meta[property="og:title"]').attr('content')) ||
          'Unknown Title',
        description:
          this.strip($('meta[property="og:description"]').attr('content')) ||
          this.strip($('div.entry-content, .summary__content, .description-summary, .summary').first().text()),
        coverUrl:
          this.toAbsoluteUrl($('meta[property="og:image"]').attr('content')) ||
          this.toAbsoluteUrl($('.seriestucontent img, .thumb img, .summary_image img, img').first().attr('src')),
        status,
        year: null,
        originalLanguage: null,
        tags: $('.seriestugenre a, .wd-full .mgen a, .genres-content a, a[href*="genre"]')
          .map((_idx, el) => this.strip($(el).text()))
          .get()
          .filter(Boolean),
        latestChapter: this.strip($('#chapterlist li').first().text()) || null,
        author:
          this.strip($('.infotable td:contains("Author")').last().text()) ||
          this.strip($('.tsinfo div:contains("Author")').last().text()) ||
          this.strip($('.summary-content:contains("Author")').last().text()) ||
          null,
        artist:
          this.strip($('.infotable td:contains("Artist")').last().text()) ||
          this.strip($('.tsinfo div:contains("Artist")').last().text()) ||
          this.strip($('.summary-content:contains("Artist")').last().text()) ||
          null,
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
    const seriesPath = this.normalizePath(mangaId, '/manga');
    const languageKey = translatedLanguage?.trim()?.toLowerCase() || 'all';
    const cacheKey = this.buildCacheKey('chapters', seriesPath, languageKey, limit);
    const cached = await this.getFromCache<MangaChapter[]>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(seriesPath);
      const $ = cheerio.load(html);
      const chapters: MangaChapter[] = [];
      const seen = new Set<string>();

      $('#chapterlist > ul > li a, li.wp-manga-chapter a, .eplister li a, .listing-chapters_wrap a').each((index, el) => {
        if (chapters.length >= limit) return;

        const href = $(el).attr('href');
        const chapterPath = href ? this.normalizePath(href, '/') : null;
        if (!chapterPath || seen.has(chapterPath)) return;
        seen.add(chapterPath);

        const title = this.strip($(el).text());
        const chapterMatch = title.match(/chapter\s*[:\-]?\s*([\d.]+)/i);
        const langMatch = title.match(/\b(EN|JP|KR|CN|ES|PT|FR|DE|ID|TH|VI|TR|RU|AR)\b/i);
        const chapterLanguage = langMatch?.[1]?.toLowerCase() || null;

        if (translatedLanguage && chapterLanguage && chapterLanguage !== translatedLanguage.toLowerCase()) {
          return;
        }

        chapters.push({
          id: chapterPath,
          chapter: (() => {
            const match = title.match(/\b(\d+(?:\.\d+)?)\b/);
            return match ? match[1] : String(index + 1);
          })(),
          volume: null,
          title: title || null,
          publishedAt: null,
          scanlationGroup: null,
          branch: null,
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
          readerMode: 'reversed',
          pages: [],
          externalUrl: `${this.baseUrl}${chapterPath}`,
          isExternal: true,
        };
        await this.setCache(cacheKey, externalResult, this.defaultCacheTtlSeconds * 2);
        return externalResult;
      }

      const result: MangaPagesResult = {
        chapterId: chapterPath,
        readerMode: 'reversed',
        pages,
        externalUrl: null,
        isExternal: false,
      };

      await this.setCache(cacheKey, result, this.defaultCacheTtlSeconds * 2);
      return result;
    } catch {
      return {
        chapterId: chapterPath,
        readerMode: 'reversed',
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

  protected extractMangaCards($: cheerio.CheerioAPI, limit: number): MangaSummary[] {
    const results: MangaSummary[] = [];
    const seen = new Set<string>();

    $('.postbody .listupd .bs .bsx, .listupd .bs .bsx, .utao .uta, .bsx').each((_idx, el) => {
      if (results.length >= limit) return;
      const link = $(el).find('a').first();
      const href = link.attr('href');
      const id = href ? this.normalizePath(href, '/manga') : null;
      if (!id || seen.has(id)) return;
      seen.add(id);

      results.push({
        id,
        title: this.strip($(el).find('.tt, .title, .post-title').first().text()) || this.strip(link.attr('title')) || 'Unknown Title',
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

    return results;
  }

  protected parseStatusText(value: string): string | null {
    const lowered = value.toLowerCase();
    if (!lowered) return null;
    if (
      lowered.includes('ongoing') ||
      lowered.includes('updating') ||
      lowered.includes('en cours') ||
      lowered.includes('devam') ||
      lowered.includes('مستمر')
    ) {
      return 'ongoing';
    }
    if (
      lowered.includes('complete') ||
      lowered.includes('completed') ||
      lowered.includes('fini') ||
      lowered.includes('termin') ||
      lowered.includes('tamam') ||
      lowered.includes('مكتملة')
    ) {
      return 'completed';
    }
    if (lowered.includes('hiatus') || lowered.includes('pause')) {
      return 'hiatus';
    }
    if (lowered.includes('cancel') || lowered.includes('drop') || lowered.includes('aband')) {
      return 'cancelled';
    }
    return this.strip(value) || null;
  }
}
