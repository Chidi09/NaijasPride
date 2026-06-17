import { MangaSourceRegistry } from "./source-registry";
import { buildSourceEntityId, parseSourceEntityId } from "./source-id";
import { sourceMetrics } from "./observability/source-metrics";
import { FetchGatewayHealth, FetchGateway } from "./fetch/fetch-gateway";
import { CircuitBreaker } from "./resilience/circuit-breaker";
import { withRetry } from "./resilience/retry";
import {
  MangaChapter,
  MangaDetail,
  MangaDiscoverResult,
  MangaPagesResult,
  MangaSearchFilters,
  MangaSource,
  MangaSummary,
  MangaTag,
} from "./types";

type SourceHealth = {
  sourceId: string;
  displayName: string;
  ok: boolean;
  latencyMs: number;
  message?: string;
  circuitState: "closed" | "open" | "half_open";
  degradationReasons: string[];
  metrics: {
    fetcherUsed: Record<string, number>;
    challengeDetected: number;
    parseEmptyPages: number;
    errors: number;
  };
  solver: FetchGatewayHealth["flaresolverr"];
};

export class MangaSourceManager {
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();
  private readonly lastErrors = new Map<string, string>();
  private readonly fetchGateway: FetchGateway;

  constructor(
    private readonly registry: MangaSourceRegistry,
    private readonly defaultSourceId = "mangadex",
    fetchGateway?: FetchGateway,
  ) {
    this.fetchGateway = fetchGateway || new FetchGateway();
    for (const source of this.registry.list()) {
      this.circuitBreakers.set(
        source.id,
        this.createBreakerForSource(source.id),
      );
    }
  }

  getDefaultSourceId(): string {
    return this.defaultSourceId;
  }

  getAvailableSources(): Array<{
    id: string;
    displayName: string;
    capabilities: MangaSource["capabilities"];
  }> {
    return this.registry.list().map((source) => ({
      id: source.id,
      displayName: source.displayName,
      capabilities: source.capabilities,
    }));
  }

  async getHealthStatus(): Promise<SourceHealth[]> {
    const sources = this.registry.list();
    const fetchHealth = await this.fetchGateway.getHealth();
    const health = await Promise.all(
      sources.map(async (source) => {
        const breaker = this.getBreaker(source.id);
        const result = await source.healthCheck();
        const degradationReasons: string[] = [];

        if (!result.ok) {
          degradationReasons.push(result.message || "health-check-failed");
        }

        if (breaker.getState() === "open") {
          degradationReasons.push("circuit-open");
        }

        const lastError = this.lastErrors.get(source.id);
        if (lastError) {
          degradationReasons.push(`last-error:${lastError}`);
        }

        return {
          sourceId: source.id,
          displayName: source.displayName,
          ...result,
          circuitState: breaker.getState(),
          degradationReasons,
          metrics: sourceMetrics.getSourceSnapshot(source.id),
          solver: fetchHealth.flaresolverr,
        };
      }),
    );
    return health;
  }

  async getFetchGatewayHealth(): Promise<FetchGatewayHealth> {
    return this.fetchGateway.getHealth();
  }

  async searchManga(
    query?: string,
    limit = 20,
    filters: MangaSearchFilters = {},
  ): Promise<MangaSummary[]> {
    const source = this.resolveSource();
    return this.runWithResilience(source, "search", () =>
      source.searchManga(query, limit, filters),
    );
  }

  async searchMangaBySource(
    sourceId: string,
    query?: string,
    limit = 20,
    filters: MangaSearchFilters = {},
  ): Promise<MangaSummary[]> {
    const source = this.resolveSource(sourceId);
    const result = await this.runWithResilience(source, "search", () =>
      source.searchManga(query, limit, filters),
    );
    return this.withSourceOnSummaries(source.id, result);
  }

  async getDiscoverManga(limit = 12): Promise<MangaDiscoverResult> {
    const source = this.resolveSource();
    return this.runWithResilience(source, "discover", () =>
      source.getDiscoverManga(limit),
    );
  }

  async getDiscoverMangaBySource(
    sourceId: string,
    limit = 12,
  ): Promise<MangaDiscoverResult> {
    const source = this.resolveSource(sourceId);
    const result = await this.runWithResilience(source, "discover", () =>
      source.getDiscoverManga(limit),
    );
    return {
      trending: this.withSourceOnSummaries(source.id, result.trending),
      recentlyUpdated: this.withSourceOnSummaries(
        source.id,
        result.recentlyUpdated,
      ),
      newTitles: this.withSourceOnSummaries(source.id, result.newTitles),
    };
  }

  async getMangaTags(): Promise<MangaTag[]> {
    const source = this.resolveSource();
    return this.runWithResilience(source, "tags", () => source.getMangaTags());
  }

  async getMangaTagsBySource(sourceId: string): Promise<MangaTag[]> {
    return this.resolveSource(sourceId).getMangaTags();
  }

  async getMangaDetail(mangaId: string): Promise<MangaDetail | null> {
    const source = this.resolveSource();
    return this.runWithResilience(source, "detail", () =>
      source.getMangaDetail(mangaId),
    );
  }

  async getMangaDetailBySource(
    sourceId: string,
    mangaId: string,
  ): Promise<MangaDetail | null> {
    const source = this.resolveSource(sourceId);
    const sourceMangaId = this.toSourceRawId(source.id, mangaId);
    const result = await this.runWithResilience(source, "detail", () =>
      source.getMangaDetail(sourceMangaId),
    );
    return result ? this.withSourceOnDetail(source.id, result) : null;
  }

  async getSimilarManga(mangaId: string, limit = 6): Promise<MangaSummary[]> {
    const source = this.resolveSource();
    return this.runWithResilience(source, "similar", () =>
      source.getSimilarManga(mangaId, limit),
    );
  }

