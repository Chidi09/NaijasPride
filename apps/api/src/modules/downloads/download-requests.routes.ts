import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { processDownloadRequest } from './download-requests.service.js';

export async function downloadRequestRoutes(fastify: FastifyInstance) {
  // POST /api/v1/download-requests — request a movie or show download
  fastify.post('/', {
    onRequest: [fastify.authenticate],
    schema: {
      body: z.object({
        movieId: z.string().optional(),
        showId: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const { movieId, showId } = request.body as any;
    const userId = (request.user as any).id;

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

  // GET /api/v1/download-requests/my — user's own requests
  fastify.get('/my', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    const userId = (request.user as any).id;
    const requests = await fastify.prisma.downloadRequest.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        movie: { select: { id: true, title: true, slug: true, thumbnailUrl: true } },
        show: { select: { id: true, title: true, slug: true, thumbnailUrl: true } },
      },
    });
    return { success: true, data: requests };
  });

  // GET /api/v1/download-requests/:id — check status of a specific request
  fastify.get('/:id', {
    onRequest: [fastify.authenticate],
    schema: { params: z.object({ id: z.string() }) },
  }, async (request, reply) => {
    const userId = (request.user as any).id;
    const { id } = request.params as any;
    const req = await fastify.prisma.downloadRequest.findUnique({ where: { id } });
    if (!req || req.userId !== userId) {
      return reply.status(404).send({ success: false, error: 'Not found' });
    }
    return { success: true, data: req };
  });
}
