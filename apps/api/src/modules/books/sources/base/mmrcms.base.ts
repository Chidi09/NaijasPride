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

export abstract class MmrcmsBaseSource extends BaseHtmlSource {
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
  protected readonly tagPath: string;
  protected readonly updatedCoverSuffix: string;
  protected readonly detailStatusSelector: string;
  protected readonly detailTagSelector: string;

  constructor(options: {
    baseUrl: string;
    cachePrefix: string;
    listPath?: string;
    tagPath?: string;
    updatedCoverSuffix?: string;
    detailStatusSelector?: string;
    detailTagSelector?: string;
    defaultCacheTtlSeconds?: number;
  }) {
    super(options);
    this.listPath = options.listPath || 'filterList';
    this.tagPath = options.tagPath || 'manga-list';
    this.updatedCoverSuffix = options.updatedCoverSuffix || '/cover/cover_250x350.jpg';
    this.detailStatusSelector = options.detailStatusSelector || 'dt:contains("Statut")';
    this.detailTagSelector = options.detailTagSelector || 'dt:contains("Catégories")';
  }

  async searchManga(query?: string, limit = 20, _filters: MangaSearchFilters = {}): Promise<MangaSummary[]> {
    const normalized = this.strip(query);
    if (!normalized) return [];

    const cacheKey = this.buildCacheKey('search', normalized.toLowerCase(), limit);
    const cached = await this.getFromCache<MangaSummary[]>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(`/${this.listPath}/`, {
        page: 1,
        author: '',
        tag: '',
        alpha: normalized,
        cat: '',
        sortBy: 'name',
        asc: 'true',
      });
      const $ = cheerio.load(html);
      const results = this.parseListCards($, limit);
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
      const html = await this.fetchHtml('/latest-release', { page: 1 });
      const $ = cheerio.load(html);
      const cards = this.parseUpdatedCards($, safeLimit);
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
      const html = await this.fetchHtml(`/${this.tagPath}/`);
      const $ = cheerio.load(html);
      const tags: MangaTag[] = [];
      const seen = new Set<string>();

      $('ul.list-category li a').each((_idx, el) => {
        const href = this.strip($(el).attr('href'));
        const id = href.includes('cat=') ? href.substring(href.lastIndexOf('cat=') + 4) : href.substring(href.lastIndexOf('/') + 1);
        const name = this.strip($(el).text());
        if (!id || !name || seen.has(id)) return;
        seen.add(id);
        tags.push({ id, name, group: 'genre' });
      });

      await this.setCache(cacheKey, tags, this.defaultCacheTtlSeconds * 8);
      return tags;
    } catch {
      return [];
    }
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
          this.strip($('h2.listmanga-header').first().text()) ||
          this.strip($('h1').first().text()) ||
          this.strip($('meta[property="og:title"]').attr('content')) ||
          'Unknown Title',
        description:
          this.strip($('meta[property="og:description"]').attr('content')) ||
          this.strip($('div.well, .summary, .description').first().text()),
        coverUrl:
          this.extractImageUrl($('div.list-container .boxed img, .boxed img, .col-sm-4 .img-responsive').first()) ||
          this.toAbsoluteUrl(this.strip($('meta[property="og:image"]').attr('content'))) ||
          this.extractImageUrl($('img').first()),
        status: this.parseStatus(this.strip($(this.detailStatusSelector).first().next().text())),
        year: null,
        originalLanguage: null,
        tags: $(this.detailTagSelector)
          .first()
          .next()
          .find('a')
          .map((_idx, el) => this.strip($(el).text()))
          .get()
          .filter(Boolean),
        latestChapter: this.strip($('ul.chapters li h5').first().text()) || null,
        author:
          this.strip($('dt:contains("Auteur")').next().text()) ||
          this.strip($('dt:contains("Author")').next().text()) ||
          null,
        artist: null,
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

