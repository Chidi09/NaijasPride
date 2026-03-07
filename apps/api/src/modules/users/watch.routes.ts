import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { z } from "zod";

// Validation schemas
const WatchProgressSchema = z.object({
  movieId: z.string().uuid(),
  progress: z.number().int().min(0).default(0),
  duration: z.number().int().min(0).default(0),
});

export const watchRoutes = async (
  app: FastifyInstance,
  opts: FastifyPluginOptions,
) => {
  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

  const toProgressPercentage = (
    progress: number,
    duration: number,
    movieDurationMinutes?: number | null,
  ) => {
    const fallbackDuration =
      typeof movieDurationMinutes === 'number' && movieDurationMinutes > 0
        ? Math.round(movieDurationMinutes * 60)
        : 0;
    const denominator = duration > 0 ? duration : fallbackDuration;
    if (denominator <= 0) return progress > 0 ? 1 : 0;
    return clamp(Math.round((progress / denominator) * 100), 0, 100);
  };

  const parsePositiveInt = (value?: string) => {
    if (!value) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };

  // POST /api/watch/progress - Save watch progress
  app.post("/progress", {
    preHandler: [app.authenticate],
    schema: {
      body: WatchProgressSchema,
    },
    handler: async (request, reply) => {
      try {
        const { movieId, progress, duration } = request.body as z.infer<
          typeof WatchProgressSchema
        >;
        const userId = request.user.userId;

        await app.prisma.watchHistory.upsert({
          where: {
            userId_movieId: { userId, movieId },
          },
          update: {
            progress,
            duration,
            updatedAt: new Date(),
          },
          create: {
            userId,
            movieId,
            progress,
            duration,
          },
        });

        return reply.send({
          status: "success",
          message: "Progress saved successfully",
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error ? error.message : "Failed to save progress",
        });
      }
    },
  });

  // GET /api/watch/progress/:movieId - Get watch progress for a specific movie
  app.get("/progress/:movieId", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        const { movieId } = request.params as { movieId: string };
        const userId = request.user.userId;

        const watchHistory = await app.prisma.watchHistory.findUnique({
          where: {
            userId_movieId: { userId, movieId },
          },
          include: {
            movie: {
              select: {
                durationMinutes: true,
              },
            },
          },
        });

        if (!watchHistory) {
          return reply.send({
            status: "success",
            data: { progress: 0, duration: 0, progressPercentage: 0 },
          });
        }

        const progressPercentage = toProgressPercentage(
          watchHistory.progress,
          watchHistory.duration,
          watchHistory.movie?.durationMinutes ?? null,
        );

        return reply.send({
          status: "success",
          data: {
            ...watchHistory,
            progressPercentage,
          },
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error ? error.message : "Failed to fetch progress",
        });
      }
    },
  });

  // GET /api/watch/history - Get user's watch history
  app.get("/history", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        const userId = request.user.userId;

        const { page, limit } = request.query as {
          page?: string;
          limit?: string;
        };
        const pageNum = Math.max(1, parsePositiveInt(page) ?? 1);
        const limitNum = Math.min(
          50,
          Math.max(1, parsePositiveInt(limit) ?? 20),
        );
        const skip = (pageNum - 1) * limitNum;

        const [total, watchHistory] = await Promise.all([
          app.prisma.watchHistory.count({ where: { userId } }),
          app.prisma.watchHistory.findMany({
            where: { userId },
            include: { movie: true },
            orderBy: { updatedAt: "desc" },
            skip,
            take: limitNum,
          }),
        ]);

        const rows = watchHistory.map((row) => ({
          ...row,
          progressPercentage: toProgressPercentage(
            row.progress,
            row.duration,
            row.movie?.durationMinutes ?? null,
          ),
        }));

        reply.header("Cache-Control", "private, max-age=300");
        return reply.send({
          status: "success",
          data: rows,
          meta: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
            hasNext: pageNum * limitNum < total,
            hasPrev: pageNum > 1,
          },
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to fetch watch history",
        });
      }
    },
  });
};
