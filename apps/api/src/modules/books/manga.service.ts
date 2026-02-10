import { PrismaClient } from '@prisma/client';
import { AsuraSource } from './sources/providers/asura.source';
import { MadaraSource } from './sources/providers/madara.source';
import { MangaReaderSource } from './sources/providers/mangareader.source';
import { MangaDexSource } from './sources/providers/mangadex.source';
import { MangabuddySource } from './sources/providers/mangabuddy.source';
import { MmrcmsSource } from './sources/providers/mmrcms.source';
import { WeebCentralSource } from './sources/providers/weebcentral.source';
import { WpComicsSource } from './sources/providers/wpcomics.source';
import { ZeistMangaSource } from './sources/providers/zeistmanga.source';
import { MangaSourceManager } from './sources/source-manager';
import { MangaSourceRegistry } from './sources/source-registry';
import {
  MangaChapter,
  MangaDetail,
  MangaDiscoverResult,
  MangaPagesResult,
  MangaSearchFilters,
  MangaSummary,
  MangaTag,
} from './sources/types';

export type {
  MangaChapter,
  MangaDetail,
  MangaDiscoverResult,
  MangaPagesResult,
  MangaSearchFilters,
  MangaSummary,
  MangaTag,
} from './sources/types';

const parseEnabledSources = (): Set<string> => {
  const raw = process.env.MANGA_SOURCES_ENABLED;
  if (!raw || !raw.trim()) {
    return new Set(['weebcentral', 'asura', 'mangabuddy', 'mangadex']);
  }

  return new Set(
    raw
      .split(',')
      .map((sourceId) => sourceId.trim().toLowerCase())
      .filter(Boolean)
  );
};

type ConfiguredSource = {
  id: string;
  displayName: string;
  baseUrl: string;
  listPath?: string;
  tagPath?: string;
  seriesFeedLabel?: string;
  maxResults?: number;
  updatedCoverSuffix?: string;
};

export class MangaService {
  private readonly sourceManager: MangaSourceManager;
  private sourceHealthCache:
    | {
        expiresAt: number;
        data: {
          sources: Awaited<ReturnType<MangaSourceManager['getHealthStatus']>>;
          solver: Awaited<ReturnType<MangaSourceManager['getFetchGatewayHealth']>>;
        };
      }
    | null = null;
  private sourceHealthInFlight:
    | Promise<{
        sources: Awaited<ReturnType<MangaSourceManager['getHealthStatus']>>;
        solver: Awaited<ReturnType<MangaSourceManager['getFetchGatewayHealth']>>;
      }>
    | null = null;

  constructor(private prisma: PrismaClient) {
    const registry = new MangaSourceRegistry();
    const enabledSources = parseEnabledSources();
    const madaraSources = this.parseMadaraSources();
    const mangaReaderSources = this.parseMangaReaderSources();
    const zeistMangaSources = this.parseZeistMangaSources();
    const wpComicsSources = this.parseWpComicsSources();
    const mmrcmsSources = this.parseMmrcmsSources();

    if (enabledSources.has('mangadex')) {
      registry.register(new MangaDexSource());
    }

    if (enabledSources.has('weebcentral')) {
      registry.register(new WeebCentralSource());
    }

    if (enabledSources.has('asura')) {
      registry.register(new AsuraSource());
    }

    if (enabledSources.has('mangabuddy')) {
      registry.register(new MangabuddySource());
    }

    for (const source of madaraSources) {
      if (!this.isSourceEnabled(enabledSources, source.id, 'madara')) continue;
      registry.register(
        new MadaraSource({
          id: source.id,
          displayName: source.displayName,
          baseUrl: source.baseUrl,
        })
      );
    }

    for (const source of mangaReaderSources) {
      if (!this.isSourceEnabled(enabledSources, source.id, 'mangareader')) continue;
      registry.register(
        new MangaReaderSource({
          id: source.id,
          displayName: source.displayName,
          baseUrl: source.baseUrl,
          listPath: source.listPath,
        })
      );
    }

    for (const source of zeistMangaSources) {
      if (!this.isSourceEnabled(enabledSources, source.id, 'zeistmanga')) continue;
      registry.register(
        new ZeistMangaSource({
          id: source.id,
          displayName: source.displayName,
          baseUrl: source.baseUrl,
          seriesFeedLabel: source.seriesFeedLabel,
          maxResults: source.maxResults,
        })
      );
    }

    for (const source of wpComicsSources) {
      if (!this.isSourceEnabled(enabledSources, source.id, 'wpcomics')) continue;
      registry.register(
        new WpComicsSource({
          id: source.id,
          displayName: source.displayName,
          baseUrl: source.baseUrl,
          listPath: source.listPath,
        })
      );
    }

    for (const source of mmrcmsSources) {
      if (!this.isSourceEnabled(enabledSources, source.id, 'mmrcms')) continue;
      registry.register(
        new MmrcmsSource({
          id: source.id,
          displayName: source.displayName,
          baseUrl: source.baseUrl,
          listPath: source.listPath,
          tagPath: source.tagPath,
          updatedCoverSuffix: source.updatedCoverSuffix,
        })
      );
    }

    if (registry.list().length === 0) {
      registry.register(new MangaDexSource());
    }

    this.sourceManager = new MangaSourceManager(registry, this.resolveDefaultSourceId(registry));
  }

