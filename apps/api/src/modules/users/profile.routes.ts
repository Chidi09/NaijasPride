import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { ProfileService } from "./profile.service";
import { z } from "zod";

// Validation schemas
const WatchlistSchema = z.object({
  movieId: z.string().uuid(),
});

export const profileRoutes = async (
  app: FastifyInstance,
  opts: FastifyPluginOptions,
) => {
  const profileService = new ProfileService(app.prisma);
  const parsePositiveInt = (value?: string) => {
    if (!value) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };

  // GET /api/profile - Get user profile with watchlist and history
  app.get("/", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        const userId = request.user.userId;
        const { watchlistPage, watchlistLimit, downloadPage, downloadLimit } =
          request.query as {
            watchlistPage?: string;
            watchlistLimit?: string;
            downloadPage?: string;
            downloadLimit?: string;
          };

        const profile = await profileService.getProfile(userId, {
          watchlistPage: parsePositiveInt(watchlistPage),
          watchlistPageSize: parsePositiveInt(watchlistLimit),
          downloadPage: parsePositiveInt(downloadPage),
          downloadPageSize: parsePositiveInt(downloadLimit),
        });

        reply.header("Cache-Control", "private, max-age=300");
        return reply.send({
          status: "success",
          data: profile,
        });
      } catch (error) {
        return reply.status(400).send({
          status: "error",
          message:
            error instanceof Error ? error.message : "Failed to fetch profile",
        });
      }
    },
  });

  // POST /api/profile/watchlist - Toggle movie in watchlist
  app.post("/watchlist", {
    preHandler: [app.authenticate],
    schema: {
      body: WatchlistSchema,
    },
    handler: async (request, reply) => {
      try {
        const userId = request.user.userId;
        const { movieId } = request.body as z.infer<typeof WatchlistSchema>;

        const result = await profileService.toggleWatchlist(userId, movieId);

        return reply.send({
          status: "success",
          data: result,
          message: result.added
            ? "Added to watchlist"
            : "Removed from watchlist",
        });
      } catch (error) {
        return reply.status(400).send({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to update watchlist",
        });
      }
    },
  });

  // GET /api/profile/subscription - Get user subscription status
  app.get("/subscription", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        const userId = request.user.userId;

        const user = await app.prisma.user.findUnique({
          where: { id: userId },
          select: {
            subStatus: true,
            subStartDate: true,
            nextBillingDate: true,
            isPremium: true,
            plan: { select: { name: true } },
          },
        });

        if (!user) {
          return reply.status(404).send({
            status: "error",
            message: "User not found",
          });
        }

        // Calculate days remaining if subscription is active
        let daysRemaining = 0;
        if (user.nextBillingDate && user.subStatus === "active") {
          const now = new Date();
          const diffTime = user.nextBillingDate.getTime() - now.getTime();
          daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }

        reply.header("Cache-Control", "private, max-age=60");
        return reply.send({
          status: "success",
          data: {
            subscriptionStatus: user.subStatus,
            subscriptionPlan: user.plan?.name?.toLowerCase() ?? "free",
            subscriptionExpiresAt: user.nextBillingDate,
            subscriptionStartedAt: user.subStartDate,
            isPremium: user.isPremium,
            daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
          },
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to fetch subscription",
        });
      }
    },
  });
};
