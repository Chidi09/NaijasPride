import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { MoviesService } from './movies.service';
import { movieSearchSchema, createMovieSchema } from '@naijaspride/validators';
import { Genre, Quality } from '@naijaspride/types';
import { Genre as PrismaGenre, Quality as PrismaQuality } from '@prisma/client';
import { z } from 'zod';
import { QueueService } from '../../shared/services/queue.service';
import { StorageService } from '../../shared/services/storage.service';
import { notificationRoutes } from './notification.routes';

const toQualityEnum = (value: '480p' | '720p' | '1080p' | '4K'): PrismaQuality => {
  switch (value) {
    case '480p':
      return PrismaQuality.Q480p;
    case '720p':
      return PrismaQuality.Q720p;
    case '1080p':
      return PrismaQuality.Q1080p;
    case '4K':
      return PrismaQuality.Q4K;
  }
};

export const movieRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const service = new MoviesService(fastify.prisma);
  const queueService = new QueueService();
  const storageService = new StorageService();
  const movieSignedUrlTtlSecondsRaw = Number.parseInt(process.env.MOVIE_DOWNLOAD_URL_TTL_SECONDS || '21600', 10);
  const movieSignedUrlTtlSeconds =
    Number.isFinite(movieSignedUrlTtlSecondsRaw) && movieSignedUrlTtlSecondsRaw >= 3600
      ? Math.min(movieSignedUrlTtlSecondsRaw, 7 * 24 * 60 * 60)
      : 6 * 60 * 60;

  // GET /api/movies - List & Search
  app.get('/', {
    schema: {
      querystring: movieSearchSchema,
    },
  }, async (request) => {
    const result = await service.search(request.query);
    return { success: true, ...result };
  });

  // GET /api/movies/download?key=movies/... - Redirect to a signed/public URL
  // Keeps movie.fileUrls stable even when storage is private (R2/S3/GCS).
  app.get('/download', {
    schema: {
      querystring: z.object({
        key: z.string().trim().min(1),
      }),
    },
  }, async (request, reply) => {
    const { key } = request.query as { key: string };
    if (!key.startsWith('movies/')) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid key' },
      });
    }

    const url = await storageService.getDownloadUrl(key, { expiresInSeconds: movieSignedUrlTtlSeconds });
    return reply.redirect(url);
  });

  // GET /api/movies/featured - Most Watched + Coming Soon (public, no auth required)
  app.get('/featured', async (_request, reply) => {
    const [mostWatched, comingSoon] = await Promise.all([
      // Top 12 most-watched active movies
      fastify.prisma.movie.findMany({
        where: { status: 'active' },
        orderBy: { viewCount: 'desc' },
        take: 12,
        select: {
          id: true, title: true, slug: true, year: true, rating: true,
          thumbnailUrl: true, posterUrl: true, genre: true, viewCount: true,
          isStreamOnly: true, quality: true,
        },
      }),
      // Movies people are waiting for — pending/processing, sorted by notification count
      fastify.prisma.movie.findMany({
        where: { status: { in: ['pending', 'processing'] } },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true, title: true, slug: true, year: true, rating: true,
          thumbnailUrl: true, posterUrl: true, backdropUrl: true, genre: true,
          isStreamOnly: true, quality: true,
          _count: { select: { notifications: true } },
        },
      }),
    ]);

    // Sort coming-soon by number of notification subscribers (most anticipated first)
    const comingSoonSorted = comingSoon.sort(
      (a, b) => (b._count?.notifications ?? 0) - (a._count?.notifications ?? 0)
    );

    return reply.send({
      success: true,
      data: {
        mostWatched,
        comingSoon: comingSoonSorted,
      },
    });
  });

  // GET /api/movies/:slug - Detail
  app.get('/:slug', {
    schema: {
      params: z.object({ slug: z.string() }),
    },
  }, async (request, reply) => {
    const movie = await service.findBySlug(request.params.slug);
    if (!movie) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Movie not found' }
      });
    }
    return { success: true, data: movie };
  });

  // GET /api/movies/:slug/similar - Get similar/related movies
  app.get('/:slug/similar', {
    schema: {
      params: z.object({ slug: z.string() }),
      querystring: z.object({
        limit: z.coerce.number().int().min(1).max(20).default(8),
      }),
    },
  }, async (request, reply) => {
    const { slug } = request.params;
    const { limit } = request.query as { limit: number };

    const movie = await service.findBySlug(slug);
    if (!movie) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Movie not found' }
      });
    }

    // Find similar movies by genre overlap and exclude current movie
    const similar = await fastify.prisma.movie.findMany({
      where: {
        id: { not: movie.id },
        status: 'active',
        genre: { hasSome: movie.genre as unknown as PrismaGenre[] },
      },
      orderBy: [
        { rating: 'desc' },
        { viewCount: 'desc' },
      ],
      take: limit,
      select: {
        id: true,
        title: true,
        slug: true,
        year: true,
        rating: true,
        thumbnailUrl: true,
        posterUrl: true,
        genre: true,
        isStreamOnly: true,
      },
    });

    return { success: true, data: similar };
  });

  // POST /api/movies - Create (Admin Only 🔒)
  app.post('/', {
    onRequest: [fastify.authenticate], // Verify JWT token
    schema: {
      body: createMovieSchema,
    },
  }, async (request, reply) => {
    // Check if user is ADMIN
    if (request.user.role !== 'ADMIN') {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admins only' }
      });
    }

    const movie = await service.create(request.body);
    return reply.status(201).send({ success: true, data: movie });
  });

  // POST /api/movies/torrents - queue a torrent download (Admin only)
  app.post('/torrents', {
    onRequest: [fastify.authenticate],
    schema: {
      body: z.object({
        magnetLink: z.string(),
        title: z.string(),
        year: z.number().int(),
        genre: z.array(z.nativeEnum(Genre)).min(1),
      }),
    },
  }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admins only' }
      });
    }

    const body = request.body as {
      magnetLink: string;
      title: string;
      year: number;
      genre: Genre[];
    };

    const createPayload: Parameters<MoviesService['create']>[0] = {
      title: body.title,
      year: body.year,
      genre: body.genre,
      quality: [Quality.Q720p],
      fileUrls: {},
      status: 'pending',
    };

    const movie = await service.create(createPayload);

    await queueService.addTorrentJob(body.magnetLink, movie.id);

    return reply.send({
      success: true,
      message: 'Torrent queued for processing',
      data: movie,
    });
  });

  // PATCH /api/movies/:id/status - Update movie status (Admin only)
  // Triggers HD notification emails
  app.patch('/:id/status', {
    onRequest: [fastify.authenticate],
    schema: {
      params: z.object({ id: z.string().uuid() }),
      body: z.object({
        status: z.enum(['active', 'pending', 'processing', 'deleted']),
        quality: z.enum(['480p', '720p', '1080p', '4K']),
      }),
    },
  }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admins only' }
      });
    }

    const { id } = request.params;
    const { status, quality } = request.body;

    const movie = await service.updateStatus(id, status, toQualityEnum(quality));

    return reply.send({
      success: true,
      message: `Movie status updated to ${status} with ${quality} quality`,
      data: movie,
    });
  });

  // POST /api/movies/:id/metadata/sync - Fetch metadata from TMDB (Admin only)
  app.post('/:id/metadata/sync', {
    onRequest: [fastify.authenticate],
    schema: {
      params: z.object({ id: z.string().uuid() }),
    },
  }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admins only' }
      });
    }

    const result = await service.syncMetadata(request.params.id);

    if (!result.success) {
      const statusCode = result.message === 'Movie not found' ? 404 : 400;
      return reply.status(statusCode).send({
        success: false,
        error: { code: 'METADATA_SYNC_FAILED', message: result.message || 'Unable to sync metadata' },
      });
    }

    return reply.send({
      success: true,
      data: result,
      message: `Metadata synced for ${result.title}`,
    });
  });

  // Register notification routes
  await fastify.register(notificationRoutes, { prefix: '' });
};
