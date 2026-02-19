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
import { extractChapterImageUrls } from '../parsers/html-parsers';

const BASE_URL = 'https://weebcentral.com';

export class WeebCentralSource extends BaseHtmlSource {
  readonly id = 'weebcentral';
  readonly displayName = 'WeebCentral';
  readonly capabilities = {
    supportsFilters: false,
    supportsLanguages: false,
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

  private extractSeriesId(href: string): string | null {
    const match = href.match(/\/series\/([A-Z0-9]{26})(?:\/|$)/i);
    return match ? match[1] : null;
  }

  private extractChapterId(href: string): string | null {
    const match = href.match(/\/chapters\/([A-Z0-9]{26})(?:\/|$)/i);
    return match ? match[1] : null;
  }

  private coerceSeriesId(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^[A-Z0-9]{26}$/i.test(trimmed)) return trimmed;
    return this.extractSeriesId(trimmed);
  }

  private coerceChapterId(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^[A-Z0-9]{26}$/i.test(trimmed)) return trimmed;
    return this.extractChapterId(trimmed);
  }

  private toSeriesPath(seriesId: string): string {
    return `/series/${seriesId}`;
  }

  private toChapterPath(chapterId: string): string {
    return `/chapters/${chapterId}`;
  }

  private extractSeriesTitle($: cheerio.CheerioAPI, el: any, id: string): string {
    const titleFromNode = this.strip($(el).find('h1, h2, h3, h4, .title, .series-title').first().text());
    const titleFromAttr = this.strip($(el).attr('title'));
    const titleFromImageAlt = this.strip($(el).find('img').first().attr('alt')).replace(/\s+cover$/i, '');
    const titleFromText = this.strip($(el).text()).replace(/\s+(chapter|episode|ch\.)\s*\d.*$/i, '');

    const candidates = [titleFromNode, titleFromAttr, titleFromImageAlt, titleFromText].filter(Boolean);
    const cleaned = candidates.find((value) => {
      const lowered = value.toLowerCase();
      return lowered !== 'poster' && lowered !== 'manga' && lowered !== 'manhwa' && lowered.length > 2;
    });

    return cleaned || this.titleFromSeriesPath(id);
  }

  private addSeriesCard(
    map: Map<string, MangaSummary>,
    $: cheerio.CheerioAPI,
    el: any,
    limit: number
  ): void {
    if (map.size >= limit) return;
    const href = $(el).attr('href');
    const id = href ? this.extractSeriesId(href) : null;
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
    const seriesId = this.coerceSeriesId(mangaId);
    if (!seriesId) return null;

    const seriesPath = this.toSeriesPath(seriesId);
    const cacheKey = this.buildCacheKey('detail', seriesId);
    const cached = await this.getFromCache<MangaDetail>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(seriesPath);
      const $ = cheerio.load(html);

      // Kotatsu extracts description from: li:has(strong:contains(Description)) > p
      const descriptionFromLi = this.strip($('li:has(strong:contains("Description")) p').text());

      // Extract status from the detail list item
      const statusFromLi = this.strip($('li:has(strong:contains("Status")) a').first().text());

      // Extract author from detail list
      const authorFromLi = this.strip($('li:has(strong:contains("Author")) a').first().text());

      // Extract artist from detail list
      const artistFromLi = this.strip($('li:has(strong:contains("Artist")) a').first().text());

      // Extract tags/genres from the detail list
      const tags: string[] = [];
      $('li:has(strong:contains("Tags")) a, li:has(strong:contains("Genre")) a').each((_idx, el) => {
        const tag = this.strip($(el).text());
        if (tag) tags.push(tag);
      });

      // Fall back to generic selectors if the specific ones don't match
      if (tags.length === 0) {
        $('.tag, .genre a, a[href*="genre"]').each((_idx, el) => {
          const tag = this.strip($(el).text());
          if (tag) tags.push(tag);
        });
      }

      const detail: MangaDetail = {
        id: seriesId,
        title:
          this.strip($('h1').first().text()) ||
          this.strip($('meta[property="og:title"]').attr('content')) ||
          this.titleFromSeriesPath(seriesId),
        description:
          descriptionFromLi ||
          this.strip($('meta[property="og:description"]').attr('content')) ||
          this.strip($('.description, .synopsis, .summary').first().text()),
        coverUrl:
          this.toAbsoluteUrl($('meta[property="og:image"]').attr('content')) ||
          this.toAbsoluteUrl($('picture img, img.series-cover, img[alt*="cover"]').first().attr('src') || null) ||
          this.toAbsoluteUrl($('img').first().attr('src') || null),
        status: statusFromLi || null,
        year: null,
        originalLanguage: null,
        tags,
        latestChapter: null,
        author: authorFromLi || null,
        artist: artistFromLi || null,
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

  async getChapters(mangaId: string, _translatedLanguage?: string, limit = 200): Promise<MangaChapter[]> {
    const seriesId = this.coerceSeriesId(mangaId);
    if (!seriesId) return [];

    const cacheKey = this.buildCacheKey('chapters', seriesId, limit);
    const cached = await this.getFromCache<MangaChapter[]>(cacheKey);
    if (cached) return cached;

    try {
      // First fetch the series page to check for a "full-chapter-list" button.
      // Kotatsu checks: #chapter-list > button[hx-get*=full-chapter-list]
      const seriesHtml = await this.fetchHtml(this.toSeriesPath(seriesId));
      let chapterHtml = seriesHtml;
      const $series = cheerio.load(seriesHtml);

      const fullListButton = $series('button[hx-get*="full-chapter-list"], a[href*="full-chapter-list"]').first();
      const fullListUrl = fullListButton.attr('hx-get') || fullListButton.attr('href');

      if (fullListUrl) {
        // Fetch the full chapter list endpoint
        try {
          chapterHtml = await this.fetchHtml(fullListUrl);
        } catch {
          // Fall back to the series page chapters if full list fails
          chapterHtml = seriesHtml;
        }
      }

      const $ = cheerio.load(chapterHtml);
      const results: MangaChapter[] = [];
      const seen = new Set<string>();

      // Kotatsu: chapters are in div[x-data] > a, reversed order
      $('div[x-data] > a[href*="/chapters/"]').each((index, el) => {
        if (results.length >= limit) return;

        const href = $(el).attr('href');
        const chapterId = href ? this.coerceChapterId(href) : null;
        if (!chapterId || seen.has(chapterId)) return;
        seen.add(chapterId);

        // Kotatsu extracts chapter name from: span.flex > span
        const chapterNameSpan = this.strip($(el).find('span.flex span, span span').first().text());
        const fallbackText = this.strip($(el).text());
        const displayText = chapterNameSpan || fallbackText;

        // Kotatsu chapter number extraction: (?<!S)\b(\d+(\.\d+)?)\b
        // Also matches volume: (?:S|vol(?:ume)?)\s*(\d+)
        let chapterNumber = index + 1; // Default: index-based
        const chapterMatch = displayText.match(/\b(\d+(?:\.\d+)?)\b/);
        const volMatch = displayText.match(/(?:vol(?:ume)?|S)\s*(\d+)/i);
        if (chapterMatch) {
          chapterNumber = parseFloat(chapterMatch[1]);
        }

        // Extract volume
        const volume = volMatch ? volMatch[1] : null;

        // Extract date from time[datetime] inside the chapter link
        const timeEl = $(el).find('time[datetime]').first();
        const publishedAt = timeEl.attr('datetime') || null;

        // Kotatsu: scanlator from SVG stroke color
        // #d8b4fe = Official, others = null
        const svgStroke = $(el).find('svg').attr('stroke');
        const scanlator = svgStroke === '#d8b4fe' ? 'Official' : null;

        results.push({
          id: chapterId,
          chapter: chapterNumber.toString(),
          volume,
          title: displayText || null,
          publishedAt,
          branch: scanlator,
          scanlationGroup: scanlator,
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
    const chapterRawId = this.coerceChapterId(chapterId);
    if (!chapterRawId) {
      return {
        chapterId,
        readerMode: 'webtoon',
        pages: [],
        externalUrl: null,
        isExternal: false,
      };
    }

    const cacheKey = this.buildCacheKey('pages', chapterRawId);
    const cached = await this.getFromCache<MangaPagesResult>(cacheKey);
    if (cached && cached.pages.length > 0) return cached;

    try {
      // Use Kotatsu's approach: fetch the long-strip reader endpoint which
      // returns only the actual chapter images in a scrollable section.
      const html = await this.fetchHtml(`/chapters/${chapterRawId}/images`, {
        is_prev: 'False',
        reading_style: 'long_strip',
      });
      const $ = cheerio.load(html);
      const pages: string[] = [];
      const seen = new Set<string>();

      const pushPage = (url?: string | null) => {
        const absolute = this.toAbsoluteUrl(url || null);
        if (!absolute) return;
        if (!/\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(absolute)) return;
        if (absolute.includes('/static/images/broken_image.jpg')) return;
        if (seen.has(absolute)) return;
        seen.add(absolute);
        pages.push(absolute);
      };

      // Select only images inside the scrollable reader section.
      // Kotatsu uses: section[x-data~=scroll] > img
      $('section[x-data*="scroll"] > img, section[x-data] > img, section img').each((_idx, el) => {
        // Prefer lazy attribute first. Some pages use a placeholder src with
        // the real URL in data-src.
        const src = $(el).attr('data-src') || $(el).attr('src');
        pushPage(src);
      });

      // Fallback for edge pages where image URLs are only embedded in scripts.
      if (pages.length === 0) {
        const inlineUrls = extractChapterImageUrls(html, (url) => this.toAbsoluteUrl(url || null));
        for (const url of inlineUrls) {
          pushPage(url);
        }
      }

      if (pages.length === 0) {
        sourceMetrics.incrementParseEmptyPages(this.id);
      }

      const result: MangaPagesResult = {
        chapterId: chapterRawId,
        readerMode: 'webtoon',
        pages,
        externalUrl: null,
        isExternal: false,
      };

      await this.setCache(cacheKey, result, this.defaultCacheTtlSeconds * 2);
      return result;
    } catch (error) {
      console.error(`[WeebCentral] page fetch failed: ${summarizeSourceError(error)}`);
      return {
        chapterId: chapterRawId,
        readerMode: 'webtoon',
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
