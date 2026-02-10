import { createDecipheriv, createHash } from 'node:crypto';
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

const BASE_URL = 'https://bato.to';

export class BatoSource extends BaseHtmlSource {
  readonly id = 'bato';
  readonly displayName = 'Bato.To';
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
      cachePrefix: 'bato',
      defaultCacheTtlSeconds: 600,
    });
  }

  private extractSeriesId(href: string): string | null {
    const match = href.match(/\/series\/([^/?#]+)/i);
    return match ? match[1] : null;
  }

  private extractChapterId(href: string): string | null {
    const match = href.match(/\/chapter\/([^/?#]+)/i);
    return match ? match[1] : null;
  }

  private coerceSeriesId(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^[0-9]+(?:-[a-z0-9-]+)?$/i.test(trimmed)) return trimmed;
    return this.extractSeriesId(trimmed);
  }

  private coerceChapterId(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed;
    return this.extractChapterId(trimmed);
  }

  private toSeriesPath(seriesId: string): string {
    return `/series/${seriesId}`;
  }

  private toChapterPath(chapterId: string): string {
    return `/chapter/${chapterId}`;
  }

  private parseCard($: cheerio.CheerioAPI, el: any): MangaSummary | null {
    const root = $(el);
    const link = root.find('a[href*="/series/"]').first();
    const href = link.attr('href');
    const seriesId = href ? this.extractSeriesId(href) : null;
    if (!seriesId) return null;

    const title =
      this.strip(root.find('.item-title').first().text()) ||
      this.strip(link.attr('title')) ||
      this.strip(link.text()) ||
      'Unknown Title';

    const coverUrl =
      this.toAbsoluteUrl(root.find('img').first().attr('src') || null) ||
      this.toAbsoluteUrl(root.find('img').first().attr('data-src') || null);

    const tags = root
      .find('.item-genre span, .item-genre a')
      .map((_idx, tagEl) => this.strip($(tagEl).text()))
      .get()
      .filter(Boolean);

    return {
      id: seriesId,
      title,
      description: this.strip(root.find('.item-description, .summary').first().text()),
      coverUrl,
      status: null,
      year: null,
      originalLanguage: null,
      tags,
      latestChapter: this.strip(root.find('.item-volch a, .item-volch').first().text()) || null,
    };
  }

  private parseCardsFromHtml(html: string, limit: number): MangaSummary[] {
    const $ = cheerio.load(html);
    const seen = new Set<string>();
    const results: MangaSummary[] = [];

    $('#series-list > *, .series-list > *, .item').each((_idx, el) => {
      if (results.length >= limit) return;
      const card = this.parseCard($, el);
      if (!card || seen.has(card.id)) return;
      seen.add(card.id);
      results.push(card);
    });

    if (results.length > 0) {
      return results;
    }

    $('a[href*="/series/"]').each((_idx, el) => {
      if (results.length >= limit) return;
      const href = $(el).attr('href');
      const seriesId = href ? this.extractSeriesId(href) : null;
      if (!seriesId || seen.has(seriesId)) return;
      seen.add(seriesId);

      results.push({
        id: seriesId,
        title: this.strip($(el).find('.item-title').first().text()) || this.strip($(el).text()) || 'Unknown Title',
        description: '',
        coverUrl:
          this.toAbsoluteUrl($(el).find('img').first().attr('src') || null) ||
          this.toAbsoluteUrl($(el).find('img').first().attr('data-src') || null),
        status: null,
        year: null,
        originalLanguage: null,
        tags: [],
        latestChapter: null,
      });
    });

    return results;
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
      const html = await this.fetchHtml('/search', { word: normalized, page: 1 });
      const results = this.parseCardsFromHtml(html, limit);
      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error(`[Bato] search failed: ${summarizeSourceError(error)}`);
      return [];
    }
  }

  async getDiscoverManga(limit = 12): Promise<MangaDiscoverResult> {
    const safeLimit = Math.min(24, Math.max(1, limit));
    const cacheKey = this.buildCacheKey('discover', safeLimit);
    const cached = await this.getFromCache<MangaDiscoverResult>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml('/browse', { sort: 'update.za', page: 1 });
      const cards = this.parseCardsFromHtml(html, safeLimit);

      const payload: MangaDiscoverResult = {
        trending: cards.slice(0, safeLimit),
        recentlyUpdated: cards.slice(0, safeLimit),
        newTitles: cards.slice(0, safeLimit),
      };

      await this.setCache(cacheKey, payload);
      return payload;
    } catch (error) {
      console.error(`[Bato] discover failed: ${summarizeSourceError(error)}`);
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

      const detail: MangaDetail = {
        id: seriesId,
        title:
          this.strip($('h3.item-title').first().text()) ||
          this.strip($('h1').first().text()) ||
          this.strip($('meta[property="og:title"]').attr('content')) ||
          'Unknown Title',
        description:
          this.strip($('#limit-height-body-summary .limit-html').first().text()) ||
          this.strip($('meta[property="og:description"]').attr('content')) ||
          this.strip($('.summary').first().text()),
        coverUrl:
          this.toAbsoluteUrl($('meta[property="og:image"]').attr('content')) ||
          this.toAbsoluteUrl($('.detail-set img').first().attr('src') || null),
        status: null,
        year: null,
        originalLanguage: null,
        tags: $('.item-genre span, .item-genre a, a[href*="/genres/"]')
          .map((_idx, el) => this.strip($(el).text()))
          .get()
          .filter(Boolean),
        latestChapter: null,
        author: this.strip($('.attr-item:contains("Authors:")').first().find(':nth-child(2)').text()) || null,
        artist: null,
        contentRating: null,
        publicationDemographic: null,
        availableTranslatedLanguages: [],
      };

      await this.setCache(cacheKey, detail, this.defaultCacheTtlSeconds * 2);
      return detail;
    } catch (error) {
      console.error(`[Bato] detail failed: ${summarizeSourceError(error)}`);
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

      $('.episode-list .main > *, a.chapt, a[href*="/chapter/"]').each((_idx, el) => {
        if (chapters.length >= limit) return;

        const link = $(el).is('a') ? $(el) : $(el).find('a.chapt, a[href*="/chapter/"]').first();
        const href = link.attr('href');
        const chapterId = href ? this.coerceChapterId(href) : null;
        if (!chapterId || seen.has(chapterId)) return;
        seen.add(chapterId);

        const text = this.strip(link.text());
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
      console.error(`[Bato] chapter fetch failed: ${summarizeSourceError(error)}`);
      return [];
    }
  }

  private parseScriptArray(raw: string): string[] {
    const normalized = raw.trim();
    if (!normalized.startsWith('[') || !normalized.endsWith(']')) return [];

    try {
      const parsed = JSON.parse(normalized) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((value): value is string => typeof value === 'string');
    } catch {
      return [];
    }
  }

  private parseJsStringLiteral(expression: string): string | null {
    const trimmed = expression.trim();
    const quote = trimmed[0];
    if ((quote !== '"' && quote !== "'") || trimmed[trimmed.length - 1] !== quote) {
      return null;
    }

    try {
      return JSON.parse(`"${trimmed.slice(1, -1).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
    } catch {
      return trimmed.slice(1, -1);
    }
  }

  private decryptAesSaltedBase64(encrypted: string, password: string): string | null {
    try {
      const cipherData = Buffer.from(encrypted, 'base64');
      if (cipherData.length <= 16 || cipherData.subarray(0, 8).toString('utf8') !== 'Salted__') {
        return null;
      }

      const salt = cipherData.subarray(8, 16);
      const encryptedData = cipherData.subarray(16);

      const keyIv = Buffer.alloc(48);
      let offset = 0;
      let block = Buffer.alloc(0);
      while (offset < keyIv.length) {
        const hash = createHash('md5');
        hash.update(block);
        hash.update(Buffer.from(password, 'utf8'));
        hash.update(salt);
        block = hash.digest();
        block.copy(keyIv, offset);
        offset += block.length;
      }

      const key = keyIv.subarray(0, 32);
      const iv = keyIv.subarray(32, 48);
      const decipher = createDecipheriv('aes-256-cbc', key, iv);
      const plaintext = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
      return plaintext.toString('utf8');
    } catch {
      return null;
    }
  }

  private extractBatoPageUrls(html: string): string[] {
    const $ = cheerio.load(html);

    for (const scriptEl of $('script').toArray()) {
      const script = $(scriptEl).html() || '';
      if (!script.includes('imgHttps')) continue;

      const imagesMatch = script.match(/const\s+imgHttps\s*=\s*(\[[\s\S]*?\]);/);
      if (!imagesMatch) continue;

      const rawImages = this.parseScriptArray(imagesMatch[1]);
      if (rawImages.length === 0) continue;

      const passExpr = script.match(/batoPass\s*=\s*([^;]+);/)?.[1];
      const wordExpr = script.match(/batoWord\s*=\s*([^;]+);/)?.[1];
      const batoPass = passExpr ? this.parseJsStringLiteral(passExpr) : null;
      const batoWord = wordExpr ? this.parseJsStringLiteral(wordExpr) : null;

      let args: string[] = [];
      if (batoPass && batoWord) {
        const decrypted = this.decryptAesSaltedBase64(batoWord, batoPass);
        if (decrypted) {
          args = this.parseScriptArray(decrypted);
        }
      }

      const pages: string[] = [];
      for (let index = 0; index < rawImages.length; index += 1) {
        const base = this.toAbsoluteUrl(rawImages[index]);
        if (!base) continue;
        pages.push(args[index] ? `${base}?${args[index]}` : base);
      }

      if (pages.length > 0) {
        return pages;
      }
    }

    return [];
  }

  async getChapterPages(chapterId: string): Promise<MangaPagesResult> {
    const rawChapterId = this.coerceChapterId(chapterId);
    if (!rawChapterId) {
      return {
        chapterId,
        readerMode: 'manga',
        pages: [],
        externalUrl: null,
        isExternal: false,
      };
    }

    const chapterPath = this.toChapterPath(rawChapterId);
    const cacheKey = this.buildCacheKey('pages', rawChapterId);
    const cached = await this.getFromCache<MangaPagesResult>(cacheKey);
    if (cached && (cached.pages.length > 0 || cached.externalUrl)) return cached;

    try {
      const html = await this.fetchHtml(chapterPath);
      const parsedPages = this.extractBatoPageUrls(html);
      const fallbackPages = parsedPages.length > 0 ? parsedPages : this.extractChapterImageUrls(html);

      if (fallbackPages.length === 0) {
        sourceMetrics.incrementParseEmptyPages(this.id);
        const externalResult: MangaPagesResult = {
          chapterId: rawChapterId,
          readerMode: 'manga',
          pages: [],
          externalUrl: `${BASE_URL}${chapterPath}`,
          isExternal: true,
        };
        await this.setCache(cacheKey, externalResult, this.defaultCacheTtlSeconds * 2);
        return externalResult;
      }

      const result: MangaPagesResult = {
        chapterId: rawChapterId,
        readerMode: 'manga',
        pages: fallbackPages,
        externalUrl: null,
        isExternal: false,
      };

      await this.setCache(cacheKey, result, this.defaultCacheTtlSeconds * 2);
      return result;
    } catch (error) {
      console.error(`[Bato] page fetch failed: ${summarizeSourceError(error)}`);
      return {
        chapterId: rawChapterId,
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
        message: ok ? undefined : `Bato status ${response.status}`,
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