      const chapterItems = $('ul.chapters > li:not(.btn)').toArray().reverse();
      for (const [index, chapterItem] of chapterItems.entries()) {
        if (chapters.length >= limit) break;
        const href = $(chapterItem).find('a').first().attr('href');
        const chapterPath = href ? this.normalizePath(href, '/') : null;
        if (!chapterPath || seen.has(chapterPath)) continue;
        seen.add(chapterPath);

        const title = this.strip($(chapterItem).find('h5').first().text()) || null;
        const publishedAt = this.parseChapterDate(this.strip($(chapterItem).find('div.date-chapter-title-rtl').first().text()));

        chapters.push({
          id: chapterPath,
          chapter: String(index + 1),
          volume: null,
          title,
          publishedAt,
          scanlationGroup: null,
          branch: null,
          externalUrl: null,
          isExternal: false,
        });
      }

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
      const $ = cheerio.load(html);
      const pages = Array.from(
        new Set(
          $('div#all img')
            .map((_idx, el) => this.extractImageUrl($(el)))
            .get()
            .filter((url): url is string => Boolean(url))
        )
      );
      if (pages.length === 0) {
        sourceMetrics.incrementParseEmptyPages(this.id);
        // Return empty pages with no external redirect — the frontend reader
        // will show a "chapter unavailable" message instead of bouncing users
        // to the external source site (e.g. readcomicsonline.ru).
        const emptyResult: MangaPagesResult = {
          chapterId: chapterPath,
          readerMode: 'reversed',
          pages: [],
          externalUrl: null,
          isExternal: false,
        };
        await this.setCache(cacheKey, emptyResult, this.defaultCacheTtlSeconds * 2);
        return emptyResult;
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
      // On fetch/parse error, return empty rather than redirecting externally.
      return {
        chapterId: chapterPath,
        readerMode: 'reversed',
        pages: [],
        externalUrl: null,
        isExternal: false,
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

  protected parseListCards($: cheerio.CheerioAPI, limit: number): MangaSummary[] {
    const cards: MangaSummary[] = [];
    const seen = new Set<string>();

    $('div.media').each((_idx, el) => {
      if (cards.length >= limit) return;

      const href = $(el).find('a').first().attr('href');
      const id = href ? this.normalizePath(href, '/') : null;
      if (!id || seen.has(id)) return;
      seen.add(id);

      cards.push({
        id,
        title: this.strip($(el).find('div.media-body h5').first().text()) || this.strip($(el).find('a').first().text()) || 'Unknown Title',
        description: '',
        coverUrl: this.extractImageUrl($(el).find('img').first()),
        status: null,
        year: null,
        originalLanguage: null,
        tags: [],
        latestChapter: null,
      });
    });

    return cards;
  }

  protected parseUpdatedCards($: cheerio.CheerioAPI, limit: number): MangaSummary[] {
    const cards: MangaSummary[] = [];
    const seen = new Set<string>();

    $('div.manga-item').each((_idx, el) => {
      if (cards.length >= limit) return;

      const href =
        $(el).find('h3 a').first().attr('href') ||
        $(el).find('a').first().attr('href');
      const id = href ? this.normalizePath(href, '/') : null;
      if (!id || seen.has(id)) return;
      seen.add(id);

      const slug = id.split('/').filter(Boolean).pop() || '';
      const parsedCoverFromCard = this.extractImageUrl($(el).find('img').first());
      const fallbackCover = slug ? this.toAbsoluteUrl(`/uploads/manga/${slug}${this.updatedCoverSuffix}`) : null;
      const coverUrl = parsedCoverFromCard || fallbackCover;

      cards.push({
        id,
        title: this.strip($(el).find('h3 a').first().text()) || this.strip($(el).find('a').first().text()) || 'Unknown Title',
        description: '',
        coverUrl,
        status: null,
        year: null,
        originalLanguage: null,
        tags: [],
        latestChapter: null,
      });
    });

    return cards;
  }

  protected parseStatus(value: string): string | null {
    const lowered = value.toLowerCase();
    if (!lowered) return null;
    if (lowered.includes('ongoing') || lowered.includes('on going') || lowered.includes('en cours')) return 'ongoing';
    if (lowered.includes('completed') || lowered.includes('complete') || lowered.includes('termin')) return 'completed';
    return this.strip(value) || null;
  }

  protected extractImageUrl(image: cheerio.Cheerio<any>): string | null {
    const attributes = [
      'data-src',
      'data-cfsrc',
      'data-original',
      'data-cdn',
      'data-sizes',
      'data-lazy-src',
      'data-srcset',
      'original-src',
      'data-wpfc-original-src',
      'src',
    ];

    for (const attribute of attributes) {
      const rawValue = this.strip(image.attr(attribute));
      if (!rawValue) continue;

      const candidate = attribute.includes('srcset') ? (rawValue.split(',')[0] || '').trim().split(/\s+/)[0] : rawValue;
      const normalizedCandidate = this.strip(candidate);
      if (!normalizedCandidate) continue;

      const lowered = normalizedCandidate.toLowerCase();
      if (lowered.startsWith('data:') || lowered.startsWith('about:blank')) continue;

      const absolute = this.toAbsoluteUrl(normalizedCandidate);
      if (!absolute) continue;

      return absolute;
    }

    return null;
  }

  protected parseChapterDate(value: string): string | null {
    const normalized = this.strip(value);
    if (!normalized) return null;

    const directDate = new Date(normalized);
    if (!Number.isNaN(directDate.getTime())) return directDate.toISOString();

    const match = normalized.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4})$/);
    if (!match) return null;

    const [, dayRaw, monthRaw, yearRaw] = match;
    const monthIndexMap: Record<string, number> = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };

    const monthKey = monthRaw.slice(0, 3).toLowerCase();
    const monthIndex = monthIndexMap[monthKey];
    if (monthIndex === undefined) return null;

    const parsedDate = new Date(Date.UTC(Number(yearRaw), monthIndex, Number(dayRaw)));
    if (Number.isNaN(parsedDate.getTime())) return null;
    return parsedDate.toISOString();
  }
}
