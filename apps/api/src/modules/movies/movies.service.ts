import { Prisma, PrismaClient, Genre as PrismaGenre, Quality as PrismaQuality } from '@prisma/client';
import { 
  ContentStatus,
  Genre,
  Quality,
  MovieSearchParams, 
  CreateMovieRequest, 
  Movie, 
  MovieSummary, 
  PaginationMeta,
} from '@naijaspride/types';
import { emailService } from '../../shared/services/email.service';
import { getPushService } from '../../shared/services/push-notification.service';
import { MetadataService } from './metadata.service';
import { getRedis } from '../../shared/services/redis.service';

export class MoviesService {
  private readonly metadataService: MetadataService;

  constructor(private prisma: PrismaClient) {
    this.metadataService = new MetadataService(prisma);
  }

  async create(
    data: CreateMovieRequest & {
      status?: ContentStatus | 'pending' | 'active' | 'processing' | 'deleted';
    },
  ): Promise<Movie> {
    const movie = await this.prisma.movie.create({
      data: {
        ...data,
        slug: this.generateSlug(data.title, data.year),
        genre: data.genre as unknown as PrismaGenre[],
        quality: this.toPrismaQualities(data.quality as unknown as string[]),
        fileUrls: data.fileUrls as Prisma.InputJsonValue,
        fileSizes: (data.fileSizes ?? {}) as Prisma.InputJsonValue,
        metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    // Invalidate cache on creation
    await this.invalidateSearchCache();

    // If newly created movie is immediately active, send new-content push to genre fans
    if (!data.status || data.status === 'active') {
      this.sendNewContentNotifications(
        movie.id,
        movie.title,
        movie.slug,
        movie.genre as string[],
        movie.thumbnailUrl ?? undefined,
      ).catch(console.error);
    }
    
    return this.mapToMovie(movie);
  }

  async findBySlug(slug: string): Promise<Movie | null> {
    const cacheKey = `movie:${slug}`;
    const redis = getRedis();

    // 1. Check Redis
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`[Cache HIT] ${cacheKey}`);
        return JSON.parse(cached);
      }
    }

    // 2. Try slug lookup first
    let movie = await this.prisma.movie.findUnique({
      where: { slug },
      include: {
        cast: {
          orderBy: { name: 'asc' },
          take: 12,
        },
      },
    });

    // 3. Fallback: if slug looks like a UUID, try ID lookup (handles legacy movies)
    if (!movie && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)) {
      movie = await this.prisma.movie.findUnique({
        where: { id: slug },
        include: {
          cast: {
            orderBy: { name: 'asc' },
            take: 12,
          },
        },
      });
    }

    // 4. Fallback for stale/legacy slugs that still include HTML-entity artifacts
    // like -39- (apostrophe) or -amp- from previous slug generations.
    if (!movie) {
      const normalizedSlug = this.normalizeLegacySlug(slug);
      if (normalizedSlug !== slug) {
        movie = await this.prisma.movie.findUnique({
          where: { slug: normalizedSlug },
          include: {
            cast: {
              orderBy: { name: 'asc' },
              take: 12,
            },
          },
        });
      }
    }
    
    if (movie) {
      const mapped = this.mapToMovie(movie);
      // 5. Save to Redis (Infinite TTL, until we manually invalidate)
      if (redis) {
        await redis.set(cacheKey, JSON.stringify(mapped));
        console.log(`[Cache SET] ${cacheKey}`);
      }
      return mapped;
    }
    
