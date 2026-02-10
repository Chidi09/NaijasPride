import { PrismaClient } from '@prisma/client';
import { AsuraSource } from './sources/providers/asura.source';
import { BatoSource } from './sources/providers/bato.source';
import { ManhwaTopSource } from './sources/providers/manhwatop.source';
import { MangaDexSource } from './sources/providers/mangadex.source';
import { MangabuddySource } from './sources/providers/mangabuddy.source';
import { WeebCentralSource } from './sources/providers/weebcentral.source';
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

    // Kotatsu-style source registration: explicit, compile-time list.
    registry.register(new MangaDexSource());
    registry.register(new WeebCentralSource());
    registry.register(new AsuraSource());
    registry.register(new BatoSource());
    registry.register(new MangabuddySource());
    registry.register(new ManhwaTopSource());

    if (registry.list().length === 0) {
      registry.register(new MangaDexSource());
    }

    this.sourceManager = new MangaSourceManager(registry, this.resolveDefaultSourceId(registry));
  }

  private resolveDefaultSourceId(registry: MangaSourceRegistry): string {
    const preferredOrder = ['weebcentral', 'asura', 'bato', 'manhwatop', 'mangabuddy', 'mangadex'];
    for (const sourceId of preferredOrder) {
      if (registry.has(sourceId)) {
        return sourceId;
      }
    }

    return registry.list()[0]?.id || 'mangadex';
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
