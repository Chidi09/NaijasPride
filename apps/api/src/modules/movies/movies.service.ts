import { Prisma, PrismaClient, Genre as PrismaGenre, Quality as PrismaQuality } from '@prisma/client';
import { 
  ContentStatus,
  Genre,
  MovieSearchParams, 
  CreateMovieRequest, 
  Movie, 
  MovieSummary, 
  PaginationMeta,
} from '@naijaspride/types';
import { ZeptoMailClient } from '../notifications/zepto.client';
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
        quality: data.quality as unknown as PrismaQuality[],
        fileUrls: data.fileUrls as Prisma.InputJsonValue,
        fileSizes: (data.fileSizes ?? {}) as Prisma.InputJsonValue,
        metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    // Invalidate cache on creation
    await this.invalidateSearchCache();
    
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

    // 2. Hit DB
    const movie = await this.prisma.movie.findUnique({
      where: { slug },
      include: {
        cast: {
          orderBy: { name: 'asc' },
          take: 12,
        },
      },
    });
    
    if (movie) {
      const mapped = this.mapToMovie(movie);
      // 3. Save to Redis (Infinite TTL, until we manually invalidate)
      if (redis) {
        await redis.set(cacheKey, JSON.stringify(mapped));
        console.log(`[Cache SET] ${cacheKey}`);
      }
      return mapped;
    }
    
    return null;
  }

  async search(params: MovieSearchParams): Promise<{ data: MovieSummary[]; meta: PaginationMeta }> {
    const { page = 1, limit = 20, q, genre, year, quality, sortBy } = params;
    const skip = (page - 1) * limit;

    // Create cache key from params
    const paramKey = JSON.stringify({ q, genre, year, quality, sortBy, page, limit });
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
      ...(quality && { quality: { has: quality as unknown as PrismaQuality } }),
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

    // 2. Check if it's now High Quality (720p, 1080p, or 4K)
    const hdQualities = ['720p', '1080p', '4K', '4k'];
    const isHD = hdQualities.includes(quality);

    if (newStatus === 'active' && isHD) {
      await this.sendHdNotifications(movieId, movie.title, quality);
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
  private async sendHdNotifications(movieId: string, movieTitle: string, quality: string): Promise<void> {
    try {
      // Find users waiting for this movie
      const waiters = await this.prisma.movieNotification.findMany({
        where: { 
          movieId, 
          sent: false 
        },
        include: { user: true }
      });

      if (waiters.length === 0) return;

      console.log(`[Notifications] Sending HD alerts to ${waiters.length} users for "${movieTitle}"`);

      // Prepare email payloads
      const emailPayloads = waiters.map((record: {
        id: string;
        user: { email: string; name: string | null };
      }) => ({
        to: record.user.email,
        subject: `🎬 ${movieTitle} is now available in ${quality}!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
            <h1 style="color: #dc2626;">Good news, ${record.user.name || 'Movie Lover'}! 👋</h1>
            
            <p style="font-size: 16px; line-height: 1.6;">
              You asked us to notify you when <strong>${movieTitle}</strong> was available in good quality.
            </p>
            
            <p style="font-size: 16px; line-height: 1.6;">
              🎉 It is now available in <strong style="color: #dc2626;">${quality}</strong>. No more cam-rips!
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://naijaspride.com/movies/${movieId}" 
                 style="background: #dc2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Watch Now 🍿
              </a>
            </div>
            
            <p style="font-size: 14px; color: #666; border-top: 1px solid #eee; padding-top: 20px;">
              This is an automated message from NaijasPride. You received this because you requested to be notified when this movie became available.
            </p>
          </div>
        `
      }));

      // Send emails in bulk with rate limiting
      const results = await ZeptoMailClient.sendBulk(emailPayloads, 100);
      console.log(`[Notifications] Sent: ${results.success}, Failed: ${results.failed}`);

      // Mark notifications as sent
      const notificationIds = waiters.map((w: { id: string }) => w.id);
      await this.prisma.movieNotification.updateMany({
        where: { id: { in: notificationIds } },
        data: { sent: true }
      });
    } catch (error) {
      console.error('[Notifications] Failed to send HD notifications:', error);
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
      quality: raw.quality as unknown as Movie['quality'],
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
    downloadCount: number;
    viewCount: number;
    isStreamOnly: boolean;
    youtubeId: string | null;
  }): MovieSummary {
    return {
      id: raw.id,
      title: raw.title,
      slug: raw.slug,
      year: raw.year,
      genre: raw.genre as unknown as Genre[],
      quality: raw.quality as unknown as MovieSummary['quality'],
      rating: raw.rating,
      thumbnailUrl: raw.thumbnailUrl,
      downloadCount: raw.downloadCount,
      viewCount: raw.viewCount,
      nollywood: raw.genre.includes('Nollywood' as PrismaGenre),
      isStreamOnly: raw.isStreamOnly,
      youtubeId: raw.youtubeId,
    };
  }
}
