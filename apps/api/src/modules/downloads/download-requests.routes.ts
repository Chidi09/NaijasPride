import type { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { processDownloadRequest } from './download-requests.service.js';

const createDownloadBodySchema = z.object({
  movieId: z.string().optional(),
  showId: z.string().optional(),
});

const downloadIdParamSchema = z.object({ id: z.string() });

const myDownloadsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function downloadRequestRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // POST /api/v1/download-requests — request a movie or show download
  app.post('/', {
    onRequest: [fastify.authenticate],
    schema: {
      body: createDownloadBodySchema,
    },
  }, async (request, reply) => {
    const { movieId, showId } = request.body;
    const userId = request.user.id;

    if (!movieId && !showId) {
      return reply.status(400).send({ success: false, error: 'movieId or showId required' });
    }

    // Upsert so repeated requests reset status instead of creating duplicates
    const req = await fastify.prisma.downloadRequest.upsert({
      where: movieId ? { userId_movieId: { userId, movieId } } : { userId_showId: { userId, showId: showId! } },
      create: { userId, movieId, showId, status: 'PENDING' },
      update: { status: 'PENDING', errorMsg: null, magnetLink: null },
    });

    // Kick off search asynchronously — don't block the response
    processDownloadRequest(fastify.prisma, req.id).catch((err) => {
      fastify.log.error({ err, requestId: req.id }, '[DownloadRequest] processing failed');
    });

    return reply.status(202).send({
      success: true,
      data: { id: req.id, status: req.status },
      message: 'Request submitted. We\'ll notify you when the download is ready.',
    });
  });

  // GET /api/v1/download-requests/my — user's own requests (most recent first)
  app.get('/my', {
    onRequest: [fastify.authenticate],
    schema: {
      querystring: myDownloadsQuerySchema,
    },
  }, async (request) => {
    const userId = request.user.id;
    const requests = await fastify.prisma.downloadRequest.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: request.query.limit,
      include: {
        movie: { select: { id: true, title: true, slug: true, thumbnailUrl: true } },
        show: { select: { id: true, title: true, slug: true, thumbnailUrl: true } },
      },
    });
    return { success: true, data: requests };
  });

  // GET /api/v1/download-requests/:id — check status of a specific request
  app.get('/:id', {
    onRequest: [fastify.authenticate],
    schema: { params: downloadIdParamSchema },
  }, async (request, reply) => {
    const userId = request.user.id;
    const { id } = request.params;
    const req = await fastify.prisma.downloadRequest.findUnique({ where: { id } });
    if (!req || req.userId !== userId) {
      return reply.status(404).send({ success: false, error: 'Not found' });
    }
    return { success: true, data: req };
  });
}
