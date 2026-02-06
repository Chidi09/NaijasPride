import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { MoviesService } from './movies.service';
import { movieSearchSchema, createMovieSchema } from '@naijaspride/validators';
import { z } from 'zod';

export const movieRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const service = new MoviesService(fastify.prisma);

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

  // POST /api/movies - Create (Admin)
  app.post('/', {
    schema: {
      body: createMovieSchema,
    },
  }, async (request, reply) => {
    const movie = await service.create(request.body);
    return reply.status(201).send({ success: true, data: movie });
  });
};
