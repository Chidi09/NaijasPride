import axios from 'axios';
import * as cheerio from 'cheerio';
import { MadaraBaseSource } from '../base/madara.base';
import { MangaChapter } from '../types';
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

  async getChapters(mangaId: string, translatedLanguage?: string, limit = 100): Promise<MangaChapter[]> {
    const seriesPath = this.normalizePath(mangaId, '/');
    const languageKey = translatedLanguage?.trim()?.toLowerCase() || 'all';
    const cacheKey = this.buildCacheKey('chapters', seriesPath, languageKey, limit);
    const cached = await this.getFromCache<MangaChapter[]>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(seriesPath);
      const $ = cheerio.load(html);
      const mangaNodeId = this.strip($('#manga-chapters-holder').attr('data-id'));

      if (!mangaNodeId) {
        return super.getChapters(mangaId, translatedLanguage, limit);
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

      chapterDoc('li.wp-manga-chapter a, .listing-chapters_wrap a').each((_idx, el) => {
        if (chapters.length >= limit) return;

        const href = chapterDoc(el).attr('href');
        const chapterPath = href ? this.normalizePath(href, '/') : null;
        if (!chapterPath || seen.has(chapterPath)) return;
        seen.add(chapterPath);

        const title = this.strip(chapterDoc(el).text());
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
    } catch (error) {
      console.error(`[ManhwaTop] chapter fetch failed: ${summarizeSourceError(error)}`);
      return super.getChapters(mangaId, translatedLanguage, limit);
    }
  }
}
