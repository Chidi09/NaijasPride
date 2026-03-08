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

// Maps the site's status text to a canonical status string
const STATUS_MAP: Record<string, string> = {
  Ongoing: 'ongoing',
  Complete: 'completed',
  Canceled: 'abandoned',
  Hiatus: 'hiatus',
};

export class WeebCentralSource extends BaseHtmlSource {
  readonly id = 'weebcentral';
  readonly displayName = 'WeebCentral';
  readonly capabilities = {
    supportsFilters: true,
    supportsLanguages: false,
    supportsSimilar: false,
    supportsDiscover: true,
    supportsTags: true,
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

  /**
   * Parse a single article card from the /search/data API response.
   * Kotatsu: article:has(section) → a href → pathSegments[1] for ID,
   *   div.text-ellipsis... for title, picture img[src] for cover.
   */
  private parseSearchArticle($: cheerio.CheerioAPI, el: any): MangaSummary | null {
    const anchor = $(el).find('a').first();
    const href = anchor.attr('href') || $(el).find('a[href*="/series/"]').first().attr('href');
    const id = href ? this.extractSeriesId(this.toAbsoluteUrl(href) || href) : null;
    if (!id) return null;

    // Kotatsu title selector: div.text-ellipsis.truncate.text-white.text-center.text-lg.z-20.w-[90%]
    const titleEl = $(el).find(
      'div.text-ellipsis.truncate.text-white.text-center.text-lg, div[class*="text-ellipsis"][class*="truncate"]'
    );
    const title = this.strip(titleEl.first().text()) || this.titleFromSeriesPath(id);

    // Kotatsu: picture img src for cover
    const coverUrl =
      this.toAbsoluteUrl($(el).find('picture img').first().attr('src') || null) ||
      this.toAbsoluteUrl($(el).find('img').first().attr('src') || null) ||
      this.toAbsoluteUrl($(el).find('img').first().attr('data-src') || null);

    // Tags from inline tag div: "Tag(s): Action, Adventure"
    const tagText = $(el).find('div:contains("Tag(s): ")').first().text();
    const tags: string[] = tagText
      ? tagText
          .replace(/^.*Tag\(s\):\s*/i, '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    // Status from inline status div
    const statusText = this.strip($(el).find('div:contains("status") span').first().text());
    const status = STATUS_MAP[statusText] || null;

    // Adult content: svg with red stroke color (ff0000 in style)
    const isAdult = $(el).find('svg').filter((_i, svgEl) => {
      return ($(svgEl).find('style').text() || $(svgEl).attr('style') || '').includes('ff0000');
    }).length > 0;

    return {
      id,
      title,
      description: '',
      coverUrl: coverUrl || null,
      status,
      year: null,
      originalLanguage: null,
      tags,
      latestChapter: null,
    };
  }

  /**
   * Build the /search/data URL with query params matching Kotatsu's implementation.
   */
  private buildSearchUrl(options: {
    query?: string;
    sort?: string;
    order?: string;
    offset?: number;
    limit?: number;
    adult?: string;
  }): string {
    const params = new URLSearchParams();
    params.set('limit', String(options.limit ?? 32));
    params.set('offset', String(options.offset ?? 0));

    if (options.query) {
      // Kotatsu sanitizes: remove non-alphanumeric, collapse whitespace
      const sanitized = options.query
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (sanitized) params.set('text', sanitized);
    }

    params.set('sort', options.sort ?? 'Best Match');
    params.set('order', options.order ?? 'Descending');
    params.set('official', 'Any');
    params.set('anime', 'Any');
    params.set('adult', options.adult ?? 'Any');
    params.set('display_mode', 'Full Display');

    return `/search/data?${params.toString()}`;
  }

  async searchManga(query?: string, limit = 20, _filters: MangaSearchFilters = {}): Promise<MangaSummary[]> {
    const normalized = this.strip(query);

    // No query → return discover results
    if (!normalized) {
      const discover = await this.getDiscoverManga(Math.min(limit, 20));
      return discover.trending.slice(0, limit);
    }

    const cacheKey = this.buildCacheKey('search', normalized.toLowerCase(), limit);
    const cached = await this.getFromCache<MangaSummary[]>(cacheKey);
    if (cached) return cached;

    try {
      // Kotatsu: GET /search/data?text=<query>&sort=Best Match&order=Ascending&...
      const searchPath = this.buildSearchUrl({
        query: normalized,
        sort: 'Best Match',
        order: 'Ascending',
        limit: Math.min(limit * 2, 64),
      });

      const html = await this.fetchHtml(searchPath);
      const $ = cheerio.load(html);
      const results: MangaSummary[] = [];
      const seen = new Set<string>();

      // Kotatsu: article:has(section) for result cards
      $('article:has(section)').each((_idx, el) => {
        if (results.length >= limit) return;
        const card = this.parseSearchArticle($, el);
        if (card && !seen.has(card.id)) {
          seen.add(card.id);
          results.push(card);
        }
      });

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
      const parseSection = async (sort: string, order: string): Promise<MangaSummary[]> => {
        const path = this.buildSearchUrl({ sort, order, limit: safeLimit });
        const html = await this.fetchHtml(path);
        const $ = cheerio.load(html);
        const results: MangaSummary[] = [];
        const seen = new Set<string>();

        $('article:has(section)').each((_idx, el) => {
          if (results.length >= safeLimit) return;
          const card = this.parseSearchArticle($, el);
          if (card && !seen.has(card.id)) {
            seen.add(card.id);
            results.push(card);
          }
        });

        return results.slice(0, safeLimit);
      };

      // Fetch all three sections in parallel with distinct sort orders (Kotatsu-aligned)
      const [trending, recentlyUpdated, newTitles] = await Promise.all([
        parseSection('Popularity', 'Descending'),
        parseSection('Latest Updates', 'Descending'),
        parseSection('Recently Added', 'Descending'),
      ]);

      const payload: MangaDiscoverResult = { trending, recentlyUpdated, newTitles };

      await this.setCache(cacheKey, payload);
      return payload;
    } catch (error) {
      console.error(`[WeebCentral] discover failed: ${summarizeSourceError(error)}`);
      return { trending: [], recentlyUpdated: [], newTitles: [] };
    }
  }

  /**
   * Fetch tag list from the /search filter page.
   * Kotatsu: section[x-show=show_filter] div:contains(tags) fieldset label
   *   → span text (title), input[id$=value] attr value (key)
   */
  async getMangaTags(): Promise<MangaTag[]> {
    const cacheKey = this.buildCacheKey('tags');
    const cached = await this.getFromCache<MangaTag[]>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml('/search');
      const $ = cheerio.load(html);
      const tags: MangaTag[] = [];

      $('section[x-show="show_filter"] div:contains("tags") fieldset label, ' +
        'section[x-show=show_filter] div:contains(tags) fieldset label').each((_idx, el) => {
        const title = this.strip($(el).find('span').first().text());
        const key =
          $(el).find('input[id$="value"]').attr('value') ||
          $(el).find('input').attr('value') ||
          title.toLowerCase().replace(/\s+/g, '-');
        if (title && key) {
          tags.push({ id: key, name: title, group: 'genre' });
        }
      });

      await this.setCache(cacheKey, tags, this.defaultCacheTtlSeconds * 24); // tags rarely change
      return tags;
    } catch (error) {
      console.error(`[WeebCentral] tags fetch failed: ${summarizeSourceError(error)}`);
      return [];
    }
  }

  async getMangaDetail(mangaId: string): Promise<MangaDetail | null> {
    const seriesId = this.coerceSeriesId(mangaId);
    if (!seriesId) return null;

    const cacheKey = this.buildCacheKey('detail', seriesId);
    const cached = await this.getFromCache<MangaDetail>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(this.toSeriesPath(seriesId));
      const $ = cheerio.load(html);

      // Kotatsu layout: section[x-data] > section:nth(0) = cover/left panel
      //                 section[x-data] > section:nth(1) = info/right panel
      const sections = $('section[x-data] > section');
      const sectionLeft = sections.eq(0);
      const sectionRight = sections.eq(1);

      // Title: Kotatsu uses sectionRight h1
      const title =
        this.strip(sectionRight.find('h1').first().text()) ||
        this.strip($('h1').first().text()) ||
        this.strip($('meta[property="og:title"]').attr('content')) ||
        this.titleFromSeriesPath(seriesId);

      // Cover: Kotatsu uses sectionLeft img src
      const coverUrl =
        this.toAbsoluteUrl(sectionLeft.find('img').first().attr('src') || null) ||
        this.toAbsoluteUrl($('meta[property="og:image"]').attr('content')) ||
        this.toAbsoluteUrl($('picture img').first().attr('src') || null);

      // Status: Kotatsu uses sectionLeft ul > li:has(strong:contains(Status)) > a
      const statusText = this.strip(
        sectionLeft.find('ul > li:has(strong:contains("Status")) > a').first().text() ||
        $('li:has(strong:contains("Status")) a').first().text()
      );
      const status = STATUS_MAP[statusText] || statusText || null;

      // Author: Kotatsu uses sectionLeft ul > li:has(strong:contains(Author)) > span > a (joinToString)
      const authorParts: string[] = [];
      sectionLeft.find('ul > li:has(strong:contains("Author")) > span > a, ' +
        'ul > li:has(strong:contains("Author")) a').each((_idx, el) => {
        const t = this.strip($(el).text());
        if (t) authorParts.push(t);
      });
      const author = authorParts.join(', ') || this.strip($('li:has(strong:contains("Author")) a').first().text()) || null;

      // Artist: not separately tracked by Kotatsu but we extract it
      const artistParts: string[] = [];
      sectionLeft.find('ul > li:has(strong:contains("Artist")) > span > a, ' +
        'ul > li:has(strong:contains("Artist")) a').each((_idx, el) => {
        const t = this.strip($(el).text());
        if (t) artistParts.push(t);
      });
      const artist = artistParts.join(', ') || this.strip($('li:has(strong:contains("Artist")) a').first().text()) || null;

      // Tags: Kotatsu uses sectionLeft ul > li:has(strong:contains(Tag)) a mapToSet
      const tags: string[] = [];
      const tagsSeen = new Set<string>();
      sectionLeft.find('ul > li:has(strong:contains("Tag")) a').each((_idx, el) => {
        const tag = this.strip($(el).text());
        if (tag && !tagsSeen.has(tag)) {
          tagsSeen.add(tag);
          tags.push(tag);
        }
      });
      // Fallback
      if (tags.length === 0) {
        $('li:has(strong:contains("Tags")) a, li:has(strong:contains("Genre")) a').each((_idx, el) => {
          const tag = this.strip($(el).text());
          if (tag && !tagsSeen.has(tag)) {
            tagsSeen.add(tag);
            tags.push(tag);
          }
        });
      }

      // Description: Kotatsu uses sectionRight li:has(strong:contains(Description)) > p
      const description =
        this.strip(sectionRight.find('li:has(strong:contains("Description")) > p').text()) ||
        this.strip($('li:has(strong:contains("Description")) p').text()) ||
        this.strip($('meta[property="og:description"]').attr('content'));

      // Content rating: Kotatsu checks for "Official Translation: Yes" → SUGGESTIVE
      const isOfficialTranslation =
        sectionLeft.find('ul > li > strong:contains("Official Translation")').length > 0 &&
        sectionLeft.find('ul > li > strong:contains("Official Translation") + a:contains("Yes")').length > 0;
      const contentRating = isOfficialTranslation ? 'suggestive' : 'safe';

      const detail: MangaDetail = {
        id: seriesId,
        title,
        description: description || '',
        coverUrl: coverUrl || null,
        status,
        year: null,
        originalLanguage: null,
        tags,
        latestChapter: null,
        author,
        artist,
        contentRating,
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
      const seriesHtml = await this.fetchHtml(this.toSeriesPath(seriesId));
      const $series = cheerio.load(seriesHtml);

      // Kotatsu: #chapter-list > button[hx-get*=full-chapter-list] (exact parent selector)
      let chapterHtml = seriesHtml;
      const hasFullListButton =
        $series('#chapter-list > button[hx-get*="full-chapter-list"]').length > 0 ||
        $series('button[hx-get*="full-chapter-list"]').length > 0;

      if (hasFullListButton) {
        // Kotatsu hardcodes the canonical path rather than reading hx-get attr
        // (more robust against attribute value drift)
        const fullListPath = `/series/${seriesId}/full-chapter-list`;
        try {
          chapterHtml = await this.fetchHtml(fullListPath);
        } catch {
          // Fall back to the series page if the full list endpoint fails
          chapterHtml = seriesHtml;
        }
      }

      const $ = cheerio.load(chapterHtml);

      // Kotatsu: div[x-data] > a (no href filter — trusts the structure)
      const chapterEls: any[] = [];
      $('div[x-data] > a').each((_idx, el) => {
        // Verify it's actually a chapter link
        const href = $(el).attr('href') || '';
        if (href.includes('/chapters/')) {
          chapterEls.push(el);
        }
      });

      // Kotatsu: mapChapters(reversed=true) — DOM order is newest-first,
      // so reverse to oldest-first for correct sequential numbering
      const reversedEls = [...chapterEls].reverse();

      const results: MangaChapter[] = [];
      const seen = new Set<string>();

      reversedEls.forEach((el, i) => {
        if (results.length >= limit) return;

        const href = $(el).attr('href') || '';
        const chapterId = this.coerceChapterId(href);
        if (!chapterId || seen.has(chapterId)) return;
        seen.add(chapterId);

        // Kotatsu: span.flex > span (selectFirstOrThrow — the name is always there)
        const nameEl = $(el).find('span.flex > span').first();
        const displayText = this.strip(nameEl.text()) || this.strip($(el).text());

        // Kotatsu chapter number regex: (?<!S)\b(\d+(\.\d+)?)\b
        // Negative lookbehind on S prevents matching season/series numbers (e.g. "S1 Ch.10" → 10, not 1)
        const chapterMatch = displayText.match(/(?<!S)\b(\d+(?:\.\d+)?)\b/);
        const chapterNumber = chapterMatch ? parseFloat(chapterMatch[1]) : i + 1;

        // Volume: (?:S|vol(?:ume)?)\s*(\d+) — Kotatsu returns 0 as default
        const volMatch = displayText.match(/(?:S|vol(?:ume)?)\s*(\d+)/i);
        const volume = volMatch ? volMatch[1] : null;

        // Date: time[datetime] attr
        const publishedAt = $(el).find('time[datetime]').first().attr('datetime') || null;

        // Scanlator: svg stroke #d8b4fe = Official (Tailwind purple-300)
        const svgStroke = $(el).find('svg').first().attr('stroke');
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
      // Kotatsu: /chapters/{id}/images?is_prev=False&reading_style=long_strip
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

      // Kotatsu: section[x-data~=scroll] > img using CSS word-match (~=)
      // This matches "scroll" as a whitespace-separated word in the x-data attribute,
      // e.g. x-data="{ scroll: true }" or x-data="scroll" — more precise than substring.
      $('section[x-data~="scroll"] > img').each((_idx, el) => {
        // Kotatsu only reads src. We also check data-src to handle lazy-load placeholders.
        const src = $(el).attr('data-src') || $(el).attr('src');
        pushPage(src);
      });

      // Fallback: if the word-match selector finds nothing, try substring match and broader selectors.
      // This handles edge cases where the x-data format doesn't use whitespace-separated words.
      if (pages.length === 0) {
        $('section[x-data*="scroll"] > img, section[x-data] > img, section img').each((_idx, el) => {
          const src = $(el).attr('data-src') || $(el).attr('src');
          pushPage(src);
        });
      }

      // Last resort: scan raw HTML for image URLs embedded in scripts
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
