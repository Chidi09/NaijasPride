import { FastifyInstance, FastifyPluginOptions } from "fastify";
import {
  SubtitleService,
  downloadAndConvertSubtitle,
  SubtitleResult,
} from "./subtitles.service";
import { z } from "zod";
import { NotFoundError } from "../../shared/errors/app-error";

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
  opts: FastifyPluginOptions,
) => {
  const subtitleService = new SubtitleService();

  // GET /api/movies/:id/subtitles - Search subtitles by movie IMDB ID
  app.get("/:id/subtitles", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const { language } = request.query as { language?: string };
      const movie = await app.prisma.movie.findUnique({
        where: { id },
        select: { imdbId: true, title: true, year: true },
      });
      if (!movie) {
        throw new NotFoundError("Movie not found");
      }
      let subtitles: SubtitleResult[] = [];
      if (movie.imdbId) {
        subtitles = await subtitleService.search(
          movie.imdbId,
          language || "en",
        );
      }
      if (subtitles.length === 0 && movie.title) {
        subtitles = await subtitleService.searchByTitle(
          movie.title,
          movie.year || undefined,
          language || "en",
        );
      }
      const subtitlesWithUrl = subtitles.map((sub) => ({
        ...sub,
        url: `/api/v1/movies/subtitles/${sub.url}/download`,
        name: sub.filename,
      }));
      return reply.send({
        status: "success",
        data: subtitlesWithUrl,
        meta: {
          movieId: id,
          imdbId: movie.imdbId,
          title: movie.title,
          found: subtitles.length,
        },
      });
    },
  });

  // POST /api/movies/subtitles/download - Get download link
  app.post("/subtitles/download", {
    preHandler: [app.authenticate],
    schema: {
      body: DownloadSchema,
    },
    handler: async (request, reply) => {
      const { fileId } = request.body as z.infer<typeof DownloadSchema>;
      const result = await subtitleService.getDownloadLink(fileId);
      if (!result) {
        throw new NotFoundError("Download link not available");
      }
      return reply.send({
        status: "success",
        data: result,
      });
    },
  });

  // GET /api/movies/subtitles/:fileId - Download and convert subtitle to VTT
  app.get("/subtitles/:fileId/download", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { fileId } = request.params as { fileId: string };
      const downloadResult = await subtitleService.getDownloadLink(fileId);
      if (!downloadResult) {
        throw new NotFoundError("Download link not available");
      }
      const { content, isVtt } = await downloadAndConvertSubtitle(
        downloadResult.link,
        downloadResult.fileName,
      );
      reply.header("Content-Type", "text/vtt");
      reply.header("Content-Disposition", `inline; filename="subtitle.vtt"`);
      return reply.send(content);
    },
  });

  // POST /api/movies/:id/notify - Register for "Notify me when available"
  app.post("/:id/notify", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { id: movieId } = request.params as { id: string };
      const userId = request.user.userId;
      const movie = await app.prisma.movie.findUnique({
        where: { id: movieId },
      });
      if (!movie) {
        throw new NotFoundError("Movie not found");
      }
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
    },
  });
};
