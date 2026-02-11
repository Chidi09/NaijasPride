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
const IMAGE_CDN = 'https://sb.mbcdn.xyz';

export class MangabuddySource extends BaseHtmlSource {
  readonly id = 'mangabuddy';
  readonly displayName = 'MangaBuddy';
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
      cachePrefix: 'mangabuddy',
      defaultCacheTtlSeconds: 600,
    });
  }

  // Kotatsu MadthemeParser: listUrl = "search/"
  // Kotatsu: datePattern = "MMM dd, yyyy"

  private extractSlugFromPath(path: string): string {
    return path.replace(/^\/+|\/+$/g, '');
  }

  // Kotatsu: getListPage with /search/?page=X&sort=updated_at
  async getDiscoverManga(limit = 12): Promise<MangaDiscoverResult> {
    const safeLimit = Math.min(48, Math.max(1, limit));
    const cacheKey = this.buildCacheKey('discover', safeLimit);
    const cached = await this.getFromCache<MangaDiscoverResult>(cacheKey);
    if (cached) return cached;

    try {
      // Kotatsu: /search/?page=1&sort=updated_at
      const html = await this.fetchHtml('/search', { 
        page: 1, 
        sort: 'updated_at'
      });
      const $ = cheerio.load(html);
      const cards: MangaSummary[] = [];

      // Kotatsu: div.book-item
      $('div.book-item').each((_idx, el) => {
        if (cards.length >= safeLimit) return;

        const $el = $(el);
        const $a = $el.find('a').first();
        const href = $a.attr('href');
        if (!href) return;

        const id = this.extractSlugFromPath(href);
        if (!id) return;

        // Kotatsu: div.meta div.title
        const title = this.strip($el.find('div.meta div.title').text()) ||
                     this.strip($el.find('div.title').first().text());
        
        if (!title || title.length < 2) return;

        // Kotatsu: img (src)
        const coverUrl = this.toAbsoluteUrl($el.find('img').first().attr('src') || null);

        // Kotatsu: div.meta span.score for rating
        const ratingText = this.strip($el.find('div.meta span.score').text());

        cards.push({
          id,
          title,
          description: '',
          coverUrl,
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

  async searchManga(query?: string, limit = 20, filters: MangaSearchFilters = {}): Promise<MangaSummary[]> {
    const normalized = this.strip(query);
    if (!normalized) {
      const discover = await this.getDiscoverManga(limit);
      return discover.trending.slice(0, limit);
    }

    const cacheKey = this.buildCacheKey('search', normalized.toLowerCase(), limit);
    const cached = await this.getFromCache<MangaSummary[]>(cacheKey);
    if (cached) return cached;

    try {
      // Kotatsu: /search/?page=1&q=query&sort=views (or relevance)
      const sortParam = filters.sort === 'followedCount' ? 'views' : 
                       filters.sort === 'createdAt' ? 'created_at' : 
                       'updated_at';
      
      const html = await this.fetchHtml('/search', { 
        page: 1, 
        q: normalized,
        sort: sortParam
      });
      const $ = cheerio.load(html);
      const results: MangaSummary[] = [];

      $('div.book-item').each((_idx, el) => {
        if (results.length >= limit) return;

        const $el = $(el);
        const $a = $el.find('a').first();
        const href = $a.attr('href');
        if (!href) return;

        const id = this.extractSlugFromPath(href);
        if (!id) return;

        const title = this.strip($el.find('div.meta div.title').text()) ||
                     this.strip($el.find('div.title').first().text());
        
        if (!title || title.length < 2) return;

        const coverUrl = this.toAbsoluteUrl($el.find('img').first().attr('src') || null);

        results.push({
          id,
          title,
          description: '',
          coverUrl,
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

  async getMangaTags(): Promise<MangaTag[]> {
    const cacheKey = this.buildCacheKey('tags');
    const cached = await this.getFromCache<MangaTag[]>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml('/search');
      const $ = cheerio.load(html);
      const tags: MangaTag[] = [];
      const seen = new Set<string>();

      // Kotatsu: div.genres .checkbox
      $('div.genres .checkbox').each((_idx, el) => {
        const $input = $(el).find('input');
        const id = $input.attr('value');
        const name = this.strip($(el).find('span.radio__label').text()) || id;
        
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

  // Kotatsu: selectDesc = "div.section-body.summary p.content"
  // Kotatsu: selectState = "div.detail p:contains(Status) span"
  // Kotatsu: selectAlt = "div.detail div.name h2"
  // Kotatsu: selectTag = "div.detail p:contains(Genres) a"
  async getMangaDetail(mangaId: string): Promise<MangaDetail | null> {
    const seriesPath = `/${mangaId}`;
    const cacheKey = this.buildCacheKey('detail', mangaId);
    const cached = await this.getFromCache<MangaDetail>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(seriesPath);
      const $ = cheerio.load(html);

      // Kotatsu: div.detail div.name h1 (title)
      const title = this.strip($('div.detail div.name h1').text()) ||
                   this.strip($('h1').first().text()) ||
                   this.strip($('meta[property="og:title"]').attr('content')) ||
                   'Unknown Title';

      // Kotatsu: div.section-body.summary p.content
      const description = this.strip($('div.section-body.summary p.content').text()) ||
                         this.strip($('meta[property="og:description"]').attr('content'));

      // Kotatsu: div.detail div.name h2 (alt title)
      const altTitle = this.strip($('div.detail div.name h2').text());

      // Kotatsu: div.detail p:contains(Status) span
      const statusText = this.strip($('div.detail p:contains("Status") span').text());
      const status = statusText === 'Ongoing' ? 'ongoing' :
                    statusText === 'Completed' ? 'completed' : null;

      // Kotatsu: div.detail p:contains(Genres) a
      const tags: string[] = [];
      $('div.detail p:contains("Genres") a').each((_idx, el) => {
        const tag = this.strip($(el).text());
        if (tag) tags.push(tag);
      });

      const detail: MangaDetail = {
        id: mangaId,
        title,
        description,
        coverUrl: this.toAbsoluteUrl($('meta[property="og:image"]').attr('content')),
        status,
        year: null,
        originalLanguage: null,
        tags,
        latestChapter: null,
        author: this.strip($('div.detail p:contains("Author") a').text()) || null,
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

  // Kotatsu: getChapters - uses API endpoint
  // First extract bookSlug from script, then call /api/manga/{slug}/chapters?source=detail
  async getChapters(mangaId: string, _translatedLanguage?: string, limit = 100): Promise<MangaChapter[]> {
    const cacheKey = this.buildCacheKey('chapters', mangaId, limit);
    const cached = await this.getFromCache<MangaChapter[]>(cacheKey);
    if (cached) return cached;

    try {
      // First, get the manga page to extract bookSlug
      const seriesHtml = await this.fetchHtml(`/${mangaId}`);
      const $series = cheerio.load(seriesHtml);
      
      // Improved: Try multiple methods to extract bookSlug
      let bookSlug: string | null = null;
      
      // Method 1: Look for bookSlug in all script tags with multiple patterns
      $series('script').each((_idx, el) => {
        if (bookSlug) return;
        const script = $series(el).html() || '';
        
        // Try multiple regex patterns
        const patterns = [
          /bookSlug\s*[:=]\s*["']([^"']+)["']/,
          /["']bookSlug["']\s*:\s*["']([^"']+)["']/,
          /bookSlug\s*:\s*["']([^"']+)["']/,
        ];
        
        for (const pattern of patterns) {
          const match = script.match(pattern);
          if (match && match[1]) {
            bookSlug = match[1];
            return;
          }
        }
      });
      
      // Method 2: Try to find in data attributes
      if (!bookSlug) {
        bookSlug = $series('[data-book-slug]').attr('data-book-slug') ??
                   $series('[data-slug]').attr('data-slug') ??
                   null;
      }
      
      // Method 3: Try to construct from the URL
      if (!bookSlug) {
        // If mangaId looks like a slug, use it directly
        if (mangaId && !mangaId.includes(':')) {
          bookSlug = mangaId;
        }
      }

      if (!bookSlug) {
        console.error('[MangaBuddy] Could not extract bookSlug for:', mangaId);
        return [];
      }

      // Use fetchGateway instead of raw axios for better error handling and FlareSolverr support
      const apiUrl = `/api/manga/${bookSlug}/chapters?source=detail`;
      const response = await this.fetchGateway.get(apiUrl, {
        sourceId: this.id,
        timeoutMs: 20_000,
        headers: {
          'Accept': 'text/html, */*',
          'Referer': `${BASE_URL}/${mangaId}`,
        },
      });

      const chapterHtml = response.body || '';
      const $chapters = cheerio.load(chapterHtml);
      const chapters: MangaChapter[] = [];

      // Kotatsu: ul#chapter-list li
      $chapters('ul#chapter-list li').each((index, el) => {
        if (chapters.length >= limit) return;

        const $li = $chapters(el);
        const $a = $li.find('a').first();
        const href = $a.attr('href');
        if (!href) return;

        const chapterId = this.extractSlugFromPath(href);
        if (!chapterId) return;

        // Kotatsu: .chapter-title for title
        const title = this.strip($li.find('.chapter-title').text()) ||
                     this.strip($a.find('p').text()) ||
                     this.strip($a.text());

        // Kotatsu: div .chapter-update for date
        const dateText = this.strip($li.find('div.chapter-update').text());
        let publishedAt: string | null = null;
        if (dateText) {
          try {
            // Parse "Jan 15, 2024" format
            const date = new Date(dateText);
            if (!isNaN(date.getTime())) {
              publishedAt = date.toISOString();
            }
          } catch {
            // Keep null if parsing fails
          }
        }

        // Kotatsu: number = i + 1 (index-based)
        chapters.push({
          id: chapterId,
          chapter: String(index + 1),
          volume: null,
          title: title || null,
          publishedAt,
          scanlationGroup: null,
          branch: null,
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

  // Kotatsu: getPages
  // Kotatsu: selectPage = "div#chapter-images img"
  // Also extracts from chapImages regex
  async getChapterPages(chapterId: string): Promise<MangaPagesResult> {
    const cacheKey = this.buildCacheKey('pages', chapterId);
    const cached = await this.getFromCache<MangaPagesResult>(cacheKey);
    if (cached && (cached.pages.length > 0 || cached.externalUrl)) return cached;

    try {
      const html = await this.fetchHtml(`/${chapterId}`);
      const $ = cheerio.load(html);
      const pages: string[] = [];
      const seen = new Set<string>();

      // Method 1: Kotatsu HTML parsing - div#chapter-images img
      // Improved: Better CDN URL transformation with duplicate prevention
      $('div#chapter-images img').each((_idx, el) => {
        const src = $(el).attr('src');
        if (src && !seen.has(src)) {
          seen.add(src);
          // Transform to CDN URL if needed, but avoid double transformation
          if (src.includes(IMAGE_CDN)) {
            pages.push(src);
          } else if (src.includes('/manga')) {
            const cleanUrl = src.replace(/^.*?\/manga/i, '');
            pages.push(`${IMAGE_CDN}/manga${cleanUrl}`);
          } else {
            pages.push(src);
          }
        }
      });

      // Method 2: Kotatsu JS parsing - chapImages regex
      // Improved: Prevent double transformation by checking if already CDN URL
      const regexPages = /chapImages\s*=\s*['"](.*?)['"]/;
      $('script').each((_idx, el) => {
        if (pages.length > 0) return; // Skip if we already have pages from Method 1
        const script = $(el).html() || '';
        const match = regexPages.exec(script);
        if (match && match[1]) {
          const urls = match[1].split(',');
          urls.forEach(url => {
            if (url && !seen.has(url)) {
              seen.add(url);
              // Only transform if not already a CDN URL
              if (url.includes(IMAGE_CDN)) {
                pages.push(url);
              } else if (url.includes('/manga')) {
                const cleanUrl = url.replace(/^.*?\/manga/i, '');
                pages.push(`${IMAGE_CDN}/manga${cleanUrl}`);
              } else {
                pages.push(url);
              }
            }
          });
        }
      });

      if (pages.length === 0) {
        sourceMetrics.incrementParseEmptyPages(this.id);
        return {
          chapterId,
          readerMode: 'standard',
          pages: [],
          externalUrl: `${BASE_URL}/${chapterId}`,
          isExternal: true,
        };
      }

      const result: MangaPagesResult = {
        chapterId,
        readerMode: 'standard',
        pages,
        externalUrl: null,
        isExternal: false,
      };

      await this.setCache(cacheKey, result, this.defaultCacheTtlSeconds * 2);
      return result;
    } catch (error) {
      console.error(`[MangaBuddy] page fetch failed: ${summarizeSourceError(error)}`);
      return {
        chapterId,
        readerMode: 'standard',
        pages: [],
        externalUrl: `${BASE_URL}/${chapterId}`,
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
