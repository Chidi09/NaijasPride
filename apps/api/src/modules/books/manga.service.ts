import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { getRedis } from '../../shared/services/redis.service';

type MangaDexSearchItem = {
  id: string;
  type: string;
  attributes?: {
    title?: Record<string, string>;
    description?: Record<string, string>;
    status?: string;
    year?: number;
    originalLanguage?: string;
    tags?: Array<{
      attributes?: {
        name?: Record<string, string>;
      };
    }>;
  };
  relationships?: Array<{
    type?: string;
    attributes?: {
      fileName?: string;
    };
  }>;
};

export type MangaSummary = {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  status: string | null;
  year: number | null;
  originalLanguage: string | null;
  tags: string[];
};

export type MangaChapter = {
  id: string;
  chapter: string | null;
  volume: string | null;
  title: string | null;
  pages: number;
  publishedAt: string | null;
};

export type MangaPagesResult = {
  chapterId: string;
  readerMode: 'webtoon' | 'manga' | 'comic';
  pages: string[];
};

export type MangaDiscoverResult = {
  trending: MangaSummary[];
  recentlyUpdated: MangaSummary[];
  newTitles: MangaSummary[];
};

const MANGADEX_BASE_URL = 'https://api.mangadex.org';
const MANGADEX_COVER_URL = 'https://uploads.mangadex.org/covers';
const CACHE_TTL_SECONDS = 3600; // 1 hour cache for MangaDex data

const pickLocalized = (field?: Record<string, string>) => {
  if (!field) return '';
  return field.en || field['en-us'] || Object.values(field)[0] || '';
};

const extractTags = (item: MangaDexSearchItem): string[] => {
  return (
    item.attributes?.tags
      ?.map((tag) => pickLocalized(tag.attributes?.name))
      .filter(Boolean) || []
  );
};

const detectReaderMode = (manga: MangaDexSearchItem | null): 'webtoon' | 'manga' | 'comic' => {
  if (!manga) return 'manga';

  const tags = extractTags(manga).map((t) => t.toLowerCase());
  const title = pickLocalized(manga.attributes?.title).toLowerCase();
  const description = pickLocalized(manga.attributes?.description).toLowerCase();
  const originalLanguage = (manga.attributes?.originalLanguage || '').toLowerCase();

  if (
    tags.includes('long strip') ||
    title.includes('webtoon') ||
    description.includes('webtoon') ||
    description.includes('manhwa')
  ) {
    return 'webtoon';
  }

  if (originalLanguage === 'en' || tags.includes('full color')) {
    return 'comic';
  }

  return 'manga';
};

export class MangaService {
  constructor(private prisma: PrismaClient) {}

  private mapToSummary(items: MangaDexSearchItem[]): MangaSummary[] {
    return items.map((manga) => {
      const coverRel = manga.relationships?.find((r) => r.type === 'cover_art');
      const fileName = coverRel?.attributes?.fileName;
      return {
        id: manga.id,
        title: pickLocalized(manga.attributes?.title),
        description: pickLocalized(manga.attributes?.description),
        coverUrl: fileName ? `${MANGADEX_COVER_URL}/${manga.id}/${fileName}` : null,
        status: manga.attributes?.status || null,
        year: manga.attributes?.year || null,
        originalLanguage: manga.attributes?.originalLanguage || null,
        tags: extractTags(manga),
      };
    });
  }

