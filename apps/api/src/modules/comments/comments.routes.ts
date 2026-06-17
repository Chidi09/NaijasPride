import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CommentsService } from "./comments.service";

const BODY_MAX_LEN = 2000;

export async function commentsRoutes(fastify: FastifyInstance) {
  const service = new CommentsService(fastify.prisma);

  // GET /api/v1/comments?movieId=&page=&limit=  OR  ?showId=
  fastify.get(
    "/",
    {
      schema: {
        querystring: z.object({
          movieId: z.string().optional(),
          showId: z.string().optional(),
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().min(1).max(50).default(20),
        }),
      },
    },
    async (request) => {
      const { movieId, showId, page, limit } = request.query as any;
      const { comments, total } = await service.listComments({
        movieId,
        showId,
        page,
        limit,
      });

      return {
        success: true,
        data: comments,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    },
  );

  // GET /api/v1/comments/:commentId/replies
  fastify.get(
    "/:commentId/replies",
    {
      schema: { params: z.object({ commentId: z.string() }) },
    },
    async (request) => {
      const { commentId } = request.params as any;
      const data = await service.listReplies(commentId);
      return {
        success: true,
        data,
      };
    },
  );

  // POST /api/v1/comments — create a comment or reply
  fastify.post(
    "/",
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: z.object({
          movieId: z.string().optional(),
          showId: z.string().optional(),
          parentId: z.string().optional(),
          body: z.string().min(1).max(BODY_MAX_LEN),
        }),
      },
    },
    async (request, reply) => {
      const { movieId, showId, parentId, body } = request.body as any;
      const userId = (request.user as any).id;

      const comment = await service.createComment({
        userId,
        body,
        movieId,
        showId,
        parentId,
      });

      // Fire-and-forget: create notifications for replies and @mentions
      service.notifyAfterComment(comment).catch(() => {});

      return reply.status(201).send({
        success: true,
        data: {
          id: comment.id,
          body: comment.body,
          createdAt: comment.createdAt,
          replyCount: 0,
          user: {
            id: comment.user.id,
            name: comment.user.name || comment.user.email.split("@")[0],
          },
        },
      });
    },
  );

  // DELETE /api/v1/comments/:commentId
  fastify.delete(
    "/:commentId",
    {
      onRequest: [fastify.authenticate],
      schema: { params: z.object({ commentId: z.string() }) },
    },
    async (request) => {
      const { commentId } = request.params as any;
      const userId = (request.user as any).id;
      const isAdmin = (request.user as any).role === "ADMIN";

      await service.deleteComment(commentId, userId, isAdmin);
      return { success: true };
    },
  );
}
