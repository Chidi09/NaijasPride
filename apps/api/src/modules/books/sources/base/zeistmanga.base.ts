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

type BloggerEntry = {
  title?: { $t?: string };
  link?: Array<{ rel?: string; href?: string }>;
  content?: { $t?: string };
  published?: { $t?: string };
  ["media$thumbnail"]?: { url?: string };
};

export abstract class ZeistMangaBaseSource extends BaseHtmlSource {
  readonly capabilities = {
    supportsFilters: true,
    supportsLanguages: false,
    supportsSimilar: false,
    supportsDiscover: true,
    supportsTags: true,
    supportsExternalRedirect: true,
    needsAntiBot: false,
  } as const;

  protected readonly seriesFeedLabel: string;
  protected readonly maxResults: number;

  constructor(options: {
    baseUrl: string;
    cachePrefix: string;
    seriesFeedLabel?: string;
    maxResults?: number;
    defaultCacheTtlSeconds?: number;
  }) {
    super(options);
    this.seriesFeedLabel = options.seriesFeedLabel || "Series";
    this.maxResults = options.maxResults ?? 20;
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
      const entries = await this.fetchFeedEntries(
        this.seriesFeedLabel,
        normalized,
        1,
        Math.min(limit + 5, 50),
      );
      const mapped = this.mapFeedEntriesToSummary(entries, limit);
      await this.setCache(cacheKey, mapped);
      return mapped;
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
      const entries = await this.fetchFeedEntries(
        this.seriesFeedLabel,
        undefined,
        1,
        safeLimit + 5,
      );
      const cards = this.mapFeedEntriesToSummary(entries, safeLimit);
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
      const html = await this.fetchHtml("/");
      const $ = cheerio.load(html);
      const tags: MangaTag[] = [];
      const seen = new Set<string>();

      $("div.filter ul li").each((_idx, el) => {
        const id = this.strip($(el).find("input").attr("value"));
        const name =
          this.strip($(el).find("label").text()) || this.strip($(el).text());
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

      const detail: MangaDetail = {
        id: seriesPath,
        title:
          this.strip($("h1").first().text()) ||
          this.strip($('meta[property="og:title"]').attr("content")) ||
          "Unknown Title",
        description:
          this.strip($('meta[property="og:description"]').attr("content")) ||
          this.strip(
            $(
              "#synopsis, #Sinopse, #sinopas, .sinopsis, .sinopas, .description, .summary",
            )
              .first()
              .text(),
          ),
        coverUrl:
          this.toAbsoluteUrl($('meta[property="og:image"]').attr("content")) ||
          this.toAbsoluteUrl(
            $("article img, .separator img, img").first().attr("src"),
          ),
        status: this.parseStatusText(
          this.strip(
            $('div.y6x11p:contains("Status") .dt').first().text() ||
              $('ul.infonime li:contains("Status") span').first().text() ||
              $("span.status-novel").first().text() ||
              $("span[data-status]").first().text(),
          ),
        ),
        year: null,
        originalLanguage: null,
        tags: $(
          'article div.mt-15 a, .info-genre a, dl:contains("Genre") dd a, a[href*="label/"]',
        )
          .map((_idx, el) => this.strip($(el).text()))
          .get()
          .filter(Boolean),
        latestChapter: null,
        author:
          this.strip(
            $('div.y6x11p:contains("Author") .dt').first().text() ||
              $('div.y6x11p:contains("Autor") .dt').first().text() ||
              $('ul.infonime li:contains("Author") span').first().text(),
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

      const feedLabel =
        this.extractChapterFeedLabel(html, $) || this.seriesFeedLabel;
      const entries = await this.fetchFeedEntries(feedLabel, undefined, 1, 999);
      const chapters = this.mapFeedEntriesToChapters(
        entries,
        limit,
        translatedLanguage,
      );

      await this.setCache(cacheKey, chapters);
      return chapters;
    } catch {
      try {
        const html = await this.fetchHtml(seriesPath);
        const $ = cheerio.load(html);
        const chapters = this.extractChaptersFromHtml(
          $,
          limit,
          translatedLanguage,
        );
        await this.setCache(cacheKey, chapters);
        return chapters;
      } catch {
        return [];
      }
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

  protected async fetchFeedEntries(
    label: string,
    query?: string,
    startIndex = 1,
    maxResults = this.maxResults,
  ): Promise<BloggerEntry[]> {
    const searchValue = query ? `label:${label} ${query}` : undefined;
    const url = new URL(
      `/feeds/posts/default/-/${encodeURIComponent(label)}`,
      this.baseUrl,
    );
    url.searchParams.set("alt", "json");
    url.searchParams.set("orderby", "published");
    url.searchParams.set("max-results", String(maxResults));
    url.searchParams.set("start-index", String(startIndex));
    if (searchValue) {
      url.searchParams.set("q", searchValue);
    }

    const response = await this.fetchGateway.get(url.toString(), {
      sourceId: this.id,
      timeoutMs: 15_000,
      headers: {
        Accept: "application/json, text/plain, */*",
      },
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`${this.displayName} feed status ${response.status}`);
    }

    const parsed = JSON.parse(response.body || "{}") as {
      feed?: { entry?: BloggerEntry[] };
    };
    return parsed.feed?.entry || [];
  }

  protected mapFeedEntriesToSummary(
    entries: BloggerEntry[],
    limit: number,
  ): MangaSummary[] {
    const mapped: MangaSummary[] = [];
    const seen = new Set<string>();
    for (const entry of entries) {
      const href = this.getEntryAlternateLink(entry);
      const id = href ? this.normalizePath(href, "/") : null;
      if (!id || seen.has(id)) continue;
      seen.add(id);

      const cover = this.extractEntryCover(entry);
      mapped.push({
        id,
        title: this.strip(entry.title?.$t) || "Unknown Title",
        description: this.extractEntryDescription(entry),
        coverUrl: cover,
        status: null,
        year: null,
        originalLanguage: null,
        tags: [],
        latestChapter: null,
      });
      if (mapped.length >= limit) break;
    }
    return mapped;
  }

  protected mapFeedEntriesToChapters(
    entries: BloggerEntry[],
    limit: number,
    translatedLanguage?: string,
  ): MangaChapter[] {
    const chapters: MangaChapter[] = [];
    const seen = new Set<string>();

    for (const [index, entry] of entries.entries()) {
      const href = this.getEntryAlternateLink(entry);
      const chapterPath = href ? this.normalizePath(href, "/") : null;
      if (!chapterPath || seen.has(chapterPath)) continue;
      seen.add(chapterPath);

      const title = this.strip(entry.title?.$t);
      const chapterMatch = title.match(/chapter\s*[:\-]?\s*([\d.]+)/i);
      const langMatch = title.match(
        /\b(EN|JP|KR|CN|ES|PT|FR|DE|ID|TH|VI|TR|RU|AR)\b/i,
      );
      const chapterLanguage = langMatch?.[1]?.toLowerCase() || null;

      if (
        translatedLanguage &&
        chapterLanguage &&
        chapterLanguage !== translatedLanguage.toLowerCase()
      ) {
        continue;
      }

      chapters.push({
        id: chapterPath,
        chapter: (() => {
          const match = title.match(/\b(\d+(?:\.\d+)?)\b/);
          return match ? match[1] : String(index + 1);
        })(),
        volume: null,
        title: title || null,
        publishedAt: entry.published?.$t || null,
        scanlationGroup: null,
        branch: null,
        externalUrl: null,
        isExternal: false,
      });

      if (chapters.length >= limit) break;
    }

    return chapters.reverse();
  }

  protected extractChaptersFromHtml(
    $: cheerio.CheerioAPI,
    limit: number,
    translatedLanguage?: string,
  ): MangaChapter[] {
    const chapters: MangaChapter[] = [];
    const seen = new Set<string>();

    $(
      '#myUL a, #latest a, #chapterlist a, a[href*="chapter"], a[href*="capitulo"], a[href*="chap"]',
    ).each((index, el) => {
      if (chapters.length >= limit) return;

      const href = $(el).attr("href");
      const chapterPath = href ? this.normalizePath(href, "/") : null;
      if (!chapterPath || seen.has(chapterPath)) return;
      seen.add(chapterPath);

      const text = this.strip($(el).text());
      if (!text) return;

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
        title: text,
        publishedAt: null,
        scanlationGroup: null,
        branch: null,
        externalUrl: null,
        isExternal: false,
      });
    });

    return chapters;
  }

  protected extractChapterFeedLabel(
    html: string,
    $: cheerio.CheerioAPI,
  ): string | null {
    const direct =
      /label_chapter\s*=\s*"([^"]+)"/i.exec(html)?.[1] ||
      /label\s*=\s*'([^']+)'/i.exec(html)?.[1] ||
      /clwd\.run\('([^']+)'/i.exec(html)?.[1] ||
      $("#chapterlist").attr("data-post-title") ||
      null;

    return this.strip(direct || "") || null;
  }

  protected getEntryAlternateLink(entry: BloggerEntry): string | null {
    const link = (entry.link || []).find(
      (candidate) => candidate.rel === "alternate",
    );
    return this.strip(link?.href) || null;
  }

  protected extractEntryDescription(entry: BloggerEntry): string {
    const raw = this.strip(entry.content?.$t);
    if (!raw) return "";
    const plain = raw
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return plain;
  }

  protected extractEntryCover(entry: BloggerEntry): string | null {
    const fromThumb = this.toAbsoluteUrl(entry["media$thumbnail"]?.url || null);
    if (fromThumb) {
      return fromThumb
        .replace(/\/s\d+-c\//i, "/w600/")
        .replace(/=s\d+-c$/i, "=w600")
        .replace(/\/s\d+-c-rw\//i, "/w600/")
        .replace(/=s\d+-c-rw$/i, "=w600");
    }

    const html = entry.content?.$t || "";
    const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    return this.toAbsoluteUrl(imgMatch?.[1] || null);
  }

  protected parseStatusText(value: string): string | null {
    const lowered = value.toLowerCase();
    if (!lowered) return null;
    if (
      lowered.includes("ongoing") ||
      lowered.includes("en curso") ||
      lowered.includes("ativo") ||
      lowered.includes("lançando") ||
      lowered.includes("مستمر") ||
      lowered.includes("devam")
    ) {
      return "ongoing";
    }
    if (
      lowered.includes("completed") ||
      lowered.includes("completo") ||
      lowered.includes("finalizado") ||
      lowered.includes("tamamlandı")
    ) {
      return "completed";
    }
    if (
      lowered.includes("cancel") ||
      lowered.includes("drop") ||
      lowered.includes("abandon")
    ) {
      return "cancelled";
    }
    if (lowered.includes("hiatus")) {
      return "hiatus";
    }
    return this.strip(value) || null;
  }
}
