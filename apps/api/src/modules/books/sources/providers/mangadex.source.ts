import axios from "axios";
import { getRedis } from "../../../../shared/services/redis.service";
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

type MangaDexSearchItem = {
  id: string;
  type: string;
  attributes?: {
    title?: Record<string, string>;
    description?: Record<string, string>;
    status?: string;
    year?: number;
    contentRating?: string;
    publicationDemographic?: string;
    availableTranslatedLanguages?: string[];
    lastChapter?: string;
    originalLanguage?: string;
    tags?: Array<{
      id?: string;
      attributes?: {
        name?: Record<string, string>;
        group?: string;
      };
    }>;
  };
  relationships?: Array<{
    id?: string;
    type?: string;
    related?: string;
    attributes?: {
      fileName?: string;
      name?: string;
    };
  }>;
};

type MangaDexTagItem = {
  id: string;
  attributes?: {
    name?: Record<string, string>;
    group?: string;
  };
};

type MangaDexChapterItem = {
  id: string;
  type: string;
  attributes?: {
    chapter?: string;
    volume?: string;
    title?: string;
    publishAt?: string;
    externalUrl?: string;
  };
  relationships?: Array<{
    id?: string;
    type?: string;
    attributes?: {
      name?: string;
    };
  }>;
};

type MangaDexRelationship = {
  id?: string;
  type?: string;
  related?: string;
  attributes?: {
    fileName?: string;
    name?: string;
  };
};

const MANGADEX_BASE_URL = "https://api.mangadex.org";
const CACHE_TTL_SECONDS = 3600;

const pickLocalized = (field?: Record<string, string>) => {
  if (!field) return "";
  return field.en || field["en-us"] || Object.values(field)[0] || "";
};

const extractTags = (item: MangaDexSearchItem): string[] => {
  return (
    item.attributes?.tags
      ?.map((tag) => pickLocalized(tag.attributes?.name))
      .filter(Boolean) || []
  );
};

const extractTagIds = (item: MangaDexSearchItem): string[] => {
  return (
    item.attributes?.tags
      ?.map((tag) => tag.id)
      .filter((id): id is string => !!id) || []
  );
};

const toProxyCoverUrl = (coverUrl: string | null): string | null => {
  if (!coverUrl) return null;
  const marker = "https://uploads.mangadex.org/covers/";
  if (!coverUrl.startsWith(marker)) return coverUrl;

  const path = coverUrl.slice(marker.length);
  const firstSlash = path.indexOf("/");
  if (firstSlash === -1) return coverUrl;

  const mangaId = path.slice(0, firstSlash);
  const fileName = path.slice(firstSlash + 1);
  if (!mangaId || !fileName) return coverUrl;
  return `/api/v1/books/manga/covers/${mangaId}/${encodeURIComponent(fileName)}`;
};

const detectReaderMode = (
  manga: MangaDexSearchItem | null,
): "webtoon" | "reversed" | "standard" => {
  if (!manga) return "reversed"; // Default to reversed (manga mode)

  const tags = extractTags(manga).map((t) => t.toLowerCase());
  const title = pickLocalized(manga.attributes?.title).toLowerCase();
  const description = pickLocalized(
    manga.attributes?.description,
  ).toLowerCase();
  const originalLanguage = (
    manga.attributes?.originalLanguage || ""
  ).toLowerCase();

  if (
    tags.includes("long strip") ||
    title.includes("webtoon") ||
    description.includes("webtoon") ||
    description.includes("manhwa")
  ) {
    return "webtoon";
  }

  if (originalLanguage === "en" || tags.includes("full color")) {
    return "standard"; // Western comics read LTR
  }

  return "reversed"; // Japanese manga read RTL
};

