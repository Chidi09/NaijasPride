import { getRedis } from "../../../../shared/services/redis.service";
import { FetchGateway } from "../fetch/fetch-gateway";
import { extractChapterImageUrls } from "../parsers/html-parsers";
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

export abstract class BaseHtmlSource implements MangaSource {
  abstract readonly id: string;
  abstract readonly displayName: string;
  abstract readonly capabilities: MangaSource["capabilities"];

  abstract searchManga(
    query?: string,
    limit?: number,
    filters?: MangaSearchFilters,
  ): Promise<MangaSummary[]>;
  abstract getDiscoverManga(limit?: number): Promise<MangaDiscoverResult>;
  abstract getMangaTags(): Promise<MangaTag[]>;
  abstract getMangaDetail(mangaId: string): Promise<MangaDetail | null>;
  abstract getSimilarManga(
    mangaId: string,
    limit?: number,
  ): Promise<MangaSummary[]>;
  abstract getChapters(
    mangaId: string,
    translatedLanguage?: string,
    limit?: number,
  ): Promise<MangaChapter[]>;
  abstract getChapterPages(chapterId: string): Promise<MangaPagesResult>;
  abstract healthCheck(): Promise<{
    ok: boolean;
    latencyMs: number;
    message?: string;
  }>;

  protected readonly baseUrl: string;
  protected readonly cachePrefix: string;
  protected readonly defaultCacheTtlSeconds: number;
  protected readonly fetchGateway: FetchGateway;

  constructor(options: {
    baseUrl: string;
    cachePrefix: string;
    defaultCacheTtlSeconds?: number;
    fetchGateway?: FetchGateway;
  }) {
    this.baseUrl = options.baseUrl;
    this.cachePrefix = options.cachePrefix;
    this.defaultCacheTtlSeconds = options.defaultCacheTtlSeconds ?? 600;
    this.fetchGateway = options.fetchGateway ?? new FetchGateway();
  }

  protected strip(value?: string | null): string {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  protected toAbsoluteUrl(url?: string | null): string | null {
    if (!url) return null;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    if (url.startsWith("//")) return `https:${url}`;
    return `${this.baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  protected normalizePath(pathOrUrl: string, fallbackPrefix: string): string {
    const trimmed = pathOrUrl.trim();
    if (!trimmed) return "/";

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const url = new URL(trimmed);
      return url.pathname;
    }

    if (trimmed.startsWith("/")) return trimmed;

    const prefix = fallbackPrefix.replace(/^\/+|\/+$/g, "");
    if (!prefix) {
      return `/${trimmed}`;
    }

    if (trimmed.startsWith(`${prefix}/`) || trimmed === prefix) {
      return `/${trimmed}`;
    }

    return `/${prefix}/${trimmed}`;
  }

  protected buildCacheKey(
    operation: string,
    ...parts: Array<string | number | null | undefined>
  ): string {
    const suffix = parts
      .filter(
        (part): part is string | number => part !== undefined && part !== null,
      )
      .map((part) => String(part))
      .join(":");
    return suffix
      ? `manga:${this.cachePrefix}:${operation}:${suffix}`
      : `manga:${this.cachePrefix}:${operation}`;
  }

  protected async getFromCache<T>(key: string): Promise<T | null> {
    const redis = getRedis();
    if (!redis) return null;

    try {
      const raw = await redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  protected async setCache(
    key: string,
    value: unknown,
    ttlSeconds = this.defaultCacheTtlSeconds,
  ): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch {
      // Ignore cache set errors.
    }
  }

  protected async fetchHtml(
    path: string,
    params?: Record<string, string | number | undefined>,
    timeoutMs = 20_000,
  ) {
    const url = new URL(path, this.baseUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }

    const response = await this.fetchGateway.get(url.toString(), {
      sourceId: this.id,
      timeoutMs,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `${this.displayName} upstream status ${response.status} at ${url.pathname}`,
      );
    }

    const body = response.body || "";
    const normalizedBody = body.toLowerCase();
    if (
      normalizedBody.includes("sorry, you have been blocked") ||
      normalizedBody.includes("attention required")
    ) {
      throw new Error(`${this.displayName} blocked this request (Cloudflare)`);
    }

    return body;
  }

  protected extractChapterImageUrls(html: string): string[] {
    return extractChapterImageUrls(html, this.toAbsoluteUrl.bind(this));
  }
}
