import { PrismaClient, Prisma, Genre as PrismaGenre, Quality as PrismaQuality } from '@prisma/client';
import IORedis from 'ioredis';
import { 
  MovieSearchParams, 
  CreateMovieRequest, 
  Movie, 
  MovieSummary, 
  PaginationMeta 
} from '@naijaspride/types';

// Initialize Redis connection
const redis = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

export class MoviesService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateMovieRequest): Promise<Movie> {
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
    
    // 1. Check Redis
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] ${cacheKey}`);
      return JSON.parse(cached);
    }

    // 2. Hit DB
    const movie = await this.prisma.movie.findUnique({ where: { slug } });
    
    if (movie) {
      const mapped = this.mapToMovie(movie);
      // 3. Save to Redis (Infinite TTL, until we manually invalidate)
      await redis.set(cacheKey, JSON.stringify(mapped));
      console.log(`[Cache SET] ${cacheKey}`);
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

    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] ${cacheKey}`);
      return JSON.parse(cached);
    }

    const where: Prisma.MovieWhereInput = {
      status: 'active',
      ...(q && { 
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } }
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
        orderBy: this.getOrderBy(sortBy),
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
    await redis.setex(cacheKey, 3600, JSON.stringify(result));
    console.log(`[Cache SET] ${cacheKey} (TTL: 1h)`);
    
    return result;
  }

  // Helper to invalidate all search caches when data changes
  private async invalidateSearchCache(): Promise<void> {
    const searchKeys = await redis.keys('search:*');
    if (searchKeys.length > 0) {
      await redis.del(...searchKeys);
      console.log(`[Cache INVALIDATED] ${searchKeys.length} search keys cleared`);
    }
  }

  private generateSlug(title: string, year: number): string {
    return `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${year}`;
  }

  private getOrderBy(sort?: string): Prisma.MovieOrderByWithRelationInput {
    switch (sort) {
      case 'popular': return { downloadCount: 'desc' };
      case 'rating': return { rating: 'desc' };
      case 'title': return { title: 'asc' };
      default: return { createdAt: 'desc' };
    }
  }

  private mapToMovie(raw: any): Movie {
    return {
      ...raw,
      fileUrls: raw.fileUrls as Record<string, string>,
      fileSizes: raw.fileSizes as Record<string, number>,
      metadata: raw.metadata as any,
    };
  }

  private mapToSummary(raw: any): MovieSummary {
    return {
      id: raw.id,
      title: raw.title,
      slug: raw.slug,
      year: raw.year,
      genre: raw.genre,
      quality: raw.quality,
      rating: raw.rating,
      thumbnailUrl: raw.thumbnailUrl,
      downloadCount: raw.downloadCount,
      nollywood: raw.genre.includes('Nollywood'),
    };
  }
}
