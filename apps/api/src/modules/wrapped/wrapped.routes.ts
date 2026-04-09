import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { WrappedService } from "./wrapped.service";

const paramsSchema = z.object({
  period: z.string().regex(/^(\d{4})-(\d{2}|annual)$/),
});

const publicParamsSchema = z.object({
  userId: z.string().uuid(),
  period: z.string().regex(/^(\d{4})-(\d{2}|annual)$/),
});

export const wrappedRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const wrappedService = new WrappedService(app.prisma);

  // GET /api/v1/wrapped/periods - List available periods for current user
  app.get(
    "/periods",
    {
      onRequest: [fastify.authenticate],
    },
    async (request, reply) => {
      const periods = await wrappedService.getAvailablePeriods(
        request.user.userId,
      );
      return reply.send({ success: true, data: periods });
    },
  );

  // GET /api/v1/wrapped/:period - Get wrapped for current user
  app.get(
    "/:period",
    {
      onRequest: [fastify.authenticate],
      schema: { params: paramsSchema },
    },
    async (request, reply) => {
      const { period } = request.params;
      const wrapped = await wrappedService.getForUser(
        request.user.userId,
        period,
      );

      if (!wrapped) {
        return reply.status(404).send({
          success: false,
          error: "Wrapped not found",
          message: `No wrapped data available for ${period}`,
        });
      }

      return reply.send({
        success: true,
        data: {
          period,
          stats: wrapped.stats,
          cardUrls: wrapped.cardUrls,
        },
      });
    },
  );

  // POST /api/v1/wrapped/:period/generate - Force regenerate
  app.post(
    "/:period/generate",
    {
      onRequest: [fastify.authenticate],
      schema: { params: paramsSchema },
    },
    async (request, reply) => {
      const { period } = request.params;
      const result = await wrappedService.generateForUser(
        request.user.userId,
        period,
        { force: true },
      );

      return reply.send({
        success: true,
        data: {
          period,
          stats: result.stats,
          cardUrls: result.cardUrls,
        },
      });
    },
  );

  // GET /api/v1/wrapped/public/:userId/:period - Public share link
  // No auth required - anyone can view shared wrapped
  app.get(
    "/public/:userId/:period",
    {
      schema: { params: publicParamsSchema },
    },
    async (request, reply) => {
      const { userId, period } = request.params;
      const wrapped = await wrappedService.getPublicWrapped(userId, period);

      if (!wrapped) {
        return reply.status(404).send({
          success: false,
          error: "Wrapped not found",
          message: "This wrapped is not available or has been removed",
        });
      }

      return reply.send({
        success: true,
        data: {
          period,
          userName: wrapped.userName,
          stats: wrapped.stats,
          cardUrls: wrapped.cardUrls,
        },
      });
    },
  );

  // DELETE /api/v1/wrapped/:period - Delete wrapped
  app.delete(
    "/:period",
    {
      onRequest: [fastify.authenticate],
      schema: { params: paramsSchema },
    },
    async (request, reply) => {
      const { period } = request.params;
      await wrappedService.deleteForUser(request.user.userId, period);

      return reply.send({
        success: true,
        message: `Wrapped for ${period} deleted`,
      });
    },
  );
};