export class MangaDexSource implements MangaSource {
  readonly id = "mangadex";
  readonly displayName = "MangaDex";
  readonly capabilities = {
    supportsFilters: true,
    supportsLanguages: true,
    supportsSimilar: true,
    supportsDiscover: true,
    supportsTags: true,
    supportsExternalRedirect: true,
    needsAntiBot: false,
  } as const;

  private mapToSummary(items: MangaDexSearchItem[]): MangaSummary[] {
    return items.map((manga) => {
      const coverRel = manga.relationships?.find((r) => r.type === "cover_art");
      const fileName = coverRel?.attributes?.fileName;
      return {
        id: manga.id,
        title: pickLocalized(manga.attributes?.title),
        description: pickLocalized(manga.attributes?.description),
        coverUrl: fileName
          ? `/api/v1/books/manga/covers/${manga.id}/${encodeURIComponent(fileName)}`
          : null,
        status: manga.attributes?.status || null,
        year: manga.attributes?.year || null,
        originalLanguage: manga.attributes?.originalLanguage || null,
        tags: extractTags(manga),
        latestChapter: manga.attributes?.lastChapter || null,
      };
    });
  }

  private async fetchCollection(
    cacheKey: string,
    limit: number,
    orderParam: Record<string, string>,
  ) {
    const cached = await this.getFromCache<MangaSummary[]>(cacheKey);
    if (cached) {
      return cached.map((item) => ({
        ...item,
        coverUrl: toProxyCoverUrl(item.coverUrl),
      }));
    }

    try {
      const response = await axios.get(`${MANGADEX_BASE_URL}/manga`, {
        params: {
          limit,
          ...orderParam,
          "contentRating[]": ["safe", "suggestive", "erotica"],
          "includes[]": "cover_art",
        },
      });

      const results = this.mapToSummary(
        (response.data?.data || []) as MangaDexSearchItem[],
      );
      await this.setCache(cacheKey, results, CACHE_TTL_SECONDS);
      return results;
    } catch (error) {
      console.error("[MangaDex] discover fetch failed:", error);
      return [];
    }
  }

  private async getFromCache<T>(key: string): Promise<T | null> {
    const redis = getRedis();
    if (!redis) return null;

    try {
      const cached = await redis.get(key);
      if (cached) {
        console.log(`[Manga Cache HIT] ${key}`);
        return JSON.parse(cached);
      }
    } catch (e) {
      console.error("[Manga Cache] get error:", e);
    }
    return null;
  }