  private resolveDefaultSourceId(registry: MangaSourceRegistry): string {
    const configuredDefault = (process.env.MANGA_DEFAULT_SOURCE || '').trim().toLowerCase();
    if (configuredDefault && registry.has(configuredDefault)) {
      return configuredDefault;
    }

    const preferredOrder = ['weebcentral', 'asura', 'mangadex'];
    for (const sourceId of preferredOrder) {
      if (registry.has(sourceId)) {
        return sourceId;
      }
    }

    return registry.list()[0]?.id || 'mangadex';
  }

  private parseConfiguredSources(raw: string | undefined): ConfiguredSource[] {
    if (!raw || !raw.trim()) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as Array<{
        id?: string;
        displayName?: string;
        baseUrl?: string;
        listPath?: string;
        tagPath?: string;
        seriesFeedLabel?: string;
        maxResults?: number;
        updatedCoverSuffix?: string;
      }>;
      if (!Array.isArray(parsed)) return [];

      const result: ConfiguredSource[] = [];

      for (const entry of parsed) {
        const id = (entry.id || '').trim().toLowerCase();
        const displayName = (entry.displayName || '').trim();
        const baseUrl = (entry.baseUrl || '').trim();
        if (!id || !displayName || !baseUrl) continue;
        if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) continue;

        const configured: ConfiguredSource = {
          id,
          displayName,
          baseUrl,
        };

        if (typeof entry.listPath === 'string' && entry.listPath.trim()) {
          configured.listPath = entry.listPath.trim();
        }
        if (typeof entry.tagPath === 'string' && entry.tagPath.trim()) {
          configured.tagPath = entry.tagPath.trim();
        }
        if (typeof entry.seriesFeedLabel === 'string' && entry.seriesFeedLabel.trim()) {
          configured.seriesFeedLabel = entry.seriesFeedLabel.trim();
        }
        if (typeof entry.maxResults === 'number' && Number.isFinite(entry.maxResults) && entry.maxResults > 0) {
          configured.maxResults = Math.floor(entry.maxResults);
        }
        if (typeof entry.updatedCoverSuffix === 'string' && entry.updatedCoverSuffix.trim()) {
          configured.updatedCoverSuffix = entry.updatedCoverSuffix.trim();
        }

        result.push(configured);
      }

