import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { emailService } from "../../shared/services/email.service";

const NotificationSchema = z.object({
  movieId: z.string().uuid(),
});

export const notificationRoutes = async (app: FastifyInstance) => {
  // POST /api/movies/notifications - Subscribe to movie notifications
  app.post("/notifications", {
    preHandler: [app.authenticate],
    schema: { body: NotificationSchema },
    handler: async (request, reply) => {
      try {
        const userId = request.user.userId;
        const { movieId } = request.body as z.infer<typeof NotificationSchema>;

        // Check if movie exists
        const movie = await app.prisma.movie.findUnique({
          where: { id: movieId },
          select: { id: true, title: true, slug: true },
        });

        if (!movie) {
          return reply.status(404).send({
            status: "error",
            message: "Movie not found",
          });
        }

        // Create or update notification subscription
        const notification = await app.prisma.movieNotification.upsert({
          where: {
            userId_movieId: { userId, movieId },
          },
          update: { sent: false },
          create: {
            userId,
            movieId,
            sent: false,
          },
        });

        return reply.send({
          status: "success",
          data: notification,
          message: "Subscribed to notifications for this movie",
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message: error instanceof Error ? error.message : "Failed to subscribe",
        });
      }
    },
  });

  // DELETE /api/movies/notifications/:movieId - Unsubscribe from movie notifications
  app.delete("/notifications/:movieId", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        const userId = request.user.userId;
        const { movieId } = request.params as { movieId: string };

        await app.prisma.movieNotification.deleteMany({
          where: { userId, movieId },
        });

        return reply.send({
          status: "success",
          message: "Unsubscribed from notifications",
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message: error instanceof Error ? error.message : "Failed to unsubscribe",
        });
      }
    },
  });

  // GET /api/movies/notifications/check/:movieId - Check if user is subscribed
  app.get("/notifications/check/:movieId", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        const userId = request.user.userId;
        const { movieId } = request.params as { movieId: string };

        const notification = await app.prisma.movieNotification.findUnique({
          where: { userId_movieId: { userId, movieId } },
        });

        return reply.send({
          status: "success",
          data: { subscribed: !!notification },
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message: error instanceof Error ? error.message : "Failed to check subscription",
        });
      }
    },
  });

  // GET /api/movies/notifications - Get user's notification subscriptions
  app.get("/notifications", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        const userId = request.user.userId;

        const notifications = await app.prisma.movieNotification.findMany({
          where: { userId },
          include: {
            movie: {
              select: {
                id: true,
                title: true,
                slug: true,
                thumbnailUrl: true,
                status: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        });

        return reply.send({
          status: "success",
          data: notifications,
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message: error instanceof Error ? error.message : "Failed to fetch notifications",
        });
      }
    },
  });
};