  async getSimilarMangaBySource(
    sourceId: string,
    mangaId: string,
    limit = 6,
  ): Promise<MangaSummary[]> {
    const source = this.resolveSource(sourceId);
    const sourceMangaId = this.toSourceRawId(source.id, mangaId);
    const result = await this.runWithResilience(source, "similar", () =>
      source.getSimilarManga(sourceMangaId, limit),
    );
    return this.withSourceOnSummaries(source.id, result);
  }

  async getChapters(
    mangaId: string,
    translatedLanguage?: string,
    limit = 100,
  ): Promise<MangaChapter[]> {
    const source = this.resolveSource();
    return this.runWithResilience(source, "chapters", () =>
      source.getChapters(mangaId, translatedLanguage, limit),
    );
  }

  async getChaptersBySource(
    sourceId: string,
    mangaId: string,
    translatedLanguage?: string,
    limit = 100,
  ): Promise<MangaChapter[]> {
    const source = this.resolveSource(sourceId);
    const sourceMangaId = this.toSourceRawId(source.id, mangaId);
    const effectiveLanguage =
      translatedLanguage || (source.id === "mangadex" ? "en" : undefined);
    const result = await this.runWithResilience(source, "chapters", () =>
      source.getChapters(sourceMangaId, effectiveLanguage, limit),
    );
    return this.withSourceOnChapters(source.id, result);
  }

  async getChapterPages(chapterId: string): Promise<MangaPagesResult> {
    const source = this.resolveSource();
    return this.runWithResilience(source, "pages", () =>
      source.getChapterPages(chapterId),
    );
  }

  async getChapterPagesBySource(
    sourceId: string,
    chapterId: string,
  ): Promise<MangaPagesResult> {
    const source = this.resolveSource(sourceId);
    const sourceChapterId = this.toSourceRawId(source.id, chapterId);
    const result = await this.runWithResilience(source, "pages", () =>
      source.getChapterPages(sourceChapterId),
    );
    return this.withSourceOnPages(source.id, result);
  }

  private async runWithResilience<T>(
    source: MangaSource,
    operation: string,
    action: () => Promise<T>,
  ): Promise<T> {
    const breaker = this.getBreaker(source.id);
    if (!breaker.canExecute()) {
      this.lastErrors.set(source.id, "circuit-open");
      throw new Error(
        `Source ${source.id} is temporarily unavailable (circuit open) for ${operation}`,
      );
    }

    try {
      const result = await withRetry(action, {
        maxAttempts: 3,
        initialDelayMs: 250,
      });
      breaker.onSuccess();
      this.lastErrors.delete(source.id);
      return result;
    } catch (error) {
      breaker.onFailure();
      sourceMetrics.incrementError(source.id);
      this.lastErrors.set(
        source.id,
        error instanceof Error ? error.message : "unknown-error",
      );
      throw error;
    }
  }

  private createBreakerForSource(sourceId: string): CircuitBreaker {
    const prefix = `MANGA_SOURCE_${sourceId.toUpperCase()}`;
    const failureThreshold = Number.parseInt(
      process.env[`${prefix}_CB_FAILURES`] || "5",
      10,
    );
    const recoveryTimeoutMs = Number.parseInt(
      process.env[`${prefix}_CB_RECOVERY_MS`] || "30000",
      10,
    );

    return new CircuitBreaker({
      failureThreshold:
        Number.isFinite(failureThreshold) && failureThreshold > 0
          ? failureThreshold
          : 5,
      recoveryTimeoutMs:
        Number.isFinite(recoveryTimeoutMs) && recoveryTimeoutMs > 0
          ? recoveryTimeoutMs
          : 30_000,
      halfOpenMaxCalls: 1,
    });
  }

  private getBreaker(sourceId: string): CircuitBreaker {
    const existing = this.circuitBreakers.get(sourceId);
    if (existing) return existing;

    const created = this.createBreakerForSource(sourceId);
    this.circuitBreakers.set(sourceId, created);
    return created;
  }

  private toSourceRawId(sourceId: string, id: string): string {
    const parsed = parseSourceEntityId(id);
    if (!parsed) return id;
    if (parsed.sourceId !== sourceId) {
      throw new Error(
        `ID source mismatch: expected ${sourceId}, received ${parsed.sourceId}`,
      );
    }
    return parsed.rawId;
  }

  private withSourceOnSummaries(
    sourceId: string,
    entries: MangaSummary[],
  ): MangaSummary[] {
    return entries.map((entry) => ({
      ...entry,
      id: buildSourceEntityId(sourceId, entry.id),
    }));
  }

  private withSourceOnDetail(
    sourceId: string,
    detail: MangaDetail,
  ): MangaDetail {
    return {
      ...detail,
      id: buildSourceEntityId(sourceId, detail.id),
    };
  }

  private withSourceOnChapters(
    sourceId: string,
    chapters: MangaChapter[],
  ): MangaChapter[] {
    return chapters.map((chapter) => ({
      ...chapter,
      id: buildSourceEntityId(sourceId, chapter.id),
    }));
  }

  private withSourceOnPages(
    sourceId: string,
    pages: MangaPagesResult,
  ): MangaPagesResult {
    return {
      ...pages,
      chapterId: buildSourceEntityId(sourceId, pages.chapterId),
    };
  }

  private resolveSource(sourceId?: string): MangaSource {
    const normalizedSourceId = sourceId || this.defaultSourceId;
    const source = this.registry.get(normalizedSourceId);
    if (!source) {
      throw new Error(`Unknown manga source: ${normalizedSourceId}`);
    }
    return source;
  }
}
