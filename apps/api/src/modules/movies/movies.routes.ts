import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { MoviesService } from './movies.service';
import { movieSearchSchema, createMovieSchema } from '@naijaspride/validators';
import { Genre, Quality } from '@naijaspride/types';
import { Quality as PrismaQuality } from '@prisma/client';
import { z } from 'zod';
import { QueueService } from '../../shared/services/queue.service';

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

  // GET /api/movies - List & Search
  app.get('/', {
    schema: {
      querystring: movieSearchSchema,
    },
  }, async (request) => {
    const result = await service.search(request.query);
    return { success: true, ...result };
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

    const movie = await service.create({
      ...body,
      quality: [Quality.Q720p],
      fileUrls: {},
      status: 'pending',
    } as any);

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
};
