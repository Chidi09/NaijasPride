import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

export async function notificationsRoutes(fastify: FastifyInstance) {
  // GET /api/v1/notifications/unread-count
  fastify.get('/unread-count', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    const userId = (request.user as any).id;
    const count = await fastify.prisma.notification.count({ where: { userId, read: false } });
    return { success: true, data: { count } };
  });

  // GET /api/v1/notifications?page=&limit=
  fastify.get('/', {
    onRequest: [fastify.authenticate],
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      }),
    },
  }, async (request) => {
    const userId = (request.user as any).id;
    const { page, limit } = request.query as any;

    const [notifications, total] = await Promise.all([
      fastify.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      fastify.prisma.notification.count({ where: { userId } }),
    ]);

    return {
      success: true,
      data: notifications,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });

  // PATCH /api/v1/notifications/read-all
  fastify.patch('/read-all', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    const userId = (request.user as any).id;
    await fastify.prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
    return { success: true };
  });

  // PATCH /api/v1/notifications/:id/read
  fastify.patch('/:id/read', {
    onRequest: [fastify.authenticate],
    schema: { params: z.object({ id: z.string() }) },
  }, async (request, reply) => {
    const userId = (request.user as any).id;
    const { id } = request.params as any;
    const notif = await fastify.prisma.notification.findUnique({ where: { id } });
    if (!notif || notif.userId !== userId) {
      return reply.status(404).send({ success: false, error: 'Not found' });
    }
    await fastify.prisma.notification.update({ where: { id }, data: { read: true } });
    return { success: true };
  });
}
