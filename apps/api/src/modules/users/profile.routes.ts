import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { ProfileService } from './profile.service';
import { z } from 'zod';

// Validation schemas
const WatchlistSchema = z.object({
  movieId: z.string().uuid()
});

export const profileRoutes = async (
  app: FastifyInstance,
  opts: FastifyPluginOptions
) => {
  const profileService = new ProfileService(app.prisma);

  // GET /api/profile - Get user profile with watchlist and history
  app.get('/', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        const userId = (request.user as any).userId;
        const profile = await profileService.getProfile(userId);
        
        return reply.send({
          status: 'success',
          data: profile
        });
      } catch (error) {
        return reply.status(400).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to fetch profile'
        });
      }
    }
  });

  // POST /api/profile/watchlist - Toggle movie in watchlist
  app.post('/watchlist', {
    preHandler: [app.authenticate],
    schema: {
      body: WatchlistSchema
    },
    handler: async (request, reply) => {
      try {
        const userId = (request.user as any).userId;
        const { movieId } = request.body as z.infer<typeof WatchlistSchema>;
        
        const result = await profileService.toggleWatchlist(userId, movieId);
        
        return reply.send({
          status: 'success',
          data: result,
          message: result.added ? 'Added to watchlist' : 'Removed from watchlist'
        });
      } catch (error) {
        return reply.status(400).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to update watchlist'
        });
      }
    }
  });
};
