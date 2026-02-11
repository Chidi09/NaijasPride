import axios from 'axios';
import * as cheerio from 'cheerio';
import { MadaraBaseSource } from '../base/madara.base';
import {
  MangaChapter,
  MangaDetail,
  MangaDiscoverResult,
  MangaSummary,
} from '../types';
import { summarizeSourceError } from '../utils/error-summary';

const BASE_URL = 'https://manhwatop.com';

export class ManhwaTopSource extends MadaraBaseSource {
  readonly id = 'manhwatop';
  readonly displayName = 'ManhwaTop';

  constructor() {
    super({
      baseUrl: BASE_URL,
      cachePrefix: 'manhwatop',
      defaultCacheTtlSeconds: 600,
    });
  }

  // Kotatsu: ManhwaTop uses postReq = true for chapter loading
  // Use /page/1/?s&post_type=wp-manga for discover (standard Madara)
  async getDiscoverManga(limit = 12): Promise<MangaDiscoverResult> {
    const safeLimit = Math.min(24, Math.max(1, limit));
    const cacheKey = this.buildCacheKey('discover', safeLimit);
    const cached = await this.getFromCache<MangaDiscoverResult>(cacheKey);
    if (cached) return cached;

    try {
      // Use Madara's listing page instead of homepage
      // This is more reliable as homepage might use AJAX
      const html = await this.fetchHtml('/page/1', { 
        s: '', 
        post_type: 'wp-manga',
        m_orderby: 'latest' 
      });
      const $ = cheerio.load(html);
      const seen = new Set<string>();
      const cards: MangaSummary[] = [];

      // Standard Madara selectors
      $('.page-item-detail.manga, .c-tabs-item__content, .manga-item').each((_idx, el) => {
        if (cards.length >= safeLimit) return;

        const link = $(el).find('.post-title a, h3 a, .manga-title a').first();
        const href = link.attr('href');
        const id = href ? this.normalizePath(href, '/') : null;
        if (!id || seen.has(id)) return;
        seen.add(id);

        cards.push({
          id,
          title: this.strip(link.text()) || 'Unknown Title',
          description: this.strip($(el).find('.summary, .description, .excerpt').first().text()),
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

  // Override detail with ManhwaTop-specific selectors
  async getMangaDetail(mangaId: string): Promise<MangaDetail | null> {
    const seriesPath = this.normalizePath(mangaId, '/');
    const cacheKey = this.buildCacheKey('detail', seriesPath);
    const cached = await this.getFromCache<MangaDetail>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(seriesPath);
      const $ = cheerio.load(html);

      // ManhwaTop specific selectors
      const detail: MangaDetail = {
        id: seriesPath,
        title:
          this.strip($('.post-title h1').first().text()) ||
          this.strip($('h1').first().text()) ||
          this.strip($('meta[property="og:title"]').attr('content')) ||
          'Unknown Title',
        description:
          this.strip($('.description-summary .summary__content, .summary__content, .manga-excerpt').first().text()) ||
          this.strip($('meta[property="og:description"]').attr('content')),
        coverUrl:
          this.toAbsoluteUrl($('.summary_image img').first().attr('src')) ||
          this.toAbsoluteUrl($('.manga-thumb img').first().attr('src')) ||
          this.toAbsoluteUrl($('meta[property="og:image"]').attr('content')) ||
          this.toAbsoluteUrl($('img').first().attr('src')),
        status: null,
        year: null,
        originalLanguage: null,
        tags: $('.genres-content a, .genres a, a[href*="genre"], a[href*="tag"]').map((_idx, el) => this.strip($(el).text())).get().filter(Boolean),
        latestChapter: null,
        author: this.strip($('.author-content a, .manga-author a').first().text()) || null,
        artist: this.strip($('.artist-content a, .manga-artist a').first().text()) || null,
        contentRating: null,
        publicationDemographic: null,
        availableTranslatedLanguages: [],
      };

      await this.setCache(cacheKey, detail, this.defaultCacheTtlSeconds * 2);
      return detail;
    } catch (error) {
      console.error(`[ManhwaTop] detail failed: ${summarizeSourceError(error)}`);
      return null;
    }
  }

  // Kotatsu ManhwaTop: Override getChapters with POST request
  // Uses admin-ajax.php endpoint
  async getChapters(mangaId: string, _translatedLanguage?: string, limit = 100): Promise<MangaChapter[]> {
    const seriesPath = this.normalizePath(mangaId, '/');
    const cacheKey = this.buildCacheKey('chapters', seriesPath, limit);
    const cached = await this.getFromCache<MangaChapter[]>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(seriesPath);
      const $ = cheerio.load(html);
      const mangaNodeId = this.strip($('#manga-chapters-holder').attr('data-id'));

      if (!mangaNodeId) {
        return super.getChapters(mangaId, _translatedLanguage, limit);
      }

      const body = new URLSearchParams({
        action: 'manga_get_chapters',
        manga: mangaNodeId,
      });

      const response = await axios.post(`${BASE_URL}/wp-admin/admin-ajax.php`, body.toString(), {
        timeout: 20_000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: `${BASE_URL}${seriesPath}`,
          Accept: 'text/html, */*;q=0.8',
        },
      });

      const chapterHtml = typeof response.data === 'string' ? response.data : '';
      const chapterDoc = cheerio.load(chapterHtml);
      const chapters: MangaChapter[] = [];
      const seen = new Set<string>();

      // Kotatsu: li.wp-manga-chapter - select list items, not just anchors
      chapterDoc('li.wp-manga-chapter').each((index, el) => {
        if (chapters.length >= limit) return;

        const li = chapterDoc(el);
        const a = li.find('a').first();
        const href = a.attr('href');
        const chapterPath = href ? this.normalizePath(href, '/') : null;
        if (!chapterPath || seen.has(chapterPath)) return;
        seen.add(chapterPath);

        // Kotatsu: name from a.selectFirst("p")?.text() ?: a.ownText()
        const title = this.strip(a.find('p').first().text()) || this.strip(a.text());

        // Kotatsu: date from li.selectFirst("a.c-new-tag")?.attr("title") ?: li.selectFirst(selectDate)?.text()
        // selectDate = "span.chapter-release-date i"
        const dateText = li.find('a.c-new-tag').attr('title') ||
                        li.find('span.chapter-release-date i').text();

        let publishedAt: string | null = null;
        if (dateText) {
          // Parse date like "January 7, 2026"
          try {
            const date = new Date(dateText);
            if (!isNaN(date.getTime())) {
              publishedAt = date.toISOString();
            }
          } catch {
            // Keep null if parsing fails
          }
        }

        // Kotatsu: use index + 1 for chapter number
        const chapterNumber = String(index + 1);

        chapters.push({
          id: chapterPath,
          chapter: chapterNumber,
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
      console.error(`[ManhwaTop] chapter fetch failed: ${summarizeSourceError(error)}`);
      return super.getChapters(mangaId, _translatedLanguage, limit);
    }
  }
}
