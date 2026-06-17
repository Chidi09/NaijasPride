/**
 * Offline Content Routes
 *
 * Tracks which movies users have saved locally for offline viewing through the PWA.
 * The actual video data is stored client-side (Cache Storage/IndexedDB); this table
 * is a server-side record so we can:
 *  - Show the user their saved content across devices (UI sync)
 *  - Respect plan limits (e.g. free tier = no offline saves)
 *  - Provide admin visibility into offline usage
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPushService } from "../../shared/services/push-notification.service";
import { NotFoundError, ForbiddenError } from "../../shared/errors/app-error";

const SaveOfflineSchema = z.object({
  movieId: z.string().uuid(),
  quality: z.enum(["480p", "720p", "1080p", "4K"]),
  fileSizeBytes: z.number().int().positive().optional(),
});

const RemoveOfflineSchema = z.object({
  movieId: z.string().uuid(),
  quality: z.enum(["480p", "720p", "1080p", "4K"]),
});

const OfflineFailureSchema = z.object({
  movieId: z.string().uuid(),
  quality: z.enum(["480p", "720p", "1080p", "4K"]),
  reason: z.string().trim().min(1).max(280),
});

export const offlineRoutes = async (app: FastifyInstance) => {
  // POST /api/v1/profile/offline — Record that a movie was saved for offline
  app.post("/offline", {
    preHandler: [app.authenticate],
    schema: { body: SaveOfflineSchema },
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const { movieId, quality, fileSizeBytes } = request.body as z.infer<
        typeof SaveOfflineSchema
      >;

      // Check the movie exists
      const movie = await app.prisma.movie.findUnique({
        where: { id: movieId },
        select: {
          id: true,
          title: true,
          slug: true,
          thumbnailUrl: true,
          isStreamOnly: true,
        },
      });

      if (!movie) throw new NotFoundError("Movie");

      if (movie.isStreamOnly) {
        throw new ForbiddenError(
          "This title is stream-only and cannot be saved for offline viewing.",
        );
      }

      // Check user plan — free users cannot save for offline
      const user = await app.prisma.user.findUnique({
        where: { id: userId },
        select: { isPremium: true },
      });

      if (!user?.isPremium) {
        throw new ForbiddenError(
          "Offline viewing requires a premium subscription.",
        );
      }

      const saved = await app.prisma.offlineSavedContent.upsert({
        where: { userId_movieId_quality: { userId, movieId, quality } },
        update: { fileSizeBytes: fileSizeBytes ?? null, savedAt: new Date() },
        create: {
          userId,
          movieId,
          quality,
          fileSizeBytes: fileSizeBytes ?? null,
        },
        select: { id: true, quality: true, fileSizeBytes: true, savedAt: true },
      });

      getPushService(app.prisma)
        .sendDownloadComplete(
          userId,
          "movie",
          movie.title,
          `/movies/${movie.slug}`,
          movie.thumbnailUrl ?? undefined,
        )
        .catch(console.error);

      return reply.send({ status: "success", data: saved });
    },
  });

  // DELETE /api/v1/profile/offline — Remove an offline-saved movie record
  app.delete("/offline", {
    preHandler: [app.authenticate],
    schema: { body: RemoveOfflineSchema },
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const { movieId, quality } = request.body as z.infer<
        typeof RemoveOfflineSchema
      >;

      await app.prisma.offlineSavedContent.deleteMany({
        where: { userId, movieId, quality },
      });

      return reply.send({
        status: "success",
        message: "Removed from offline saves",
      });
    },
  });

  // POST /api/v1/profile/offline/failure — Report a failed offline download
  app.post("/offline/failure", {
    preHandler: [app.authenticate],
    schema: { body: OfflineFailureSchema },
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const { movieId, reason } = request.body as z.infer<
        typeof OfflineFailureSchema
      >;

      const movie = await app.prisma.movie.findUnique({
        where: { id: movieId },
        select: { id: true, title: true, slug: true },
      });

      if (movie) {
        getPushService(app.prisma)
          .sendDownloadFailed(
            userId,
            "movie",
            movie.title,
            reason,
            `/movies/${movie.slug}`,
          )
          .catch(console.error);
      }

      return reply.send({ status: "success" });
    },
  });

  // GET /api/v1/profile/offline — List all offline-saved content for the user
  app.get("/offline", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const userId = request.user.userId;

      const saved = await app.prisma.offlineSavedContent.findMany({
        where: { userId },
        include: {
          movie: {
            select: {
              id: true,
              title: true,
              slug: true,
              thumbnailUrl: true,
              posterUrl: true,
              durationMinutes: true,
              quality: true,
            },
          },
        },
        orderBy: { savedAt: "desc" },
      });

      return reply.send({ status: "success", data: saved });
    },
  });
};
