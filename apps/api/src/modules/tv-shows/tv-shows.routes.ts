import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { tvEmbedQuerySchema, tvShowSearchSchema, saveTvProgressSchema } from '@naijaspride/validators';
import { TvShowsService } from './tv-shows.service';
import { EmbedResolverService } from '../movies/embed-resolver.service';
import { TvTmdbSyncService } from './tv-tmdb-sync.service';
import { z } from 'zod';

export const tvShowRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const service = new TvShowsService(fastify.prisma);
  const embedResolver = new EmbedResolverService();
  const tmdbSyncService = new TvTmdbSyncService(fastify.prisma);

  app.get('/', {
    schema: {
      querystring: tvShowSearchSchema,
    },
  }, async (request) => {
    const result = await service.search(request.query as z.infer<typeof tvShowSearchSchema>);
    return { success: true, ...result };
  });

  app.post('/sync', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admins only' },
      });
    }

    const summary = await tmdbSyncService.syncCatalog();
    return reply.send({ success: true, data: summary });
  });

  app.post('/progress', {
    onRequest: [fastify.authenticate],
    schema: {
      body: saveTvProgressSchema,
    },
  }, async (request, reply) => {
    const body = request.body as z.infer<typeof saveTvProgressSchema>;
    await service.saveProgress(request.user.userId, body);
    return reply.send({ success: true, message: 'TV progress saved' });
  });

  app.get('/history', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    const { limit } = request.query as { limit?: string };
    const rows = await service.getHistory(request.user.userId, limit ? parseInt(limit) : 10);
    return { success: true, data: rows };
  });

  app.get('/progress/:showId', {
    onRequest: [fastify.authenticate],
    schema: {
      params: z.object({ showId: z.string().uuid() }),
    },
  }, async (request) => {
    const { showId } = request.params as { showId: string };
    const progress = await service.getProgress(request.user.userId, showId);
    return { success: true, data: progress };
  });

  app.get('/:slug/embeds', {
    schema: {
      params: z.object({ slug: z.string().min(1) }),
      querystring: tvEmbedQuerySchema,
    },
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { season, episode } = request.query as z.infer<typeof tvEmbedQuerySchema>;

    const resolved = await service.resolveEpisode(slug, season, episode);
    if (!resolved) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'TV show or episode not found' },
      });
    }

    const embeds = embedResolver.resolveTv(resolved.imdbId, resolved.tmdbId, season, episode);

    return reply.send({
      success: true,
      data: {
        showId: resolved.showId,
        episodeId: resolved.episodeId,
        imdbId: resolved.imdbId,
        tmdbId: resolved.tmdbId,
        season,
        episode,
        providers: embeds,
      },
    });
  });

  app.get('/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const show = await service.findBySlug(slug);
    if (!show) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'TV show not found' },
      });
    }

    // Increment view count (fire-and-forget)
    fastify.prisma.tvShow.update({
      where: { id: show.id },
      data: { viewCount: { increment: 1 } },
    }).catch(() => {});

    return reply.send({ success: true, data: show });
  });
};
