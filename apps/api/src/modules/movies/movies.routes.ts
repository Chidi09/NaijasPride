import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { MoviesService } from './movies.service';
import { movieSearchSchema, createMovieSchema } from '@naijaspride/validators';
import { z } from 'zod';
import { QueueService } from '../../shared/services/queue.service';
import { Genre, Quality } from '@prisma/client';

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

    const body = request.body as any;

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
};