  private async fetchCollection(cacheKey: string, limit: number, orderParam: Record<string, string>) {
    const cached = await this.getFromCache<MangaSummary[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${MANGADEX_BASE_URL}/manga`, {
        params: {
          limit,
          ...orderParam,
          'contentRating[]': ['safe', 'suggestive', 'erotica'],
          'includes[]': 'cover_art',
        },
      });

      const results = this.mapToSummary((response.data?.data || []) as MangaDexSearchItem[]);
      await this.setCache(cacheKey, results, CACHE_TTL_SECONDS);
      return results;
    } catch (error) {
      console.error('[MangaDex] discover fetch failed:', error);
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
      console.error('[Manga Cache] get error:', e);
    }
    return null;
  }

  private async setCache(key: string, data: any, ttlSeconds = CACHE_TTL_SECONDS): Promise<void> {
    const redis = getRedis();
    if (!redis) return;
    
    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(data));
      console.log(`[Manga Cache SET] ${key} (TTL: ${ttlSeconds}s)`);
    } catch (e) {
      console.error('[Manga Cache] set error:', e);
    }
  }

  async searchManga(query?: string, limit = 20): Promise<MangaSummary[]> {
    const normalizedQuery = (query || '').trim();
    const cacheKey = `manga:search:${normalizedQuery.toLowerCase() || 'featured'}:${limit}`;
    
    // Try cache first
    const cached = await this.getFromCache<MangaSummary[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${MANGADEX_BASE_URL}/manga`, {
        params: {
          limit,
          ...(normalizedQuery ? { title: normalizedQuery, 'order[relevance]': 'desc' } : { 'order[followedCount]': 'desc' }),
          'contentRating[]': ['safe', 'suggestive', 'erotica'],
          'includes[]': 'cover_art',
        },
      });

      const results = this.mapToSummary((response.data?.data || []) as MangaDexSearchItem[]);

      // Cache results
      await this.setCache(cacheKey, results, CACHE_TTL_SECONDS);
      return results;
    } catch (error) {
      console.error('[MangaDex] search failed:', error);
      return [];
    }
  }

  async getDiscoverManga(limit = 12): Promise<MangaDiscoverResult> {
    const safeLimit = Math.min(24, Math.max(1, limit));
    const [trending, recentlyUpdated, newTitles] = await Promise.all([
      this.fetchCollection(`manga:discover:trending:${safeLimit}`, safeLimit, { 'order[followedCount]': 'desc' }),
      this.fetchCollection(`manga:discover:updated:${safeLimit}`, safeLimit, { 'order[latestUploadedChapter]': 'desc' }),
      this.fetchCollection(`manga:discover:new:${safeLimit}`, safeLimit, { 'order[createdAt]': 'desc' }),
    ]);

    return { trending, recentlyUpdated, newTitles };
  }

  async getChapters(mangaId: string, translatedLanguage = 'en', limit = 100): Promise<MangaChapter[]> {
    const cacheKey = `manga:chapters:${mangaId}:${translatedLanguage}:${limit}`;
    
    // Try cache first
    const cached = await this.getFromCache<MangaChapter[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${MANGADEX_BASE_URL}/manga/${mangaId}/feed`, {
        params: {
          translatedLanguage: [translatedLanguage],
          order: { chapter: 'desc' },
          limit,
        },
      });

      const results = (response.data?.data || []).map((chapter: any) => ({
        id: chapter.id,
        chapter: chapter.attributes?.chapter || null,
        volume: chapter.attributes?.volume || null,
        title: chapter.attributes?.title || null,
        pages: chapter.attributes?.pages || 0,
        publishedAt: chapter.attributes?.publishAt || null,
      }));

      // Cache for longer since chapters don't change often
      await this.setCache(cacheKey, results, CACHE_TTL_SECONDS * 2);
      return results;
    } catch (error) {
      console.error('[MangaDex] chapter fetch failed:', error);
      return [];
    }
  }

  async getChapterPages(chapterId: string): Promise<MangaPagesResult> {
    const cacheKey = `manga:pages:${chapterId}`;
    
    // Try cache first (pages don't change)
    const cached = await this.getFromCache<MangaPagesResult>(cacheKey);
    if (cached) return cached;

    try {
      const [atHome, chapterMeta] = await Promise.all([
        axios.get(`${MANGADEX_BASE_URL}/at-home/server/${chapterId}`),
        axios.get(`${MANGADEX_BASE_URL}/chapter/${chapterId}`, {
          params: { 'includes[]': 'manga' },
        }),
      ]);

      const baseUrl = atHome.data?.baseUrl;
      const hash = atHome.data?.chapter?.hash;
      const files = atHome.data?.chapter?.data || [];
      const dataSaverFiles = atHome.data?.chapter?.dataSaver || [];

      const mangaRel = (chapterMeta.data?.data?.relationships || []).find((r: any) => r.type === 'manga');
      const mangaId = mangaRel?.id;

      let mangaData: MangaDexSearchItem | null = null;
      if (mangaId) {
        try {
          const mangaResponse = await axios.get(`${MANGADEX_BASE_URL}/manga/${mangaId}`);
          mangaData = mangaResponse.data?.data as MangaDexSearchItem;
        } catch {
          mangaData = null;
        }
      }

      const readerMode = detectReaderMode(mangaData);
      const selectedFiles = readerMode === 'webtoon' && dataSaverFiles.length > 0 ? dataSaverFiles : files;
      const qualityPath = selectedFiles === dataSaverFiles ? 'data-saver' : 'data';

      const result = {
        chapterId,
        readerMode,
        pages: selectedFiles.map((file: string) => `${baseUrl}/${qualityPath}/${hash}/${file}`),
      };

      // Cache for 24 hours (pages never change)
      await this.setCache(cacheKey, result, CACHE_TTL_SECONDS * 24);
      return result;
    } catch (error) {
      console.error('[MangaDex] page fetch failed:', error);
      return {
        chapterId,
        readerMode: 'manga',
        pages: [],
      };
    }
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
