import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { Genre as PrismaGenre, Prisma } from "@prisma/client";
import { ProfileService } from "./profile.service";
import { emailService } from "../../shared/services/email.service";
import { getPushService } from "../../shared/services/push-notification.service";
import { z } from "zod";
import { NotFoundError, BadRequestError } from "../../shared/errors/app-error";

// Validation schemas
const WatchlistSchema = z.object({
  movieId: z.string().uuid(),
});

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(8).optional(),
});

const PushTokenSchema = z.object({
  token: z.string().min(20).max(4096),
  platform: z.enum(["ios", "android", "desktop", "other"]).optional(),
  deviceLabel: z.string().trim().min(1).max(100).optional(),
});

const RemovePushTokenSchema = z.object({
  token: z.string().min(20).max(4096),
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

  const normalizeUserAgent = (value: string | string[] | undefined) => {
    const raw = typeof value === "string" ? value : value?.[0];
    return raw ? raw.slice(0, 512) : null;
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
        throw new BadRequestError(
          error instanceof Error ? error.message : "Failed to fetch profile",
        );
      }
    },
  });

  // PATCH /api/profile - Update user profile
  app.patch("/", {
    preHandler: [app.authenticate],
    schema: { body: UpdateProfileSchema },
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const data = request.body as z.infer<typeof UpdateProfileSchema>;
      const updateData: Prisma.UserUpdateInput = {};
      if (data.name) updateData.name = data.name;
      if (data.email) updateData.email = data.email;
      if (data.currentPassword && data.newPassword) {
        const user = await app.prisma.user.findUnique({
          where: { id: userId },
          select: { password: true },
        });

        if (!user) {
          throw new NotFoundError("User not found");
        }

        const bcrypt = await import("bcryptjs");
        const valid = await bcrypt.compare(data.currentPassword, user.password);
        if (!valid) {
          throw new BadRequestError("Current password is incorrect");
        }

        updateData.password = await bcrypt.hash(data.newPassword, 10);
      }
      const updated = await app.prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isPremium: true,
          emailVerified: true,
          updatedAt: true,
        },
      });
      if (updateData.password) {
        emailService
          .sendPasswordChangedEmail(updated.email, updated.name || undefined)
          .catch(console.error);
        getPushService(app.prisma)
          .sendPasswordChanged(userId)
          .catch(console.error);
      }
      return reply.send({
        status: "success",
        data: updated,
        message: "Profile updated successfully",
      });
    },
  });

  // Push notification token management (FCM)
  app.post("/push-tokens", {
    preHandler: [app.authenticate],
    schema: { body: PushTokenSchema },
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const { token, platform, deviceLabel } = request.body as z.infer<
        typeof PushTokenSchema
      >;
      const now = new Date();
      const saved = await app.prisma.pushNotificationToken.upsert({
        where: { token },
        update: {
          userId,
          platform: platform ?? null,
          deviceLabel: deviceLabel ?? null,
          userAgent: normalizeUserAgent(request.headers["user-agent"]),
          isActive: true,
          lastSeenAt: now,
        },
        create: {
          userId,
          token,
          platform: platform ?? null,
          deviceLabel: deviceLabel ?? null,
          userAgent: normalizeUserAgent(request.headers["user-agent"]),
          isActive: true,
          lastSeenAt: now,
        },
        select: {
          id: true,
          platform: true,
          deviceLabel: true,
          isActive: true,
          lastSeenAt: true,
          createdAt: true,
        },
      });
      return reply.send({
        status: "success",
        data: saved,
        message: "Push token registered",
      });
    },
  });

  app.get("/push-tokens", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const tokens = await app.prisma.pushNotificationToken.findMany({
        where: { userId, isActive: true },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          platform: true,
          deviceLabel: true,
          userAgent: true,
          isActive: true,
          lastSeenAt: true,
          createdAt: true,
        },
      });
      return reply.send({
        status: "success",
        data: tokens,
      });
    },
  });

  app.delete("/push-tokens", {
    preHandler: [app.authenticate],
    schema: { body: RemovePushTokenSchema },
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const { token } = request.body as z.infer<typeof RemovePushTokenSchema>;
      const result = await app.prisma.pushNotificationToken.updateMany({
        where: { userId, token, isActive: true },
        data: {
          isActive: false,
          lastSeenAt: new Date(),
        },
      });
      if (result.count === 0) {
        throw new NotFoundError("Push token not found");
      }
      return reply.send({
        status: "success",
        message: "Push token removed",
      });
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
        throw new BadRequestError(
          error instanceof Error ? error.message : "Failed to update watchlist",
        );
      }
    },
  });

  // GET /api/profile/recommendations - ML-style personalised movie recommendations
  // Algorithm: content-based filtering with genre/quality preference vectors,
  // recency decay, popularity boost, and cold-start fallback to trending.
  app.get("/recommendations", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const { limit: rawLimit } = request.query as { limit?: number | string };
      const limit = Math.min(20, Math.max(1, Number(rawLimit) || 12));

      const [watchHistory, userWithWatchlist, downloads] = await Promise.all([
        app.prisma.watchHistory.findMany({
          where: { userId },
          include: {
            movie: {
              select: { id: true, genre: true, quality: true, viewCount: true },
            },
          },
          orderBy: { updatedAt: "desc" },
          take: 100,
        }),
        app.prisma.user.findUnique({
          where: { id: userId },
          select: { watchlist: { select: { id: true } } },
        }),
        app.prisma.download.findMany({
          where: { userId },
          select: { movieId: true },
          orderBy: { timestamp: "desc" },
          take: 50,
        }),
      ]);
      const watchlistMovieIds =
        userWithWatchlist?.watchlist.map((m) => m.id) ?? [];
      const seenIds = new Set<string>([
        ...watchHistory.map((h) => h.movieId),
        ...watchlistMovieIds,
        ...downloads.map((d) => d.movieId),
      ]);
      if (watchHistory.length === 0) {
        const trending = await app.prisma.movie.findMany({
          where: { status: "active", id: { notIn: [...seenIds] } },
          orderBy: { viewCount: "desc" },
          take: limit,
          select: {
            id: true,
            title: true,
            slug: true,
            year: true,
            rating: true,
            thumbnailUrl: true,
            posterUrl: true,
            genre: true,
            viewCount: true,
            isStreamOnly: true,
            quality: true,
          },
        });
        return reply.send({
          success: true,
          data: trending,
          reason: "trending",
        });
      }
      const genreScores: Record<string, number> = {};
      const qualityScores: Record<string, number> = {};
      watchHistory.forEach((h, index) => {
        const decayWeight = Math.exp(-index * 0.05); // slow decay over 100 items
        const progressBonus = Math.min(h.progress / Math.max(h.duration, 1), 1); // 0–1 completion
        const weight = decayWeight * (0.5 + 0.5 * progressBonus); // watched more = higher weight

        (h.movie?.genre ?? []).forEach((g) => {
          genreScores[g] = (genreScores[g] ?? 0) + weight;
        });
        (h.movie?.quality ?? []).forEach((q) => {
          qualityScores[q] = (qualityScores[q] ?? 0) + weight;
        });
      });
      const maxGenreScore = Math.max(...Object.values(genreScores), 1);
      const normGenre = Object.fromEntries(
        Object.entries(genreScores).map(([g, s]) => [g, s / maxGenreScore]),
      );
      const topGenres = Object.entries(normGenre)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([g]) => g);
      const candidates = await app.prisma.movie.findMany({
        where: {
          status: "active",
          id: { notIn: [...seenIds] },
          ...(topGenres.length > 0 && {
            genre: { hasSome: topGenres as PrismaGenre[] },
          }),
        },
        take: 200, // score in-memory from a large pool
        select: {
          id: true,
          title: true,
          slug: true,
          year: true,
          rating: true,
          thumbnailUrl: true,
          posterUrl: true,
          genre: true,
          viewCount: true,
          isStreamOnly: true,
          quality: true,
        },
      });
      const scored = candidates.map((movie) => {
        let score = 0;

        // Genre match (content-based)
        for (const g of movie.genre) {
          score += normGenre[g] ?? 0;
        }

        // Quality preference bonus (up to 0.3)
        const maxQScore = Math.max(...Object.values(qualityScores), 1);
        for (const q of movie.quality) {
          score += ((qualityScores[q] ?? 0) / maxQScore) * 0.3;
        }

        // Popularity boost (log-normalised viewCount, up to 0.5)
        const viewScore = Math.log1p(movie.viewCount) / Math.log1p(100_000);
        score += Math.min(viewScore, 1) * 0.5;

        // Rating boost (up to 0.3)
        if (movie.rating) {
          score += (movie.rating / 100) * 0.3;
        }

        // Recency bonus for newer movies (up to 0.2)
        const age = new Date().getFullYear() - movie.year;
        score += Math.max(0, 1 - age / 10) * 0.2;

        return { movie, score };
      });
      scored.sort((a, b) => b.score - a.score);
      const recommendations = scored.slice(0, limit).map((s) => s.movie);
      if (recommendations.length < limit) {
        const needed = limit - recommendations.length;
        const backfillIds = new Set([
          ...seenIds,
          ...recommendations.map((r) => r.id),
        ]);
        const backfill = await app.prisma.movie.findMany({
          where: { status: "active", id: { notIn: [...backfillIds] } },
          orderBy: { viewCount: "desc" },
          take: needed,
          select: {
            id: true,
            title: true,
            slug: true,
            year: true,
            rating: true,
            thumbnailUrl: true,
            posterUrl: true,
            genre: true,
            viewCount: true,
            isStreamOnly: true,
            quality: true,
          },
        });
        recommendations.push(...(backfill as typeof recommendations));
      }
      return reply.send({
        success: true,
        data: recommendations,
        reason: "personalised",
      });
    },
  });

  // GET /api/profile/subscription - Get user subscription status
  app.get("/subscription", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
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
        throw new NotFoundError("User not found");
      }
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
    },
  });
};
