import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { SubtitleService } from "./subtitles.service";
import { z } from "zod";

const SearchSchema = z.object({
  imdbId: z.string().optional(),
  title: z.string().optional(),
  year: z.number().optional(),
  language: z.string().default("en"),
});

const DownloadSchema = z.object({
  fileId: z.string(),
});

export const subtitleRoutes = async (
  app: FastifyInstance,
  opts: FastifyPluginOptions
) => {
  const subtitleService = new SubtitleService();

  // GET /api/movies/:id/subtitles - Search subtitles by movie IMDB ID
  app.get("/:id/subtitles", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const { language } = request.query as { language?: string };

        // Get movie details to find IMDB ID
        const movie = await app.prisma.movie.findUnique({
          where: { id },
          select: { imdbId: true, title: true, year: true },
        });

        if (!movie) {
          return reply.status(404).send({
            status: "error",
            message: "Movie not found",
          });
        }

        let subtitles: any[] = [];

        // Search by IMDB ID if available
        if (movie.imdbId) {
          subtitles = await subtitleService.search(movie.imdbId, language || "en");
        }

        // Fallback to title search if no IMDB ID or no results
        if (subtitles.length === 0 && movie.title) {
          subtitles = await subtitleService.searchByTitle(
            movie.title,
            movie.year || undefined,
            language || "en"
          );
        }

        return reply.send({
          status: "success",
          data: subtitles,
          meta: {
            movieId: id,
            imdbId: movie.imdbId,
            title: movie.title,
            found: subtitles.length,
          },
        });
      } catch (error) {
        console.error("Subtitle search error:", error);
        return reply.status(500).send({
          status: "error",
          message: "Failed to search subtitles",
        });
      }
    },
  });

  // POST /api/movies/subtitles/download - Get download link
  app.post("/subtitles/download", {
    preHandler: [app.authenticate],
    schema: {
      body: DownloadSchema,
    },
    handler: async (request, reply) => {
      try {
        const { fileId } = request.body as z.infer<typeof DownloadSchema>;

        const result = await subtitleService.getDownloadLink(fileId);

        if (!result) {
          return reply.status(404).send({
            status: "error",
            message: "Download link not available",
          });
        }

        return reply.send({
          status: "success",
          data: result,
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message: "Failed to get download link",
        });
      }
    },
  });

  // POST /api/movies/:id/notify - Register for "Notify me when available"
  app.post("/:id/notify", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        const { id: movieId } = request.params as { id: string };
        const userId = (request.user as any).userId;

        // Check if movie exists
        const movie = await app.prisma.movie.findUnique({
          where: { id: movieId },
        });

        if (!movie) {
          return reply.status(404).send({
            status: "error",
            message: "Movie not found",
          });
        }

        // Create notification request
        const notification = await app.prisma.movieNotification.upsert({
          where: {
            userId_movieId: { userId, movieId },
          },
          update: {
            sent: false,
          },
          create: {
            userId,
            movieId,
            sent: false,
          },
        });

        return reply.send({
          status: "success",
          data: notification,
          message: "You will be notified when this movie is available in HD",
        });
      } catch (error: any) {
        if (error.code === "P2002") {
          return reply.status(409).send({
            status: "error",
            message: "Already subscribed to notifications for this movie",
          });
        }
        return reply.status(500).send({
          status: "error",
          message: "Failed to register notification",
        });
      }
    },
  });
};
