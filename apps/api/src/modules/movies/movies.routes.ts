import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { MoviesService } from './movies.service';
import { movieSearchSchema, createMovieSchema } from '@naijaspride/validators';
import { Genre, Quality } from '@naijaspride/types';
import { Genre as PrismaGenre, Quality as PrismaQuality, Prisma } from '@prisma/client';
import { z } from 'zod';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { QueueService } from '../../shared/services/queue.service';
import { StorageService } from '../../shared/services/storage.service';
import { notificationRoutes } from './notification.routes';
import { RemoteProvider, RemoteStreamResolverService } from './remote-stream-resolver.service';

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
  const remoteResolver = new RemoteStreamResolverService();
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

  // GET /api/movies/stream/:movieId/* - public HLS segment gateway.
  // Proxies R2 objects with proper cache headers for CDN/browser caching.
  // No auth required — hls.js makes plain HTTP requests for segments
  // and cannot attach Authorization headers without custom xhrSetup.
  app.get('/stream/:movieId/*', async (request, reply) => {
    const params = request.params as { movieId?: string; '*': string };
    const movieId = (params.movieId || '').trim();
    const tail = decodeURIComponent((params['*'] || '').trim());

    if (!movieId || !tail || tail.includes('..') || tail.startsWith('/')) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid stream path' },
      });
    }

    const movie = await fastify.prisma.movie.findUnique({
      where: { id: movieId },
      select: { id: true, status: true },
    });
    if (!movie || movie.status === 'deleted') {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Movie not found' },
      });
    }

    const key = `movies/${movieId}/hls/${tail}`;
    try {
      const response = await StorageService.getClient().send(
        new GetObjectCommand({
          Bucket: StorageService.getBucket(),
          Key: key,
        }),
      );

      const ext = tail.split('.').pop()?.toLowerCase();
      const fallbackType =
        ext === 'm3u8'
          ? 'application/vnd.apple.mpegurl'
          : ext === 'ts'
            ? 'video/mp2t'
            : 'application/octet-stream';

      reply.header('content-type', response.ContentType || fallbackType);
      if (ext === 'm3u8') {
        // VOD manifests are static; short cache to allow quick updates if re-encoded
        reply.header('cache-control', 'public, max-age=300, s-maxage=600');
      } else {
        // .ts segments are immutable content-addressed chunks
        reply.header('cache-control', 'public, max-age=31536000, immutable');
      }

      return reply.send(response.Body as any);
    } catch (error) {
      fastify.log.warn({ error, key }, '[Movies] Stream gateway failed');
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Stream segment not found' },
      });
    }
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
    if (!movie || movie.status !== 'active') {
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

  // POST /api/movies/remote/resolve - resolve a stream URL from a provider page (Admin only)
  app.post('/remote/resolve', {
    onRequest: [fastify.authenticate],
    schema: {
      body: z.object({
        pageUrl: z.string().url(),
        provider: z.enum(['generic', 'soap2day']).optional().default('generic'),
        timeoutMs: z.number().int().min(5000).max(180000).optional(),
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
      pageUrl: string;
      provider: RemoteProvider;
      timeoutMs?: number;
    };

    try {
      const result = await remoteResolver.resolveFromPage(body.pageUrl, {
        provider: body.provider,
        timeoutMs: body.timeoutMs,
      });

      return reply.send({ success: true, data: result });
    } catch (error) {
      return reply.status(422).send({
        success: false,
        code: 'STREAM_RESOLVE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to resolve playable stream URL',
      });
    }
  });

  // POST /api/movies/remote/ingest - create movie and queue remote ingest job (Admin only)
  app.post('/remote/ingest', {
    onRequest: [fastify.authenticate],
    schema: {
      body: z
        .object({
          title: z.string().trim().min(1),
          year: z.number().int().min(1900).max(new Date().getFullYear() + 2),
          genre: z.array(z.nativeEnum(Genre)).min(1).default([Genre.Hollywood]),
          sourcePageUrl: z.string().url().optional(),
          sourceStreamUrl: z.string().url().optional(),
          provider: z.enum(['generic', 'soap2day']).optional().default('generic'),
          referer: z.string().url().optional(),
          queueNow: z.boolean().optional().default(true),
        })
        .refine((value) => !!value.sourcePageUrl || !!value.sourceStreamUrl, {
          message: 'Either sourcePageUrl or sourceStreamUrl is required',
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
      title: string;
      year: number;
      genre: Genre[];
      sourcePageUrl?: string;
      sourceStreamUrl?: string;
      provider: RemoteProvider;
      referer?: string;
      queueNow: boolean;
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

    await fastify.prisma.movie.update({
      where: { id: movie.id },
      data: {
        metadata: {
          sourceProvider: body.provider,
          sourcePageUrl: body.sourcePageUrl || null,
          sourceStreamUrl: body.sourceStreamUrl || null,
          sourceReferer: body.referer || null,
          ingestType: 'remote',
        } as Prisma.InputJsonValue,
      },
    });

    if (body.queueNow) {
      await queueService.addRemoteIngestJob({
        movieId: movie.id,
        sourcePageUrl: body.sourcePageUrl,
        sourceStreamUrl: body.sourceStreamUrl,
        provider: body.provider,
        referer: body.referer,
      });
    }

    return reply.send({
      success: true,
      message: body.queueNow
        ? 'Remote ingest queued for processing'
        : 'Movie created in pending state (not queued)',
      data: {
        ...movie,
        queued: body.queueNow,
      },
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
