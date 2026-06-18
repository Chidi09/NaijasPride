import * as cheerio from "cheerio";
import { sourceMetrics } from "../observability/source-metrics";
import { BaseHtmlSource } from "../base/base-html.source";
import {
  MangaChapter,
  MangaDetail,
  MangaDiscoverResult,
  MangaPagesResult,
  MangaSearchFilters,
  MangaSource,
  MangaSummary,
  MangaTag,
} from "../types";
import { summarizeSourceError } from "../utils/error-summary";

const BASE_URL = "https://asuracomic.net";

export class AsuraSource extends BaseHtmlSource {
  readonly id = "asura";
  readonly displayName = "Asura";
  readonly capabilities: MangaSource["capabilities"] = {
    supportsFilters: true,
    supportsLanguages: false,
    supportsSimilar: false,
    supportsDiscover: true,
    supportsTags: true,
    supportsExternalRedirect: true,
    needsAntiBot: true,
  };

  constructor() {
    super({
      baseUrl: BASE_URL,
      cachePrefix: "asura",
      defaultCacheTtlSeconds: 600,
    });
  }

  private titleFromSeriesPath(id: string): string {
    const slug = id.split("/").filter(Boolean).pop() || "";
    const normalized = decodeURIComponent(slug)
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (value) => value.toUpperCase())
      .trim();
    return normalized || "Unknown Title";
  }

  private extractSeriesId(href: string): string | null {
    const match = href.match(/\/(?:series|comics|manga)\/([^/?#]+)/i);
    return match ? match[1] : null;
  }

  private extractChapterId(href: string): string | null {
    const match = href.match(/\/(?:chapter|chapters)\/([^/?#]+)/i);
    return match ? match[1] : null;
  }

  private coerceSeriesId(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^[a-z0-9-]+$/i.test(trimmed)) return trimmed;
    return this.extractSeriesId(trimmed);
  }

  private coerceChapterId(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^[a-z0-9-]+$/i.test(trimmed)) return trimmed;
    return this.extractChapterId(trimmed);
  }

  private toSeriesPath(seriesId: string): string {
    return `/comics/${seriesId}`;
  }

  private toChapterPath(chapterId: string): string {
    return `/chapter/${chapterId}`;
  }

  async searchManga(
    query?: string,
    limit = 20,
    _filters: MangaSearchFilters = {},
  ): Promise<MangaSummary[]> {
    const normalized = this.strip(query);
    if (!normalized) {
      const discover = await this.getDiscoverManga(Math.min(limit, 20));
      return discover.trending.slice(0, limit);
    }

    const cacheKey = this.buildCacheKey(
      "search",
      normalized.toLowerCase(),
      limit,
    );
    const cached = await this.getFromCache<MangaSummary[]>(cacheKey);
    if (cached) return cached;

    try {
      // Kotatsu: /series?page=1&name={query}
      const html = await this.fetchHtml("/series", {
        page: 1,
        name: normalized,
      });

      if (!html || html.length < 100) {
        console.error("[Asura] Search returned empty HTML");
        return [];
      }

      const $ = cheerio.load(html);
      const map = new Map<string, MangaSummary>();

      // Kotatsu: div.grid > a[href] - specific selector for manga cards
      $("div.grid > a[href]").each((_idx, el) => {
        const $el = $(el);
        const href = $el.attr("href");
        if (!href) return;

        const id = this.extractSeriesId(href);
        if (!id || map.has(id)) return;

        // Kotatsu: img for cover and title
        const $img = $el.find("img").first();
        const title = this.strip($img.attr("alt") || "");

        if (!title || title.length < 2) return;

        // Filter by search query
        if (!title.toLowerCase().includes(normalized.toLowerCase())) return;

        // Kotatsu: img for cover
        const coverUrl = this.toAbsoluteUrl(
          $el.find("img").first().attr("src") || null,
        );

        // Kotatsu: span.status for status
        const statusText = this.strip($el.find("span.status").last().text());
        const status =
          statusText === "Ongoing"
            ? "ongoing"
            : statusText === "Completed"
              ? "completed"
              : null;

        map.set(id, {
          id,
          title,
          description: "",
          coverUrl,
          status,
          year: null,
          originalLanguage: null,
          tags: [],
          latestChapter: null,
        });
      });

      const results = Array.from(map.values()).slice(0, limit);

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error(`[Asura] search failed: ${summarizeSourceError(error)}`);
      return [];
    }
  }

  async getDiscoverManga(limit = 12): Promise<MangaDiscoverResult> {
    const safeLimit = Math.min(24, Math.max(1, limit));
    const cacheKey = this.buildCacheKey("discover", safeLimit);
    const cached = await this.getFromCache<MangaDiscoverResult>(cacheKey);
    if (cached) return cached;

    try {
      // Kotatsu: /series?page=1
      const html = await this.fetchHtml("/series", { page: 1 });

      if (!html || html.length < 100) {
        console.error("[Asura] Discover returned empty HTML");
        return { trending: [], recentlyUpdated: [], newTitles: [] };
      }

      const $ = cheerio.load(html);
      const map = new Map<string, MangaSummary>();

      // Kotatsu: div.grid > a[href] - specific selector for manga cards
      $("div.grid > a[href]").each((_idx, el) => {
        const $el = $(el);
        const href = $el.attr("href");
        if (!href) return;

        const id = this.extractSeriesId(href);
        if (!id || map.has(id)) return;

        // Kotatsu: img for cover and title
        const $img = $el.find("img").first();
        const title = this.strip($img.attr("alt") || "");
        if (!title || title.length < 2) return;

        if (!title || title.length < 2) return;

        // Kotatsu: img for cover
        const coverUrl = this.toAbsoluteUrl(
          $el.find("img").first().attr("src") || null,
        );

        // Kotatsu: span.status for status
        const statusText = this.strip($el.find("span.status").last().text());
        const status =
          statusText === "Ongoing"
            ? "ongoing"
            : statusText === "Completed"
              ? "completed"
              : null;

        map.set(id, {
          id,
          title,
          description: "",
          coverUrl,
          status,
          year: null,
          originalLanguage: null,
          tags: [],
          latestChapter: null,
        });
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
      console.error(`[Asura] discover failed: ${summarizeSourceError(error)}`);
      return { trending: [], recentlyUpdated: [], newTitles: [] };
    }
  }

  async getMangaTags(): Promise<MangaTag[]> {
    // Kotatsu: Fetches from https://gg.asuracomic.net/api/series/filters
    // Returns genres array with id and name
    try {
      const cacheKey = this.buildCacheKey("tags");
      const cached = await this.getFromCache<MangaTag[]>(cacheKey);
      if (cached) return cached;

      const response = await this.fetchGateway.get(
        `https://gg.${BASE_URL.replace("https://", "")}/api/series/filters`,
        {
          sourceId: this.id,
          timeoutMs: 10_000,
        },
      );

      if (response.status !== 200 || !response.body) {
        return [];
      }

      const data = JSON.parse(response.body) as {
        genres?: Array<{ id: number; name: string }>;
      };
      const tags: MangaTag[] = [];

      if (data.genres && Array.isArray(data.genres)) {
        for (const genre of data.genres) {
          if (genre.name) {
            tags.push({
              id: String(genre.id),
              name: genre.name,
              group: "genre",
            });
          }
        }
      }

      await this.setCache(cacheKey, tags, this.defaultCacheTtlSeconds * 12);
      return tags;
    } catch (error) {
      console.error(
        `[Asura] tags fetch failed: ${summarizeSourceError(error)}`,
      );
      return [];
    }
  }

  async getMangaDetail(mangaId: string): Promise<MangaDetail | null> {
    const seriesId = this.coerceSeriesId(mangaId);
    if (!seriesId) return null;

    const seriesPath = this.toSeriesPath(seriesId);
    const cacheKey = this.buildCacheKey("detail", seriesId);
    const cached = await this.getFromCache<MangaDetail>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(seriesPath);

      if (!html || html.length < 100) {
        console.error(`[Asura] Detail page returned empty HTML for ${mangaId}`);
        return null;
      }

      const $ = cheerio.load(html);

      // Debug: Log what we're finding
      const titleElements = $("h1").length;
      const descElements = $("span.font-medium.text-sm").length;
      const tagElements = $(
        'div[class^="space"] > div.flex > button.text-white',
      ).length;
      console.log(
        `[Asura] Detail parse: title=${titleElements}, desc=${descElements}, tags=${tagElements}`,
      );

      // Kotatsu: tags from div[class^=space] > div.flex > button.text-white
      const tagElements2 = $(
        'div[class^="space"] > div.flex > button.text-white',
      );
      const tags = tagElements2
        .map((_idx, el) => this.strip($(el).text()))
        .get()
        .filter(Boolean);

      // Kotatsu: author from div.grid > div:has(h3:eq(0):containsOwn(Author)) > h3:eq(1)
      const authorText = this.strip(
        $("div.grid > div")
          .filter((_i, el) => {
            return $(el).find("h3").eq(0).text().includes("Author");
          })
          .find("h3")
          .eq(1)
          .text(),
      );

      // Kotatsu: description from span.font-medium.text-sm
      const description =
        this.strip($("span.font-medium.text-sm").first().text()) ||
        this.strip($('meta[property="og:description"]').attr("content"));

      const detail: MangaDetail = {
        id: seriesId,
        title:
          this.strip($("h1").first().text()) ||
          this.strip($('meta[property="og:title"]').attr("content")) ||
          this.titleFromSeriesPath(seriesId),
        description,
        coverUrl:
          this.toAbsoluteUrl($('meta[property="og:image"]').attr("content")) ||
          this.toAbsoluteUrl($("img").first().attr("src") || null),
        status: null,
        year: null,
        originalLanguage: null,
        tags,
        latestChapter: null,
        author: authorText || null,
        artist: null,
        contentRating: null,
        publicationDemographic: null,
        availableTranslatedLanguages: [],
      };

      await this.setCache(cacheKey, detail, this.defaultCacheTtlSeconds * 2);
      return detail;
    } catch (error) {
      console.error(`[Asura] detail failed: ${summarizeSourceError(error)}`);
      return null;
    }
  }

  async getSimilarManga(_mangaId: string, _limit = 6): Promise<MangaSummary[]> {
    return [];
  }

  async getChapters(
    mangaId: string,
    _translatedLanguage?: string,
    limit = 100,
  ): Promise<MangaChapter[]> {
    const seriesId = this.coerceSeriesId(mangaId);
    if (!seriesId) return [];

    const seriesPath = this.toSeriesPath(seriesId);
    const cacheKey = this.buildCacheKey("chapters", seriesId, limit);
    const cached = await this.getFromCache<MangaChapter[]>(cacheKey);
    if (cached) return cached;

    try {
      const html = await this.fetchHtml(seriesPath);

      if (!html || html.length < 100) {
        console.error(
          `[Asura] Chapter list returned empty HTML for ${mangaId}`,
        );
        return [];
      }

      const $ = cheerio.load(html);

      // Kotatsu: div.scrollbar-thumb-themecolor > div.group
      const chapterGroups = $(
        'div.scrollbar-thumb-themecolor > div.group, div[class*="scrollbar"] > div.group',
      );
      const chapters: MangaChapter[] = [];
      const seen = new Set<string>();

      // Debug
      console.log(`[Asura] Found ${chapterGroups.length} chapter groups`);

      // Process in reverse order (newest first) as Kotatsu does
      const groups = chapterGroups.toArray().reverse();

      groups.forEach((el, index) => {
        if (chapters.length >= limit) return;

        const group = $(el);

        // Kotatsu: a is the last element in the group
        const link = group.find("a").last();
        const href = link.attr("href");

        // Kotatsu: URL constructed as /series/ + href
        const chapterId = href ? this.coerceChapterId(href) : null;
        if (!chapterId || seen.has(chapterId)) return;
        seen.add(chapterId);

        // Kotatsu: title from first h3, date from last h3
        const titleEl = group.find("h3").first();
        const dateEl = group.find("h3").last();

        const title = this.strip(titleEl.text()) || null;

        // Kotatsu date parsing: "January 7th 2026" -> remove "st", "nd", "rd", "th"
        const dateText = this.strip(dateEl.text());
        let publishedAt: string | null = null;
        if (dateText) {
          // Remove ordinal suffixes (1st, 2nd, 3rd, 4th)
          const cleanDate = dateText.replace(/(\d+)(st|nd|rd|th)/, "$1");
          // Try to parse as date
          try {
            const date = new Date(cleanDate);
            if (!isNaN(date.getTime())) {
              publishedAt = date.toISOString();
            }
          } catch {
            // If parsing fails, keep as null
          }
        }

        // Kotatsu: use index + 1 for chapter number
        const chapterNumber = String(index + 1);

        chapters.push({
          id: chapterId,
          chapter: chapterNumber,
          volume: null,
          title,
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
      console.error(
        `[Asura] chapter fetch failed: ${summarizeSourceError(error)}`,
      );
      return [];
    }
  }

  async getChapterPages(chapterId: string): Promise<MangaPagesResult> {
    const chapterRawId = this.coerceChapterId(chapterId);
    if (!chapterRawId) {
      return {
        chapterId,
        readerMode: "standard",
        pages: [],
        externalUrl: null,
        isExternal: false,
      };
    }

    const chapterPath = this.toChapterPath(chapterRawId);
    const cacheKey = this.buildCacheKey("pages", chapterRawId);
    const cached = await this.getFromCache<MangaPagesResult>(cacheKey);
    if (cached && (cached.pages.length > 0 || cached.externalUrl))
      return cached;

    try {
      const html = await this.fetchHtml(chapterPath);

      if (!html || html.length < 100) {
        console.error(
          `[Asura] Chapter page returned empty HTML for ${chapterId}`,
        );
        return {
          chapterId: chapterRawId,
          readerMode: "standard",
          pages: [],
          externalUrl: `${BASE_URL}${chapterPath}`,
          isExternal: true,
        };
      }

      // Kotatsu page extraction: Parse JSON from script tags
      // Look for self.__next_f.push(...) calls containing page data
      const pages = this.extractChapterImageUrls(html);

      if (pages.length === 0) {
        console.error(`[Asura] No pages found for chapter ${chapterId}`);
        sourceMetrics.incrementParseEmptyPages(this.id);
        const externalResult: MangaPagesResult = {
          chapterId: chapterRawId,
          readerMode: "standard",
          pages: [],
          externalUrl: `${BASE_URL}${chapterPath}`,
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
        chapterId: chapterRawId,
        readerMode: "standard",
        pages,
        externalUrl: null,
        isExternal: false,
      };

      await this.setCache(cacheKey, result, this.defaultCacheTtlSeconds * 2);
      return result;
    } catch (error) {
      console.error(
        `[Asura] page fetch failed: ${summarizeSourceError(error)}`,
      );
      return {
        chapterId: chapterRawId,
        readerMode: "standard",
        pages: [],
        externalUrl: `${BASE_URL}${chapterPath}`,
        isExternal: true,
      };
    }
  }

  /**
   * Kotatsu-style page extraction from script tags
   * Parses self.__next_f.push() calls to extract JSON page data
   */
  protected extractChapterImageUrls(html: string): string[] {
    try {
      const $ = cheerio.load(html);
      const pages: string[] = [];

      // Kotatsu: Extract from script tags containing self.__next_f.push(...)
      const scriptData: string[] = [];
      $("script").each((_idx, el) => {
        const scriptContent = $(el).html() || "";

        // Find self.__next_f.push calls
        const pushRegex = /self\.__next_f\.push\((.*?)\)/g;
        let match;
        while ((match = pushRegex.exec(scriptContent)) !== null) {
          const pushArg = match[1];
          // Extract JSON strings from the push argument
          const jsonStrings = this.extractJsonStrings(pushArg);
          scriptData.push(...jsonStrings);
        }
      });

      // Join all script data and split by newlines
      const allData = scriptData.join("\n");
      const lines = allData.split("\n");

      // Parse each line as JSON and look for page objects
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("{")) continue;

        try {
          const obj = JSON.parse(trimmed) as Record<string, unknown>;
          // Kotatsu: Look for objects with "order" and "url" keys
          if (
            obj &&
            typeof obj.order === "number" &&
            typeof obj.url === "string"
          ) {
            pages.push(obj.url);
          }
        } catch {
          // Skip invalid JSON
        }
      }

      // If no pages found via script parsing, try image tags as fallback
      if (pages.length === 0) {
        console.log(
          "[Asura] No pages from script parsing, trying image fallback",
        );
        $("img").each((_idx, el) => {
          const src = $(el).attr("src");
          if (
            src &&
            (src.includes(".jpg") ||
              src.includes(".jpeg") ||
              src.includes(".png") ||
              src.includes(".webp"))
          ) {
            pages.push(src);
          }
        });
      }

      // Sort pages by order if available (though we already extract in order)
      return [...new Set(pages)]; // Remove duplicates
    } catch (error) {
      console.error(`[Asura] Page extraction failed: ${error}`);
      return [];
    }
  }

  /**
   * Extract JSON strings from script array notation
   * Kotatsu: Converts [1, "json string"] to just the JSON string
   */
  private extractJsonStrings(input: string): string[] {
    const results: string[] = [];

    try {
      // Try to parse as array
      const arr = JSON.parse(input) as unknown[];
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (typeof item === "string") {
            results.push(item);
          }
        }
      }
    } catch {
      // If not valid JSON array, try regex extraction
      const stringRegex = /"([^"]*)"/g;
      let match;
      while ((match = stringRegex.exec(input)) !== null) {
        results.push(match[1]);
      }
    }

    return results;
  }

  async healthCheck(): Promise<{
    ok: boolean;
    latencyMs: number;
    message?: string;
  }> {
    const startedAt = Date.now();
    try {
      const response = await this.fetchGateway.get(BASE_URL, {
        sourceId: this.id,
        timeoutMs: 15_000,
      });

      const ok = response.status >= 200 && response.status < 500;
      return {
        ok,
        latencyMs: Date.now() - startedAt,
        message: ok ? undefined : `Asura status ${response.status}`,
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