  private async setCache(
    key: string,
    data: unknown,
    ttlSeconds = CACHE_TTL_SECONDS,
  ): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(data));
      console.log(`[Manga Cache SET] ${key} (TTL: ${ttlSeconds}s)`);
    } catch (e) {
      console.error("[Manga Cache] set error:", e);
    }
  }

  async searchManga(
    query?: string,
    limit = 20,
    filters: MangaSearchFilters = {},
  ): Promise<MangaSummary[]> {
    const normalizedQuery = (query || "").trim();
    const cacheKey = `manga:search:${normalizedQuery.toLowerCase() || "featured"}:${limit}:${JSON.stringify(filters)}`;

    const cached = await this.getFromCache<MangaSummary[]>(cacheKey);
    if (cached) {
      return cached.map((item) => ({
        ...item,
        coverUrl: toProxyCoverUrl(item.coverUrl),
      }));
    }

    try {
      const orderField =
        filters.sort || (normalizedQuery ? "relevance" : "followedCount");
      const response = await axios.get(`${MANGADEX_BASE_URL}/manga`, {
        params: {
          limit,
          ...(normalizedQuery ? { title: normalizedQuery } : {}),
          [`order[${orderField}]`]: "desc",
          ...(filters.tags?.length ? { "includedTags[]": filters.tags } : {}),
          ...(filters.status?.length ? { "status[]": filters.status } : {}),
          ...(filters.originalLanguage?.length
            ? { "originalLanguage[]": filters.originalLanguage }
            : {}),
          ...(filters.contentRating?.length
            ? { "contentRating[]": filters.contentRating }
            : { "contentRating[]": ["safe", "suggestive", "erotica"] }),
          ...(filters.demographic?.length
            ? { "publicationDemographic[]": filters.demographic }
            : {}),
          ...(filters.year ? { year: filters.year } : {}),
          "includes[]": "cover_art",
        },
      });

      const results = this.mapToSummary(
        (response.data?.data || []) as MangaDexSearchItem[],
      );
      await this.setCache(cacheKey, results, CACHE_TTL_SECONDS);
      return results;
    } catch (error) {
      console.error("[MangaDex] search failed:", error);
      return [];
    }
  }

  async getDiscoverManga(limit = 12): Promise<MangaDiscoverResult> {
    const safeLimit = Math.min(24, Math.max(1, limit));
    const [trending, recentlyUpdated, newTitles] = await Promise.all([
      this.fetchCollection(`manga:discover:trending:${safeLimit}`, safeLimit, {
        "order[followedCount]": "desc",
      }),
      this.fetchCollection(`manga:discover:updated:${safeLimit}`, safeLimit, {
        "order[latestUploadedChapter]": "desc",
      }),
      this.fetchCollection(`manga:discover:new:${safeLimit}`, safeLimit, {
        "order[createdAt]": "desc",
      }),
    ]);

    return { trending, recentlyUpdated, newTitles };
  }

  async getMangaTags(): Promise<MangaTag[]> {
    const cacheKey = "manga:tags";
    const cached = await this.getFromCache<MangaTag[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${MANGADEX_BASE_URL}/manga/tag`);
      const tags = (response.data?.data || []).map((tag: MangaDexTagItem) => ({
        id: tag.id,
        name: pickLocalized(tag.attributes?.name),
        group: tag.attributes?.group || null,
      }));
      await this.setCache(cacheKey, tags, CACHE_TTL_SECONDS * 24);
      return tags;
    } catch (error) {
      console.error("[MangaDex] tags fetch failed:", error);
      return [];
    }
  }

  async getMangaDetail(mangaId: string): Promise<MangaDetail | null> {
    const cacheKey = `manga:detail:${mangaId}`;
    const cached = await this.getFromCache<MangaDetail>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(
        `${MANGADEX_BASE_URL}/manga/${mangaId}`,
        {
          params: {
            "includes[]": ["cover_art", "author", "artist"],
          },
        },
      );

      const manga = response.data?.data as MangaDexSearchItem;
      if (!manga) return null;

      const coverRel = manga.relationships?.find((r) => r.type === "cover_art");
      const fileName = coverRel?.attributes?.fileName;
      const author =
        manga.relationships?.find((r) => r.type === "author")?.attributes
          ?.name || null;
      const artist =
        manga.relationships?.find((r) => r.type === "artist")?.attributes
          ?.name || null;

      const detail: MangaDetail = {
        id: manga.id,
        title: pickLocalized(manga.attributes?.title),
        description: pickLocalized(manga.attributes?.description),
        coverUrl: fileName
          ? `/api/v1/books/manga/covers/${manga.id}/${encodeURIComponent(fileName)}`
          : null,
        status: manga.attributes?.status || null,
        year: manga.attributes?.year || null,
        originalLanguage: manga.attributes?.originalLanguage || null,
        tags: extractTags(manga),
        latestChapter: manga.attributes?.lastChapter || null,
        author,
        artist,
        contentRating: manga.attributes?.contentRating || null,
        publicationDemographic:
          manga.attributes?.publicationDemographic || null,
        availableTranslatedLanguages:
          manga.attributes?.availableTranslatedLanguages || [],
      };

      await this.setCache(cacheKey, detail, CACHE_TTL_SECONDS);
      return detail;
    } catch (error) {
      console.error("[MangaDex] detail fetch failed:", error);
      return null;
    }
  }

  async getSimilarManga(mangaId: string, limit = 6): Promise<MangaSummary[]> {
    const cacheKey = `manga:similar:${mangaId}:${limit}`;
    const cached = await this.getFromCache<MangaSummary[]>(cacheKey);
    if (cached) return cached;

    try {
      const detailResponse = await axios.get(
        `${MANGADEX_BASE_URL}/manga/${mangaId}`,
      );
      const source = detailResponse.data?.data as MangaDexSearchItem;
      const tagIds = extractTagIds(source).slice(0, 8);
      if (tagIds.length === 0) return [];

      const similarResponse = await axios.get(`${MANGADEX_BASE_URL}/manga`, {
        params: {
          limit: Math.max(6, limit + 2),
          "includes[]": "cover_art",
          "contentRating[]": ["safe", "suggestive", "erotica"],
          "includedTags[]": tagIds,
          "order[followedCount]": "desc",
        },
      });

      const results = this.mapToSummary(
        (similarResponse.data?.data || []) as MangaDexSearchItem[],
      )
        .filter((item) => item.id !== mangaId)
        .slice(0, limit);

      await this.setCache(cacheKey, results, CACHE_TTL_SECONDS);
      return results;
    } catch (error) {
      console.error("[MangaDex] similar fetch failed:", error);
      return [];
    }
  }

  async getChapters(
    mangaId: string,
    translatedLanguage?: string,
    limit = 100,
  ): Promise<MangaChapter[]> {
    const languageKey = translatedLanguage?.trim()
      ? translatedLanguage.trim().toLowerCase()
      : "all";
    const cacheKey = `manga:chapters:${mangaId}:${languageKey}:all`;

    const cached = await this.getFromCache<MangaChapter[]>(cacheKey);
    if (cached) return cached;

    try {
      // Fetch all chapters with pagination (Kotatsu-style)
      const allChapters: MangaDexChapterItem[] = [];
      let offset = 0;
      const pageSize = 500; // Maximum allowed by MangaDex
      let total = 0;

      // First request to get total count
      const firstResponse = await axios.get(
        `${MANGADEX_BASE_URL}/manga/${mangaId}/feed`,
        {
          params: {
            ...(translatedLanguage?.trim()
              ? { translatedLanguage: [translatedLanguage.trim()] }
              : {}),
            "order[volume]": "asc",
            "order[chapter]": "asc",
            limit: pageSize,
            offset: 0,
            "includes[]": "scanlation_group",
            "contentRating[]": [
              "safe",
              "suggestive",
              "erotica",
              "pornographic",
            ],
          },
        },
      );

      if (firstResponse.data?.data) {
        allChapters.push(...firstResponse.data.data);
        total = firstResponse.data.total || 0;
      }

      // Fetch remaining pages if needed
      while (allChapters.length < total && allChapters.length < 10000) {
        offset += pageSize;
        const response = await axios.get(
          `${MANGADEX_BASE_URL}/manga/${mangaId}/feed`,
          {
            params: {
              ...(translatedLanguage?.trim()
                ? { translatedLanguage: [translatedLanguage.trim()] }
                : {}),
              "order[volume]": "asc",
              "order[chapter]": "asc",
              limit: pageSize,
              offset,
              "includes[]": "scanlation_group",
              "contentRating[]": [
                "safe",
                "suggestive",
                "erotica",
                "pornographic",
              ],
            },
          },
        );

        if (response.data?.data && response.data.data.length > 0) {
          allChapters.push(...response.data.data);
        } else {
          break;
        }

        // Safety check to avoid infinite loops
        if (offset > 20000) break;
      }

      // Filter and map chapters (Kotatsu-style: filter out externalUrl chapters)
      const results = allChapters
        .filter(
          (chapter: MangaDexChapterItem) => !chapter.attributes?.externalUrl,
        )
        .map((chapter: MangaDexChapterItem) => {
          const scanlationGroup = (chapter.relationships || []).find(
            (r) => r.type === "scanlation_group",
          );
          const scanlatorName = scanlationGroup?.attributes?.name || null;
          // Generate chapter number if missing (Kotatsu-style)
          const chapterNum = chapter.attributes?.chapter || "1";
          return {
            id: chapter.id,
            chapter: chapterNum,
            volume: chapter.attributes?.volume || null,
            title: chapter.attributes?.title || null,
            publishedAt: chapter.attributes?.publishAt || null,
            branch: scanlatorName,
            scanlationGroup: scanlatorName,
            externalUrl: null,
            isExternal: false,
          } as MangaChapter;
        });

      await this.setCache(cacheKey, results, CACHE_TTL_SECONDS * 2);
      return results;
    } catch (error) {
      console.error("[MangaDex] chapter fetch failed:", error);
      return [];
    }
  }

  async getChapterPages(chapterId: string): Promise<MangaPagesResult> {
    const cacheKey = `manga:pages:${chapterId}`;
    const cached = await this.getFromCache<MangaPagesResult>(cacheKey);
    if (cached && (cached.pages.length > 0 || cached.externalUrl))
      return cached;

    try {
      const chapterMeta = await axios.get(
        `${MANGADEX_BASE_URL}/chapter/${chapterId}`,
        {
          params: { "includes[]": "manga" },
        },
      );

      const externalUrl =
        chapterMeta.data?.data?.attributes?.externalUrl || null;
      if (externalUrl) {
        const externalResult: MangaPagesResult = {
          chapterId,
          readerMode: "reversed",
          pages: [],
          externalUrl,
          isExternal: true,
        };

        await this.setCache(cacheKey, externalResult, CACHE_TTL_SECONDS * 6);
        return externalResult;
      }

      const atHome = await axios.get(
        `${MANGADEX_BASE_URL}/at-home/server/${chapterId}`,
      );

      const baseUrl = atHome.data?.baseUrl;
      const hash = atHome.data?.chapter?.hash;
      const files = atHome.data?.chapter?.data || [];
      const dataSaverFiles = atHome.data?.chapter?.dataSaver || [];

      const mangaRel = (
        (chapterMeta.data?.data?.relationships || []) as MangaDexRelationship[]
      ).find((r) => r.type === "manga");
      const mangaId = mangaRel?.id;

      let mangaData: MangaDexSearchItem | null = null;
      if (mangaId) {
        try {
          const mangaResponse = await axios.get(
            `${MANGADEX_BASE_URL}/manga/${mangaId}`,
          );
          mangaData = mangaResponse.data?.data as MangaDexSearchItem;
        } catch {
          mangaData = null;
        }
      }

      const readerMode = detectReaderMode(mangaData);
      const selectedFiles =
        readerMode === "webtoon" && dataSaverFiles.length > 0
          ? dataSaverFiles
          : files;
      const qualityPath =
        selectedFiles === dataSaverFiles ? "data-saver" : "data";

      const result: MangaPagesResult = {
        chapterId,
        readerMode,
        pages: selectedFiles.map(
          (file: string) => `${baseUrl}/${qualityPath}/${hash}/${file}`,
        ),
        externalUrl: null,
        isExternal: false,
      };

      await this.setCache(cacheKey, result, CACHE_TTL_SECONDS * 24);
      return result;
    } catch (error) {
      console.error("[MangaDex] page fetch failed:", error);
      return {
        chapterId,
        readerMode: "reversed",
        pages: [],
        externalUrl: null,
        isExternal: false,
      };
    }
  }

  async healthCheck(): Promise<{
    ok: boolean;
    latencyMs: number;
    message?: string;
  }> {
    const start = Date.now();
    try {
      await axios.get(`${MANGADEX_BASE_URL}/ping`, { timeout: 10000 });
      return {
        ok: true,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        message:
          error instanceof Error
            ? error.message
            : "MangaDex health check failed",
      };
    }
  }
}
