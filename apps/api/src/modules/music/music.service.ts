import { PrismaClient, MusicGenre, MusicRegion, ContentStatus, Prisma } from '@prisma/client';
import { getRedis } from '../../shared/services/redis.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MusicSearchParams {
  q?: string;
  genre?: MusicGenre;
  region?: MusicRegion;
  artist?: string;
  page?: number;
  limit?: number;
}

export interface MusicSearchResult {
  videos: MusicVideoRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Prisma select shape
const MUSIC_VIDEO_SELECT = {
  id: true,
  title: true,
  slug: true,
  artist: true,
  artistSlug: true,
  featuring: true,
  year: true,
  genre: true,
  region: true,
  durationSeconds: true,
  youtubeId: true,
  thumbnailUrl: true,
  hdThumbnailUrl: true,
  isOfficial: true,
  isExplicit: true,
  viewCount: true,
  playCount: true,
  likeCount: true,
  weeklyPlays: true,
  publishedAt: true,
} as const;

type MusicVideoRow = {
  id: string;
  title: string;
  slug: string;
  artist: string;
  artistSlug: string;
  featuring: string[];
  year: number;
  genre: MusicGenre[];
  region: MusicRegion;
  durationSeconds: number | null;
  youtubeId: string;
  thumbnailUrl: string | null;
  hdThumbnailUrl: string | null;
  isOfficial: boolean;
  isExplicit: boolean;
  viewCount: number;
  playCount: number;
  likeCount: number;
  weeklyPlays: number;
  publishedAt: Date | null;
};

// ─── Service ──────────────────────────────────────────────────────────────────

export class MusicService {
  private readonly redis = getRedis();
  private readonly CACHE_TTL = 300; // 5 min for featured sections

  constructor(private prisma: PrismaClient) {}

  // ── Search & Browse ──────────────────────────────────────────────────────

