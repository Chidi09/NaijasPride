import * as cheerio from "cheerio";
import { sourceMetrics } from "../observability/source-metrics";
import {
  MangaChapter,
  MangaDetail,
  MangaDiscoverResult,
  MangaPagesResult,
  MangaSearchFilters,
  MangaSummary,
  MangaTag,
} from "../types";
import { BaseHtmlSource } from "./base-html.source";

export abstract class WpComicsBaseSource extends BaseHtmlSource {
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
    this.listPath = options.listPath || "/tim-truyen";
  }

  async searchManga(
    query?: string,
    limit = 20,
    _filters: MangaSearchFilters = {},
  ): Promise<MangaSummary[]> {
    const normalized = this.strip(query);
    if (!normalized) return [];

    const cacheKey = this.buildCacheKey(
      "search",
      normalized.toLowerCase(),
      limit,
    );
    const cached = await this.getFromCache<MangaSummary[]>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(this.listPath, {
        keyword: normalized,
        page: 1,
      });
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
    const cacheKey = this.buildCacheKey("discover", safeLimit);
    const cached = await this.getFromCache<MangaDiscoverResult>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(this.listPath, { sort: 0, page: 1 });
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
    const cacheKey = this.buildCacheKey("tags");
    const cached = await this.getFromCache<MangaTag[]>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(this.listPath);
      const $ = cheerio.load(html);
      const tags: MangaTag[] = [];
      const seen = new Set<string>();

      $("div.dropdown-genres select option").each((_idx, el) => {
        const raw = this.strip($(el).attr("value"));
        const id = raw.substring(raw.lastIndexOf("/") + 1);
        const name = this.strip($(el).text());
        if (!id || !name || seen.has(id)) return;
        seen.add(id);
        tags.push({ id, name, group: "genre" });
      });

      await this.setCache(cacheKey, tags, this.defaultCacheTtlSeconds * 8);
      return tags;
    } catch {
      return [];
    }
  }

  async getMangaDetail(mangaId: string): Promise<MangaDetail | null> {
    const seriesPath = this.normalizePath(mangaId, "/");
    const cacheKey = this.buildCacheKey("detail", seriesPath);
    const cached = await this.getFromCache<MangaDetail>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(seriesPath);
      const $ = cheerio.load(html);

      const statusText = this.strip(
        $("div.col-info li.status p:not(.name), li.status p.col-xs-8")
          .first()
          .text() ||
          $('*:contains("Tình trạng")').first().text() ||
          $('*:contains("Status")').first().text(),
      );
      const status = this.parseStatusText(statusText);

      const detail: MangaDetail = {
        id: seriesPath,
        title:
          this.strip($("h1.title-detail, h1").first().text()) ||
          this.strip($('meta[property="og:title"]').attr("content")) ||
          "Unknown Title",
        description:
          this.strip($('meta[property="og:description"]').attr("content")) ||
          this.strip(
            $("div.detail-content p, .detail-content, .summary").first().text(),
          ),
        coverUrl:
          this.toAbsoluteUrl($('meta[property="og:image"]').attr("content")) ||
          this.toAbsoluteUrl(
            $("div.col-image img, .detail-info img, img")
              .first()
              .attr("data-original"),
          ) ||
          this.toAbsoluteUrl(
            $("div.col-image img, .detail-info img, img").first().attr("src"),
          ),
        status,
        year: null,
        originalLanguage: null,
        tags: $(
          'div.col-info li.kind a, li.kind p.col-xs-8 a, a[href*="the-loai"], a[href*="genre"]',
        )
          .map((_idx, el) => this.strip($(el).text()))
          .get()
          .filter(Boolean),
        latestChapter:
          this.strip($("div.list-chapter li.row a").first().text()) || null,
        author:
          this.strip(
            $("div.col-info li.author p:not(.name), li.author p.col-xs-8")
              .first()
              .text(),
          ) || null,
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

  async getChapters(
    mangaId: string,
    translatedLanguage?: string,
    limit = 100,
  ): Promise<MangaChapter[]> {
    const seriesPath = this.normalizePath(mangaId, "/");
    const languageKey = translatedLanguage?.trim()?.toLowerCase() || "all";
    const cacheKey = this.buildCacheKey(
      "chapters",
      seriesPath,
      languageKey,
      limit,
    );
    const cached = await this.getFromCache<MangaChapter[]>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(seriesPath);
      const $ = cheerio.load(html);
      const chapters: MangaChapter[] = [];
      const seen = new Set<string>();

      $(
        "div.list-chapter li.row:not(.heading) a, #nt_listchapter nav ul li:not(.heading) a",
      ).each((index, el) => {
        if (chapters.length >= limit) return;

        const href = $(el).attr("href");
        const chapterPath = href ? this.normalizePath(href, "/") : null;
        if (!chapterPath || seen.has(chapterPath)) return;
        seen.add(chapterPath);

        const text = this.strip($(el).text());
        const chapterMatch = text.match(/chapter\s*[:\-]?\s*([\d.]+)/i);
        const langMatch = text.match(
          /\b(EN|JP|KR|CN|ES|PT|FR|DE|ID|TH|VI|TR|RU|AR)\b/i,
        );
        const chapterLanguage = langMatch?.[1]?.toLowerCase() || null;

        if (
          translatedLanguage &&
          chapterLanguage &&
          chapterLanguage !== translatedLanguage.toLowerCase()
        ) {
          return;
        }

        chapters.push({
          id: chapterPath,
          chapter: (() => {
            const match = text.match(/\b(\d+(?:\.\d+)?)\b/);
            return match ? match[1] : String(index + 1);
          })(),
          volume: null,
          title: text || null,
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
    const chapterPath = this.normalizePath(chapterId, "/");
    const cacheKey = this.buildCacheKey("pages", chapterPath);
    const cached = await this.getFromCache<MangaPagesResult>(cacheKey);
    if (cached && (cached.pages.length > 0 || cached.externalUrl))
      return cached;

    try {
      const html = await this.fetchHtml(chapterPath);
      const pages = this.extractChapterImageUrls(html);
      if (pages.length === 0) {
        sourceMetrics.incrementParseEmptyPages(this.id);
        const externalResult: MangaPagesResult = {
          chapterId: chapterPath,
          readerMode: "reversed",
          pages: [],
          externalUrl: `${this.baseUrl}${chapterPath}`,
          isExternal: true,
        };
        await this.setCache(
          cacheKey,
          externalResult,
          this.defaultCacheTtlSeconds * 2,
        );
        return externalResult;
      }

      const result: MangaPagesResult = {
        chapterId: chapterPath,
        readerMode: "reversed",
        pages,
        externalUrl: null,
        isExternal: false,
      };

      await this.setCache(cacheKey, result, this.defaultCacheTtlSeconds * 2);
      return result;
    } catch {
      return {
        chapterId: chapterPath,
        readerMode: "reversed",
        pages: [],
        externalUrl: `${this.baseUrl}${chapterPath}`,
        isExternal: true,
      };
    }
  }

  async healthCheck(): Promise<{
    ok: boolean;
    latencyMs: number;
    message?: string;
  }> {
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
        message: ok
          ? undefined
          : `${this.displayName} status ${response.status}`,
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        message:
          error instanceof Error
            ? error.message
            : `${this.displayName} health check failed`,
      };
    }
  }

  protected extractMangaCards(
    $: cheerio.CheerioAPI,
    limit: number,
  ): MangaSummary[] {
    const cards: MangaSummary[] = [];
    const seen = new Set<string>();

    $("div.items div.item, div.items article.item, li.row, .item").each(
      (_idx, el) => {
        if (cards.length >= limit) return;

        const link = $(el).find("a[href]").first();
        const href = link.attr("href");
        const id = href ? this.normalizePath(href, "/") : null;
        if (!id || seen.has(id)) return;
        seen.add(id);

        cards.push({
          id,
          title:
            this.strip($(el).find("h3 a, .title").first().text()) ||
            this.strip(link.attr("title")) ||
            this.strip(link.text()) ||
            "Unknown Title",
          description: this.strip(
            $(el).find(".box_text, .summary, .description").first().text(),
          ),
          coverUrl:
            this.toAbsoluteUrl(
              $(el).find("img").first().attr("data-original"),
            ) ||
            this.toAbsoluteUrl($(el).find("img").first().attr("data-src")) ||
            this.toAbsoluteUrl($(el).find("img").first().attr("src")),
          status: null,
          year: null,
          originalLanguage: null,
          tags: [],
          latestChapter: null,
        });
      },
    );

    return cards;
  }

  protected parseStatusText(value: string): string | null {
    const lowered = value.toLowerCase();
    if (!lowered) return null;
    if (
      lowered.includes("ongoing") ||
      lowered.includes("updating") ||
      lowered.includes("đang") ||
      lowered.includes("連載")
    ) {
      return "ongoing";
    }
    if (
      lowered.includes("completed") ||
      lowered.includes("complete") ||
      lowered.includes("hoàn thành") ||
      lowered.includes("完結")
    ) {
      return "completed";
    }
    return this.strip(value) || null;
  }
}
