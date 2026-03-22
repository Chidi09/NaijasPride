import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const BODY_MAX_LEN = 2000;

export async function commentsRoutes(fastify: FastifyInstance) {
  // GET /api/v1/comments?movieId=&page=&limit=  OR  ?showId=
  fastify.get('/', {
    schema: {
      querystring: z.object({
        movieId: z.string().optional(),
        showId: z.string().optional(),
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      }),
    },
  }, async (request, reply) => {
    const { movieId, showId, page, limit } = request.query as any;
    if (!movieId && !showId) return reply.status(400).send({ success: false, error: 'movieId or showId required' });

    const where = movieId ? { movieId, parentId: null } : { showId, parentId: null };
    const [comments, total] = await Promise.all([
      fastify.prisma.comment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
          _count: { select: { replies: true } },
        },
      }),
      fastify.prisma.comment.count({ where }),
    ]);

    return {
      success: true,
      data: comments.map(c => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt,
        replyCount: c._count.replies,
        user: { id: c.user.id, name: c.user.name || c.user.email.split('@')[0] },
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });

  // GET /api/v1/comments/:commentId/replies
  fastify.get('/:commentId/replies', {
    schema: { params: z.object({ commentId: z.string() }) },
  }, async (request) => {
    const { commentId } = request.params as any;
    const replies = await fastify.prisma.comment.findMany({
      where: { parentId: commentId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return {
      success: true,
      data: replies.map(r => ({
        id: r.id,
        body: r.body,
        createdAt: r.createdAt,
        user: { id: r.user.id, name: r.user.name || r.user.email.split('@')[0] },
      })),
    };
  });

  // POST /api/v1/comments — create a comment or reply
  fastify.post('/', {
    onRequest: [fastify.authenticate],
    schema: {
      body: z.object({
        movieId: z.string().optional(),
        showId: z.string().optional(),
        parentId: z.string().optional(),
        body: z.string().min(1).max(BODY_MAX_LEN),
      }),
    },
  }, async (request, reply) => {
    const { movieId, showId, parentId, body } = request.body as any;
    const userId = (request.user as any).id;

    if (!movieId && !showId) {
      return reply.status(400).send({ success: false, error: 'movieId or showId required' });
    }

    // Validate parent exists and belongs to same content
    if (parentId) {
      const parent = await fastify.prisma.comment.findUnique({ where: { id: parentId } });
      if (!parent) return reply.status(404).send({ success: false, error: 'Parent comment not found' });
    }

    const comment = await fastify.prisma.comment.create({
      data: { userId, movieId, showId, parentId, body },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    // Fire-and-forget: create notifications for replies and @mentions
    notifyAfterComment(fastify, comment, userId).catch(() => {});

    return reply.status(201).send({
      success: true,
      data: {
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt,
        replyCount: 0,
        user: { id: comment.user.id, name: comment.user.name || comment.user.email.split('@')[0] },
      },
    });
  });

  // DELETE /api/v1/comments/:commentId
  fastify.delete('/:commentId', {
    onRequest: [fastify.authenticate],
    schema: { params: z.object({ commentId: z.string() }) },
  }, async (request, reply) => {
    const { commentId } = request.params as any;
    const userId = (request.user as any).id;
    const isAdmin = (request.user as any).role === 'ADMIN';

    const comment = await fastify.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) return reply.status(404).send({ success: false, error: 'Comment not found' });
    if (comment.userId !== userId && !isAdmin) {
      return reply.status(403).send({ success: false, error: 'Forbidden' });
    }

    await fastify.prisma.comment.delete({ where: { id: commentId } });
    return { success: true };
  });
}

async function notifyAfterComment(
  fastify: FastifyInstance,
  comment: { id: string; userId: string; parentId: string | null; body: string; movieId: string | null; showId: string | null },
  actorId: string,
) {
  const notifications: Array<{ userId: string; type: string; title: string; body: string; data: object }> = [];

  // 1. Notify parent comment author on reply
  if (comment.parentId) {
    const parent = await fastify.prisma.comment.findUnique({
      where: { id: comment.parentId },
      select: { userId: true },
    });
    if (parent && parent.userId !== actorId) {
      notifications.push({
        userId: parent.userId,
        type: 'COMMENT_REPLY',
        title: 'New reply to your comment',
        body: comment.body.slice(0, 100),
        data: { commentId: comment.id, movieId: comment.movieId, showId: comment.showId },
      });
    }
  }

  // 2. Parse @mentions and notify mentioned users
  const mentions = [...comment.body.matchAll(/@(\w+)/g)].map(m => m[1]);
  if (mentions.length) {
    const users = await fastify.prisma.user.findMany({
      where: { name: { in: mentions } },
      select: { id: true },
    });
    for (const u of users) {
      if (u.id !== actorId) {
        notifications.push({
          userId: u.id,
          type: 'COMMENT_MENTION',
          title: 'You were mentioned in a comment',
          body: comment.body.slice(0, 100),
          data: { commentId: comment.id, movieId: comment.movieId, showId: comment.showId },
        });
      }
    }
  }

  if (notifications.length) {
    await fastify.prisma.notification.createMany({
      data: notifications.map(n => ({ ...n, data: n.data as any })),
      skipDuplicates: true,
    });
  }
}
