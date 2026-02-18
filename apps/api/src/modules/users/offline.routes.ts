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

import { FastifyInstance } from 'fastify';
import { z } from 'zod';

const SaveOfflineSchema = z.object({
  movieId: z.string().uuid(),
  quality: z.enum(['480p', '720p', '1080p', '4K']),
  fileSizeBytes: z.number().int().positive().optional(),
});

const RemoveOfflineSchema = z.object({
  movieId: z.string().uuid(),
  quality: z.enum(['480p', '720p', '1080p', '4K']),
});

export const offlineRoutes = async (app: FastifyInstance) => {
  // POST /api/v1/profile/offline — Record that a movie was saved for offline
  app.post('/offline', {
    preHandler: [app.authenticate],
    schema: { body: SaveOfflineSchema },
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const { movieId, quality, fileSizeBytes } = request.body as z.infer<typeof SaveOfflineSchema>;

      // Check the movie exists
      const movie = await app.prisma.movie.findUnique({
        where: { id: movieId },
        select: { id: true, title: true, isStreamOnly: true },
      });

      if (!movie) return reply.status(404).send({ status: 'error', message: 'Movie not found' });

      if (movie.isStreamOnly) {
        return reply.status(403).send({
          status: 'error',
          message: 'This title is stream-only and cannot be saved for offline viewing.',
        });
      }

      // Check user plan — free users cannot save for offline
      const user = await app.prisma.user.findUnique({
        where: { id: userId },
        select: { isPremium: true },
      });

      if (!user?.isPremium) {
        return reply.status(403).send({
          status: 'error',
          message: 'Offline viewing requires a premium subscription.',
        });
      }

      const saved = await app.prisma.offlineSavedContent.upsert({
        where: { userId_movieId_quality: { userId, movieId, quality } },
        update: { fileSizeBytes: fileSizeBytes ?? null, savedAt: new Date() },
        create: { userId, movieId, quality, fileSizeBytes: fileSizeBytes ?? null },
        select: { id: true, quality: true, fileSizeBytes: true, savedAt: true },
      });

      return reply.send({ status: 'success', data: saved });
    },
  });

  // DELETE /api/v1/profile/offline — Remove an offline-saved movie record
  app.delete('/offline', {
    preHandler: [app.authenticate],
    schema: { body: RemoveOfflineSchema },
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const { movieId, quality } = request.body as z.infer<typeof RemoveOfflineSchema>;

      await app.prisma.offlineSavedContent.deleteMany({
        where: { userId, movieId, quality },
      });

      return reply.send({ status: 'success', message: 'Removed from offline saves' });
    },
  });

  // GET /api/v1/profile/offline — List all offline-saved content for the user
  app.get('/offline', {
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
        orderBy: { savedAt: 'desc' },
      });

      return reply.send({ status: 'success', data: saved });
    },
  });
};