      return result;
    } catch {
      return [];
    }
  }

  private parseMadaraSources(): ConfiguredSource[] {
    return this.parseConfiguredSources(process.env.MADARA_SOURCES_JSON);
  }

  private parseMangaReaderSources(): ConfiguredSource[] {
    return this.parseConfiguredSources(process.env.MANGAREADER_SOURCES_JSON);
  }

  private parseZeistMangaSources(): ConfiguredSource[] {
    return this.parseConfiguredSources(process.env.ZEISTMANGA_SOURCES_JSON);
  }

  private parseWpComicsSources(): ConfiguredSource[] {
    return this.parseConfiguredSources(process.env.WPCOMICS_SOURCES_JSON);
  }

  private parseMmrcmsSources(): ConfiguredSource[] {
    return this.parseConfiguredSources(process.env.MMRCMS_SOURCES_JSON);
  }

  private isSourceEnabled(enabledSources: Set<string>, sourceId: string, familyId: string): boolean {
    return enabledSources.has(sourceId) || enabledSources.has(familyId);
  }

  getSources() {
    return this.sourceManager.getAvailableSources();
  }

  getSourceHealth() {
    const now = Date.now();
    if (this.sourceHealthCache && this.sourceHealthCache.expiresAt > now) {
      return Promise.resolve(this.sourceHealthCache.data);
    }

    if (this.sourceHealthInFlight) {
      return this.sourceHealthInFlight;
    }

    const ttlMsRaw = Number.parseInt(process.env.MANGA_SOURCE_HEALTH_CACHE_MS || '30000', 10);
    const ttlMs = Number.isFinite(ttlMsRaw) && ttlMsRaw > 0 ? ttlMsRaw : 30_000;

    this.sourceHealthInFlight = Promise.all([
      this.sourceManager.getHealthStatus(),
      this.sourceManager.getFetchGatewayHealth(),
    ])
      .then(([sources, solver]) => {
        const data = { sources, solver };
        this.sourceHealthCache = {
          expiresAt: Date.now() + ttlMs,
          data,
        };
        return data;
      })
      .finally(() => {
        this.sourceHealthInFlight = null;
      });

    return this.sourceHealthInFlight;
  }

  async searchManga(query?: string, limit = 20, filters: MangaSearchFilters = {}): Promise<MangaSummary[]> {
    return this.sourceManager.searchManga(query, limit, filters);
  }

  async searchMangaBySource(
    sourceId: string,
    query?: string,
    limit = 20,
    filters: MangaSearchFilters = {}
  ): Promise<MangaSummary[]> {
    return this.sourceManager.searchMangaBySource(sourceId, query, limit, filters);
  }

  async getDiscoverManga(limit = 12): Promise<MangaDiscoverResult> {
    return this.sourceManager.getDiscoverManga(limit);
  }

  async getDiscoverMangaBySource(sourceId: string, limit = 12): Promise<MangaDiscoverResult> {
    return this.sourceManager.getDiscoverMangaBySource(sourceId, limit);
  }

  async getMangaTags(): Promise<MangaTag[]> {
    return this.sourceManager.getMangaTags();
  }

  async getMangaTagsBySource(sourceId: string): Promise<MangaTag[]> {
    return this.sourceManager.getMangaTagsBySource(sourceId);
  }

  async getMangaDetail(mangaId: string): Promise<MangaDetail | null> {
    return this.sourceManager.getMangaDetail(mangaId);
  }

  async getMangaDetailBySource(sourceId: string, mangaId: string): Promise<MangaDetail | null> {
    return this.sourceManager.getMangaDetailBySource(sourceId, mangaId);
  }

  async getSimilarManga(mangaId: string, limit = 6): Promise<MangaSummary[]> {
    return this.sourceManager.getSimilarManga(mangaId, limit);
  }

  async getSimilarMangaBySource(sourceId: string, mangaId: string, limit = 6): Promise<MangaSummary[]> {
    return this.sourceManager.getSimilarMangaBySource(sourceId, mangaId, limit);
  }

  async getChapters(mangaId: string, translatedLanguage?: string, limit = 100): Promise<MangaChapter[]> {
    return this.sourceManager.getChapters(mangaId, translatedLanguage, limit);
  }

  async getChaptersBySource(
    sourceId: string,
    mangaId: string,
    translatedLanguage?: string,
    limit = 100
  ): Promise<MangaChapter[]> {
    return this.sourceManager.getChaptersBySource(sourceId, mangaId, translatedLanguage, limit);
  }

  async getChapterPages(chapterId: string): Promise<MangaPagesResult> {
    return this.sourceManager.getChapterPages(chapterId);
  }

  async getChapterPagesBySource(sourceId: string, chapterId: string): Promise<MangaPagesResult> {
    return this.sourceManager.getChapterPagesBySource(sourceId, chapterId);
  }

  // === Reading Progress Methods ===
  async getReadingProgress(userId: string, chapterId: string) {
    return this.prisma.mangaReadingProgress.findUnique({
      where: { userId_chapterId: { userId, chapterId } },
    });
  }

  async saveReadingProgress(
    userId: string,
    mangaId: string,
    chapterId: string,
    pageIndex: number,
    totalPages: number,
    isCompleted = false
  ) {
    return this.prisma.mangaReadingProgress.upsert({
      where: { userId_chapterId: { userId, chapterId } },
      update: {
        pageIndex,
        totalPages,
        isCompleted,
        lastReadAt: new Date(),
      },
      create: {
        userId,
        mangaId,
        chapterId,
        pageIndex,
        totalPages,
        isCompleted,
      },
    });
  }

  async getUserReadingHistory(userId: string, limit = 20) {
    return this.prisma.mangaReadingProgress.findMany({
      where: { userId },
      orderBy: { lastReadAt: 'desc' },
      take: limit,
    });
  }

  async getMangaProgressForUser(userId: string, mangaId: string) {
    return this.prisma.mangaReadingProgress.findMany({
      where: { userId, mangaId },
      orderBy: { lastReadAt: 'desc' },
    });
  }

  // === Favorites Methods ===
  async addFavorite(userId: string, mangaId: string, title: string, coverUrl?: string, status?: string) {
    return this.prisma.mangaFavorite.upsert({
      where: { userId_mangaId: { userId, mangaId } },
      update: {
        title,
        coverUrl,
        status,
        updatedAt: new Date(),
      },
      create: {
        userId,
        mangaId,
        title,
        coverUrl,
        status,
      },
    });
  }

  async removeFavorite(userId: string, mangaId: string) {
    return this.prisma.mangaFavorite.deleteMany({
      where: { userId, mangaId },
    });
  }

  async getUserFavorites(userId: string) {
    return this.prisma.mangaFavorite.findMany({
      where: { userId },
      orderBy: { addedAt: 'desc' },
    });
  }

  async isFavorite(userId: string, mangaId: string) {
    const count = await this.prisma.mangaFavorite.count({
      where: { userId, mangaId },
    });
    return count > 0;
  }
}