  async search(params: MusicSearchParams): Promise<MusicSearchResult> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? 24));
    const skip = (page - 1) * limit;

    const where: Prisma.MusicVideoWhereInput = {
      status: ContentStatus.active,
    };

    if (params.q) {
      const q = params.q.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { artist: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (params.genre) {
      where.genre = { has: params.genre };
    }

    if (params.region) {
      where.region = params.region;
    }

    if (params.artist) {
      where.artistSlug = params.artist;
    }

    const [videos, total] = await Promise.all([
      this.prisma.musicVideo.findMany({
        where,
        select: MUSIC_VIDEO_SELECT,
        orderBy: [{ weeklyPlays: 'desc' }, { playCount: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.musicVideo.count({ where }),
    ]);

    return {
      videos,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── Featured Home Sections ────────────────────────────────────────────────

  async getFeatured(): Promise<{
    trending: MusicVideoRow[];
    newReleases: MusicVideoRow[];
    replayLoop: MusicVideoRow[];
    genreTakeover: { genre: string; videos: MusicVideoRow[] } | null;
  }> {
    const cacheKey = 'music:featured';
    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const activeWhere = { status: ContentStatus.active };

    const [trending, newReleases, highReplay] = await Promise.all([
      // Trending: highest weeklyPlays in last 7 days
      this.prisma.musicVideo.findMany({
        where: { ...activeWhere, updatedAt: { gte: sevenDaysAgo } },
        select: MUSIC_VIDEO_SELECT,
        orderBy: { weeklyPlays: 'desc' },
        take: 12,
      }),

      // New Releases: published in last 30 days
      this.prisma.musicVideo.findMany({
        where: { ...activeWhere, publishedAt: { gte: thirtyDaysAgo } },
        select: MUSIC_VIDEO_SELECT,
        orderBy: { publishedAt: 'desc' },
        take: 12,
      }),

      // Replay Loop: highest ratio of playCount to viewCount (min 10 views)
      this.prisma.musicVideo.findMany({
        where: { ...activeWhere, viewCount: { gte: 10 } },
        select: MUSIC_VIDEO_SELECT,
        orderBy: { playCount: 'desc' },
        take: 12,
      }),
    ]);

    // Genre Takeover: pick the most popular genre this week by weeklyPlays sum
    const genreTakeover = await this.getWeeklyGenreTakeover();

    const result = {
      trending,
      newReleases,
      replayLoop: highReplay,
      genreTakeover,
    };

    if (this.redis) {
      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));
    }

    return result;
  }

  private async getWeeklyGenreTakeover(): Promise<{ genre: string; videos: MusicVideoRow[] } | null> {
    // Find the genre with the most weeklyPlays this week
    const genreStats = await this.prisma.$queryRaw<{ genre: string; total: bigint }[]>`
      SELECT unnest(genre::text[]) AS genre, SUM("weeklyPlays") AS total
      FROM "MusicVideo"
      WHERE status = 'active'
      GROUP BY genre
      ORDER BY total DESC
      LIMIT 1
    `;

    if (!genreStats.length) return null;

    const topGenre = genreStats[0].genre as MusicGenre;

    const videos = await this.prisma.musicVideo.findMany({
      where: { status: ContentStatus.active, genre: { has: topGenre } },
      select: MUSIC_VIDEO_SELECT,
      orderBy: { weeklyPlays: 'desc' },
      take: 8,
    });

    return { genre: topGenre, videos };
  }

  // ── Artist Pages ──────────────────────────────────────────────────────────

  async getArtistPage(artistSlug: string): Promise<{
    artistSlug: string;
    artistName: string;
    region: MusicRegion;
    totalVideos: number;
    totalPlays: number;
    topVideos: MusicVideoRow[];
    latestVideos: MusicVideoRow[];
  } | null> {
    const where = { artistSlug, status: ContentStatus.active };

    const [totalVideos, topVideos, latestVideos, aggregate] = await Promise.all([
      this.prisma.musicVideo.count({ where }),
      this.prisma.musicVideo.findMany({
        where,
        select: MUSIC_VIDEO_SELECT,
        orderBy: { playCount: 'desc' },
        take: 6,
      }),
      this.prisma.musicVideo.findMany({
        where,
        select: MUSIC_VIDEO_SELECT,
        orderBy: { publishedAt: 'desc' },
        take: 12,
      }),
      this.prisma.musicVideo.aggregate({
        where,
        _sum: { playCount: true },
      }),
    ]);

    if (totalVideos === 0) return null;

    const firstVideo = topVideos[0] ?? latestVideos[0];
    return {
      artistSlug,
      artistName: firstVideo?.artist ?? artistSlug,
      region: firstVideo?.region ?? MusicRegion.Nigeria,
      totalVideos,
      totalPlays: aggregate._sum.playCount ?? 0,
      topVideos,
      latestVideos,
    };
  }

  // ── Single Video ──────────────────────────────────────────────────────────

  async findBySlug(slug: string, userId?: string): Promise<(MusicVideoRow & { isLiked: boolean }) | null> {
    const video = await this.prisma.musicVideo.findUnique({
      where: { slug },
      select: MUSIC_VIDEO_SELECT,
    });

    if (!video) return null;

    let isLiked = false;
    if (userId) {
      const like = await this.prisma.musicLike.findUnique({
        where: { userId_musicId: { userId, musicId: video.id } },
      });
      isLiked = !!like;
    }

    return { ...video, isLiked };
  }

  // ── Engagement ────────────────────────────────────────────────────────────

  async incrementPlay(id: string, userId?: string): Promise<void> {
    await this.prisma.musicVideo.update({
      where: { id },
      data: {
        playCount: { increment: 1 },
        weeklyPlays: { increment: 1 },
      },
    });

    if (userId) {
      await this.prisma.musicWatchHistory.upsert({
        where: { userId_musicId: { userId, musicId: id } },
        update: {
          playCount: { increment: 1 },
          lastPlayedAt: new Date(),
        },
        create: {
          userId,
          musicId: id,
          playCount: 1,
        },
      });
    }
  }

  async incrementView(id: string): Promise<void> {
    await this.prisma.musicVideo.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });
  }

  async toggleLike(
    musicId: string,
    userId: string
  ): Promise<{ liked: boolean; likeCount: number }> {
    const existing = await this.prisma.musicLike.findUnique({
      where: { userId_musicId: { userId, musicId } },
    });

    let liked: boolean;
    if (existing) {
      await this.prisma.musicLike.delete({
        where: { userId_musicId: { userId, musicId } },
      });
      liked = false;
    } else {
      await this.prisma.musicLike.create({ data: { userId, musicId } });
      liked = true;
    }

    // Sync likeCount cache on the video
    const count = await this.prisma.musicLike.count({ where: { musicId } });
    await this.prisma.musicVideo.update({
      where: { id: musicId },
      data: { likeCount: count },
    });

    return { liked, likeCount: count };
  }

  // ── Playlist Management ───────────────────────────────────────────────────

  async getUserPlaylists(userId: string) {
    return this.prisma.musicPlaylist.findMany({
      where: { userId },
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPlaylist(userId: string, title: string, description?: string, isPublic = false) {
    return this.prisma.musicPlaylist.create({
      data: { userId, title, description, isPublic },
    });
  }

  async addToPlaylist(playlistId: string, musicId: string, userId: string) {
    // Ownership check
    const playlist = await this.prisma.musicPlaylist.findFirst({
      where: { id: playlistId, userId },
    });
    if (!playlist) throw new Error('Playlist not found or not owned by user');

    const maxPosition = await this.prisma.musicPlaylistItem.aggregate({
      where: { playlistId },
      _max: { position: true },
    });

    return this.prisma.musicPlaylistItem.create({
      data: {
        playlistId,
        musicId,
        position: (maxPosition._max.position ?? 0) + 1,
      },
    });
  }

  async getPlaylist(playlistId: string, userId?: string) {
    const playlist = await this.prisma.musicPlaylist.findUnique({
      where: { id: playlistId },
      include: {
        items: {
          include: {
            music: { select: MUSIC_VIDEO_SELECT },
          },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!playlist) return null;
    if (!playlist.isPublic && !playlist.isCurated && playlist.userId !== userId) return null;

    return playlist;
  }

  // ── Recommendations ───────────────────────────────────────────────────────

  async getRecommendations(userId: string, limit = 12): Promise<MusicVideoRow[]> {
    // Gather user's most played genres & artists from history
    const history = await this.prisma.musicWatchHistory.findMany({
      where: { userId },
      include: { music: { select: { genre: true, artistSlug: true } } },
      orderBy: { lastPlayedAt: 'desc' },
      take: 50,
    });

    const genreFreq = new Map<string, number>();
    const artistFreq = new Map<string, number>();
    const seenIds = new Set<string>();

    for (const h of history) {
      seenIds.add(h.musicId);
      for (const g of h.music.genre) {
        genreFreq.set(g, (genreFreq.get(g) ?? 0) + h.playCount);
      }
      artistFreq.set(h.music.artistSlug, (artistFreq.get(h.music.artistSlug) ?? 0) + h.playCount);
    }

    // Top 3 genres, top 3 artists
    const topGenres = [...genreFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([g]) => g as MusicGenre);

    const topArtists = [...artistFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([a]) => a);

    if (topGenres.length === 0) {
      // Cold start: return trending
      return this.prisma.musicVideo.findMany({
        where: { status: ContentStatus.active },
        select: MUSIC_VIDEO_SELECT,
        orderBy: { weeklyPlays: 'desc' },
        take: limit,
      });
    }

    // Fetch videos matching top genres or artists, not yet seen
    const recs = await this.prisma.musicVideo.findMany({
      where: {
        status: ContentStatus.active,
        id: { notIn: [...seenIds] },
        OR: [
          { genre: { hasSome: topGenres } },
          { artistSlug: { in: topArtists } },
        ],
      },
      select: MUSIC_VIDEO_SELECT,
      orderBy: { weeklyPlays: 'desc' },
      take: limit,
    });

    return recs;
  }

  // ── Related Videos ────────────────────────────────────────────────────────

  async getRelated(musicId: string, limit = 8): Promise<MusicVideoRow[]> {
    const video = await this.prisma.musicVideo.findUnique({
      where: { id: musicId },
      select: { genre: true, artistSlug: true, region: true },
    });
    if (!video) return [];

    return this.prisma.musicVideo.findMany({
      where: {
        id: { not: musicId },
        status: ContentStatus.active,
        OR: [
          { artistSlug: video.artistSlug },
          { genre: { hasSome: video.genre } },
          { region: video.region },
        ],
      },
      select: MUSIC_VIDEO_SELECT,
      orderBy: { weeklyPlays: 'desc' },
      take: limit,
    });
  }
}
