import { FastifyPluginAsync } from "fastify";

/**
 * GET /api/v1/plans
 * Returns all subscription plans ordered by priority.
 * Public endpoint — no auth required.
 */
export const plansRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (_request, reply) => {
    const plans = await fastify.prisma.plan.findMany({
      orderBy: { priority: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        price: true,
        currency: true,
        durationDays: true,
        maxScreens: true,
        maxQuality: true,
        download: true,
        ads: true,
        priority: true,
      },
    });

    return reply.send({ success: true, data: plans });
  });
};
