import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';

// Validation schemas
const WatchProgressSchema = z.object({
  movieId: z.string().uuid(),
  progress: z.number().int().min(0).default(0),
  duration: z.number().int().min(0).default(0)
});

export const watchRoutes = async (
  app: FastifyInstance,
  opts: FastifyPluginOptions
) => {
  
  // POST /api/watch/progress - Save watch progress
  app.post('/progress', {
    preHandler: [app.authenticate],
    schema: {
      body: WatchProgressSchema
    },
    handler: async (request, reply) => {
      try {
        const { movieId, progress, duration } = request.body as z.infer<typeof WatchProgressSchema>;
        const userId = (request.user as any).userId;

        await app.prisma.watchHistory.upsert({
          where: { 
            userId_movieId: { userId, movieId } 
          },
          update: { 
            progress, 
            duration, 
            updatedAt: new Date() 
          },
          create: { 
            userId, 
            movieId, 
            progress, 
            duration 
          }
        });

        return reply.send({
          status: 'success',
          message: 'Progress saved successfully'
        });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to save progress'
        });
      }
    }
  });

  // GET /api/watch/progress/:movieId - Get watch progress for a specific movie
  app.get('/progress/:movieId', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        const { movieId } = request.params as { movieId: string };
        const userId = (request.user as any).userId;

        const watchHistory = await app.prisma.watchHistory.findUnique({
          where: { 
            userId_movieId: { userId, movieId } 
          }
        });

        if (!watchHistory) {
          return reply.send({
            status: 'success',
            data: { progress: 0, duration: 0, progressPercentage: 0 }
          });
        }

        const progressPercentage = watchHistory.duration > 0 
          ? Math.round((watchHistory.progress / watchHistory.duration) * 100) 
          : 0;

        return reply.send({
          status: 'success',
          data: {
            ...watchHistory,
            progressPercentage
          }
        });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to fetch progress'
        });
      }
    }
  });

  // GET /api/watch/history - Get user's watch history
  app.get('/history', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        const userId = (request.user as any).userId;

        const watchHistory = await app.prisma.watchHistory.findMany({
          where: { userId },
          include: { movie: true },
          orderBy: { updatedAt: 'desc' },
          take: 20
        });

        return reply.send({
          status: 'success',
          data: watchHistory
        });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to fetch watch history'
        });
      }
    }
  });
};