    return null;
  }

  /**
   * Backfill slugs for all movies that don't have one.
   * Returns count of movies updated.
   */
  async backfillSlugs(): Promise<{ updated: number; total: number }> {
    const movies = await this.prisma.movie.findMany({
      where: {
        slug: '',
      },
      select: { id: true, title: true, year: true },
    });

    let updated = 0;
    for (const movie of movies) {
      const slug = this.generateSlug(movie.title, movie.year);
      try {
        await this.prisma.movie.update({
          where: { id: movie.id },
          data: { slug },
        });
        updated++;
      } catch (error) {
        console.error(`[Backfill Slugs] Failed for ${movie.id}:`, error);
      }
    }

    return { updated, total: movies.length };
  }

  async search(params: MovieSearchParams): Promise<{ data: MovieSummary[]; meta: PaginationMeta }> {
    const { page = 1, limit = 20, q, genre, year, quality, sortBy, isStreamOnly } =
      params as MovieSearchParams & { isStreamOnly?: boolean };
    const skip = (page - 1) * limit;

    // Create cache key from params
    const paramKey = JSON.stringify({ q, genre, year, quality, sortBy, isStreamOnly, page, limit });
    const cacheKey = `search:${Buffer.from(paramKey).toString('base64')}`;
    const redis = getRedis();

    // Check cache first
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`[Cache HIT] ${cacheKey}`);
        return JSON.parse(cached);
      }
    }

    const where: Prisma.MovieWhereInput = {
      status: 'active',
      ...(q && { 
        OR: [
          { title: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { description: { contains: q, mode: Prisma.QueryMode.insensitive } }
        ]
      }),
      ...(year && { year }),
      ...(genre && { genre: { hasSome: genre as unknown as PrismaGenre[] } }),
      ...(quality && { quality: { has: this.toPrismaQuality(quality as unknown as string) } }),
      ...(typeof isStreamOnly === 'boolean' && { isStreamOnly }),
    };

    const [total, movies] = await Promise.all([
      this.prisma.movie.count({ where }),
      this.prisma.movie.findMany({
        where,
        skip,
        take: limit,
        orderBy: this.getOrderBy(sortBy) as Prisma.MovieOrderByWithRelationInput | Prisma.MovieOrderByWithRelationInput[],
      }),
    ]);

    const result = {
      data: movies.map(this.mapToSummary),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };

    // Cache for 1 hour
    if (redis) {
      await redis.setex(cacheKey, 3600, JSON.stringify(result));
      console.log(`[Cache SET] ${cacheKey} (TTL: 1h)`);
    }
    
    return result;
  }

  /**
   * Update movie status and trigger HD notifications
   */
  async updateStatus(
    movieId: string,
    newStatus: 'active' | 'pending' | 'processing' | 'deleted',
    quality: PrismaQuality,
  ): Promise<Movie> {
    // 1. Update the movie
    const movie = await this.prisma.movie.update({
      where: { id: movieId },
      data: { 
        status: newStatus,
        quality: [quality]
      }
    });

    // 2. Notify subscribers when movie goes active (any quality)
    if (newStatus === 'active') {
      await this.sendAvailableNotifications(
        movieId,
        movie.title,
        movie.slug,
        this.fromPrismaQuality(quality),
        movie.thumbnailUrl ?? undefined,
      );
      // Also notify genre fans of new content
      this.sendNewContentNotifications(
        movieId,
        movie.title,
        movie.slug,
        movie.genre as string[],
        movie.thumbnailUrl ?? undefined,
      ).catch(console.error);
    }

    // Invalidate cache
    await this.invalidateSearchCache();
    const redis = getRedis();
    if (redis) await redis.del(`movie:${movie.slug}`);

    return this.mapToMovie(movie);
  }

  async syncMetadata(movieId: string): Promise<{ success: boolean; title?: string; message?: string }> {
    const movie = await this.prisma.movie.findUnique({
      where: { id: movieId },
      select: { id: true, title: true, year: true, slug: true },
    });

    if (!movie) {
      return { success: false, message: 'Movie not found' };
    }

    const result = await this.metadataService.fetchAndSaveMetadata(movie.id, movie.title, movie.year);

    if (!result.success) {
      return result;
    }

    await this.invalidateSearchCache();
    const redis = getRedis();
    if (redis) await redis.del(`movie:${movie.slug}`);

    return result;
  }

  /**
   * Send "Movie is ready in HD" emails to users waiting for this movie
   */
  private async sendAvailableNotifications(
    movieId: string,
    movieTitle: string,
    movieSlug: string,
    quality: string,
    thumbnailUrl?: string,
  ): Promise<void> {
    try {
      const waiters = await this.prisma.movieNotification.findMany({
        where: { movieId, sent: false },
        include: { user: { select: { id: true, email: true, name: true } } },
      });

      if (waiters.length === 0) return;

      // Mark as sent first to prevent double-sends on retry
      const notificationIds = waiters.map((w: { id: string }) => w.id);
      await this.prisma.movieNotification.updateMany({
        where: { id: { in: notificationIds } },
        data: { sent: true },
      });

      console.log(`[Notifications] Sending movie-available notifications for "${movieTitle}" to ${waiters.length} subscriber(s)`);

      // Fire individual branded emails (fire-and-forget per subscriber)
      for (const waiter of waiters) {
        emailService.sendMovieAvailableEmail(
          waiter.user.email,
          waiter.user.name ?? undefined,
          movieTitle,
          movieSlug,
          quality,
          thumbnailUrl,
        ).catch(console.error);
      }

      // Send push notifications to all waiters at once
      const waiterUserIds = waiters.map((w: { user: { id: string } }) => w.user.id);
      getPushService(this.prisma)
        .sendMovieAvailable(waiterUserIds, movieTitle, movieSlug, quality, thumbnailUrl)
        .catch(console.error);
    } catch (error) {
      console.error('[Notifications] Failed to send movie-available notifications:', error);
    }
  }

  /**
   * Send "New content added" push notifications to users who have watched
   * movies in any of the same genres (up to 500 users to avoid spam blasts).
   */
  private async sendNewContentNotifications(
    movieId: string,
    movieTitle: string,
    movieSlug: string,
    genres: string[],
    thumbnailUrl?: string,
  ): Promise<void> {
    try {
      if (genres.length === 0) return;

      // Find users who have previously watched movies in the same genre(s).
      // Capped at 500 to avoid hammering FCM on a large user base in one shot.
      const watchHistoryRows = await this.prisma.watchHistory.findMany({
        where: {
          movie: { genre: { hasSome: genres as PrismaGenre[] } },
        },
        select: { userId: true },
        distinct: ['userId'],
        take: 500,
      });

      if (watchHistoryRows.length === 0) return;

      const userIds = watchHistoryRows.map((r: { userId: string }) => r.userId);
      const primaryGenre = genres[0] ?? 'Nigerian Cinema';

      await getPushService(this.prisma).sendNewContentAlert(
        userIds,
        movieTitle,
        movieSlug,
        primaryGenre,
        thumbnailUrl,
      );
    } catch (error) {
      console.error('[Notifications] Failed to send new-content push notifications:', error);
    }
  }

  // Helper to invalidate all search caches when data changes
  private async invalidateSearchCache(): Promise<void> {
    const redis = getRedis();
    if (!redis) return;
    const searchKeys = await redis.keys('search:*');
    if (searchKeys.length > 0) {
      await redis.del(...searchKeys);
      console.log(`[Cache INVALIDATED] ${searchKeys.length} search keys cleared`);
    }
  }

  private generateSlug(title: string, year: number): string {
    return `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${year}`;
  }

  private normalizeLegacySlug(slug: string): string {
    return slug
      .toLowerCase()
      .replace(/-(amp|quot|apos|nbsp)-/g, '-')
      .replace(/-(\d{2,4})-/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private getOrderBy(sort?: string): Prisma.MovieOrderByWithRelationInput | Prisma.MovieOrderByWithRelationInput[] {
    switch (sort) {
      case 'popular': return { downloadCount: 'desc' };
      case 'trending': return { viewCount: 'desc' };
      case 'rating': return { rating: 'desc' };
      case 'title': return { title: 'asc' };
      case 'newest': return [{ year: 'desc' }, { createdAt: 'desc' }];
      default: return { createdAt: 'desc' };
    }
  }

  private toPrismaQualities(values: string[]): PrismaQuality[] {
    return [...new Set(values.map((value) => this.toPrismaQuality(value)))];
  }

  private toPrismaQuality(value: string): PrismaQuality {
    const normalized = value.trim();
    switch (normalized) {
      case '480p':
      case PrismaQuality.Q480p:
        return PrismaQuality.Q480p;
      case '720p':
      case PrismaQuality.Q720p:
        return PrismaQuality.Q720p;
      case '1080p':
      case PrismaQuality.Q1080p:
        return PrismaQuality.Q1080p;
      case '4K':
      case PrismaQuality.Q4K:
        return PrismaQuality.Q4K;
      default:
        throw new Error(`Unsupported quality value: ${value}`);
    }
  }

  private fromPrismaQuality(value: PrismaQuality): Quality {
    switch (value) {
      case PrismaQuality.Q480p:
        return Quality.Q480p;
      case PrismaQuality.Q720p:
        return Quality.Q720p;
      case PrismaQuality.Q1080p:
        return Quality.Q1080p;
      case PrismaQuality.Q4K:
        return Quality.Q4K;
      default:
        throw new Error(`Unsupported Prisma quality value: ${value}`);
    }
  }

  private mapToMovie(raw: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    year: number;
    genre: PrismaGenre[];
    language: string;
    quality: PrismaQuality[];
    durationMinutes: number | null;
    rating: number | null;
    tmdbRating: number | null;
    imdbRating: number | null;
    rottenTomatoes: string | null;
    imdbId: string | null;
    tmdbId: number | null;
    thumbnailUrl: string | null;
    coverUrl: string | null;
    posterUrl: string | null;
    backdropUrl: string | null;
    trailerUrl: string | null;
    fileUrls: unknown;
    fileSizes: unknown;
    metadata: unknown;
    youtubeId: string | null;
    isStreamOnly: boolean;
    downloadCount: number;
    viewCount: number;
    status: string;
    uploadedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
    publishedAt: Date | null;
    overview: string | null;
    tagline: string | null;
    cast?: Array<{
      id: string;
      name: string;
      character: string | null;
      photoUrl: string | null;
    }>;
  }): Movie {
    const mapped = {
      ...raw,
      genre: raw.genre as unknown as Genre[],
      quality: raw.quality.map((value) => this.fromPrismaQuality(value)) as Movie['quality'],
      fileUrls: raw.fileUrls as Record<string, string>,
      fileSizes: raw.fileSizes as Record<string, number>,
      status: raw.status as ContentStatus,
      createdAt: raw.createdAt.toISOString(),
      updatedAt: raw.updatedAt.toISOString(),
      publishedAt: raw.publishedAt ? raw.publishedAt.toISOString() : null,
      metadata: (raw.metadata ?? {}) as Movie['metadata'],
      cast: raw.cast ?? [],
    };

    return mapped as Movie;
  }

  private mapToSummary(raw: {
    id: string;
    title: string;
    slug: string;
    year: number;
    genre: PrismaGenre[];
    quality: PrismaQuality[];
    rating: number | null;
    thumbnailUrl: string | null;
    coverUrl?: string | null;
    posterUrl?: string | null;
    backdropUrl?: string | null;
    downloadCount: number;
    viewCount: number;
    isStreamOnly: boolean;
    youtubeId: string | null;
  }): MovieSummary {
    const bestThumb =
      raw.thumbnailUrl ||
      raw.posterUrl ||
      raw.coverUrl ||
      raw.backdropUrl ||
      null;
    return {
      id: raw.id,
      title: raw.title,
      slug: raw.slug,
      year: raw.year,
      genre: raw.genre as unknown as Genre[],
      quality: raw.quality.map((value) => this.fromPrismaQuality(value)) as MovieSummary['quality'],
      rating: raw.rating,
      thumbnailUrl: bestThumb,
      downloadCount: raw.downloadCount,
      viewCount: raw.viewCount,
      nollywood: raw.genre.includes('Nollywood' as PrismaGenre),
      isStreamOnly: raw.isStreamOnly,
      youtubeId: raw.youtubeId,
    };
  }
}
