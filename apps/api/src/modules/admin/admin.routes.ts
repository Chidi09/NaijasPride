import {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { YoutubeScoutService } from "./services/youtube-scout.service";
import { RssScoutService } from "./services/rss-scout.service";
import { z } from "zod";

// Validation schemas
const RssUrlSchema = z.object({
  url: z.string().url(),
});

const ImportYoutubeSchema = z.object({
  title: z.string().min(1),
  youtubeId: z.string().min(1),
  description: z.string().optional(),
  year: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear() + 2),
  thumbnailUrl: z.string().url().optional(),
  genre: z.array(z.string()).default(["Nollywood"]),
  isStreamOnly: z.boolean().default(true),
});

const SearchTitlesSchema = z.object({
  titles: z.array(z.string().min(1)).min(1).max(20),
  suffix: z.string().optional(),
});

const BatchImportSchema = z.object({
  items: z.array(ImportYoutubeSchema).min(1).max(50),
});

const AutoImportYoutubeSchema = z.object({
  titles: z.array(z.string().min(1)).min(1).max(50),
  suffix: z.string().optional().default("Full Movie"),
  genre: z.array(z.string()).optional().default(["Nollywood"]),
  isStreamOnly: z.boolean().optional().default(true),
  dryRun: z.boolean().optional().default(false),
});

const CreateRssFeedSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.string().url(),
});

export const adminRoutes = async (
  app: FastifyInstance,
  _opts: unknown,
) => {
  const ytService = new YoutubeScoutService(app.prisma);
  const rssService = new RssScoutService();
  const parsePositiveInt = (value?: string) => {
    if (!value) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };
  const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user.role !== "ADMIN") {
      return reply.status(403).send({
        status: "error",
        message: "Forbidden: Admin access required",
      });
    }
  };

  // GET /api/admin/discovery/youtube - Scan YouTube for Nollywood movies
  app.get("/discovery/youtube", {
    preHandler: [app.authenticate, requireAdmin],
    handler: async (request, reply) => {
      try {
        const results = await ytService.scanForMovies();

        return reply.send({
          status: "success",
          data: results,
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error ? error.message : "Failed to scan YouTube",
        });
      }
    },
  });

  // POST /api/admin/discovery/rss - Parse an RSS feed
  app.post("/discovery/rss", {
    preHandler: [app.authenticate, requireAdmin],
    schema: {
      body: RssUrlSchema,
    },
    handler: async (request, reply) => {
      try {
        const { url } = request.body as z.infer<typeof RssUrlSchema>;
        const results = await rssService.fetchFeed(url);

        return reply.send({
          status: "success",
          data: results,
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error ? error.message : "Failed to parse RSS feed",
        });
      }
    },
  });

  // POST /api/admin/import/youtube - Import a YouTube video as a movie
  app.post("/import/youtube", {
    preHandler: [app.authenticate, requireAdmin],
    schema: {
      body: ImportYoutubeSchema,
    },
    handler: async (request, reply) => {
      try {
        const data = request.body as z.infer<typeof ImportYoutubeSchema>;

        // Generate slug from title
        const slug = `${data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${data.year}`;

        // Create movie in database
        const movie = await app.prisma.movie.create({
          data: {
            title: data.title,
            slug: slug,
            description: data.description || null,
            year: data.year,
            genre: ["Nollywood"],
            quality: [], // No downloads for stream-only
            language: "English",
            thumbnailUrl: data.thumbnailUrl || null,
            youtubeId: data.youtubeId,
            isStreamOnly: data.isStreamOnly,
            fileUrls: {},
            fileSizes: {},
            status: "active",
          },
        });

        return reply.send({
          status: "success",
          data: movie,
          message: `Successfully imported "${data.title}"`,
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error ? error.message : "Failed to import movie",
        });
      }
    },
  });

  // POST /api/admin/discovery/youtube/search - Search YouTube by movie titles
  app.post("/discovery/youtube/search", {
    preHandler: [app.authenticate, requireAdmin],
    schema: {
      body: SearchTitlesSchema,
    },
    handler: async (request, reply) => {
      try {
        const { titles, suffix } = request.body as z.infer<typeof SearchTitlesSchema>;
        const results = await ytService.searchByTitles(titles, suffix || "Full Movie");

        return reply.send({
          status: "success",
          data: results,
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error ? error.message : "Failed to search YouTube",
        });
      }
    },
  });

  // POST /api/admin/import/youtube/batch - Import multiple YouTube videos at once
  app.post("/import/youtube/batch", {
    preHandler: [app.authenticate, requireAdmin],
    schema: {
      body: BatchImportSchema,
    },
    handler: async (request, reply) => {
      try {
        const { items } = request.body as z.infer<typeof BatchImportSchema>;
        const imported: string[] = [];
        const skipped: string[] = [];
        const failed: { title: string; error: string }[] = [];

        for (const data of items) {
          try {
            const slug = `${data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${data.year}`;

            // Check if slug or youtubeId already exists
            const existing = await app.prisma.movie.findFirst({
              where: { OR: [{ slug }, { youtubeId: data.youtubeId }] },
              select: { id: true },
            });

            if (existing) {
              skipped.push(data.title);
              continue;
            }

            await app.prisma.movie.create({
              data: {
                title: data.title,
                slug,
                description: data.description || null,
                year: data.year,
                genre: (data.genre || ["Nollywood"]) as any,
                quality: [],
                language: "English",
                thumbnailUrl: data.thumbnailUrl || null,
                youtubeId: data.youtubeId,
                isStreamOnly: data.isStreamOnly ?? true,
                fileUrls: {},
                fileSizes: {},
                status: "active",
              },
            });

            imported.push(data.title);
          } catch (err) {
            failed.push({
              title: data.title,
              error: err instanceof Error ? err.message : "Unknown error",
            });
          }
        }

        return reply.send({
          status: "success",
          data: { imported, skipped, failed },
          message: `Imported ${imported.length}, skipped ${skipped.length}, failed ${failed.length}`,
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error ? error.message : "Failed to batch import",
        });
      }
    },
  });

  // POST /api/admin/import/youtube/auto - Search titles and import best YouTube matches
  app.post("/import/youtube/auto", {
    preHandler: [app.authenticate, requireAdmin],
    schema: {
      body: AutoImportYoutubeSchema,
    },
    handler: async (request, reply) => {
      try {
        const {
          titles,
          suffix = "Full Movie",
          genre = ["Nollywood"],
          isStreamOnly = true,
          dryRun = false,
        } = request.body as z.infer<typeof AutoImportYoutubeSchema>;

        const imported: string[] = [];
        const skipped: string[] = [];
        const notFound: string[] = [];
        const failed: { title: string; error: string }[] = [];
        const selected: Array<{ searchTitle: string; youtubeId: string; matchedTitle: string }> = [];

        for (const title of titles) {
          try {
            const candidates = await ytService.searchByTitle(title, suffix);
            if (!candidates.length) {
              notFound.push(title);
              continue;
            }

            // default strategy: first result
            const best = candidates[0];
            const year = new Date(best.publishedAt).getFullYear() || new Date().getFullYear();
            const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${year}`;

            const existing = await app.prisma.movie.findFirst({
              where: { OR: [{ slug }, { youtubeId: best.youtubeId }] },
              select: { id: true },
            });

            selected.push({
              searchTitle: title,
              youtubeId: best.youtubeId,
              matchedTitle: best.title,
            });

            if (existing) {
              skipped.push(title);
              continue;
            }

            if (!dryRun) {
              await app.prisma.movie.create({
                data: {
                  title,
                  slug,
                  description: best.description || null,
                  year,
                  genre: genre as any,
                  quality: [],
                  language: "English",
                  thumbnailUrl: best.thumbnail || null,
                  youtubeId: best.youtubeId,
                  isStreamOnly,
                  fileUrls: {},
                  fileSizes: {},
                  status: "active",
                },
              });
            }

            imported.push(title);
          } catch (err) {
            failed.push({
              title,
              error: err instanceof Error ? err.message : "Unknown error",
            });
          }
        }

        return reply.send({
          status: "success",
          data: {
            imported,
            skipped,
            notFound,
            failed,
            selected,
            dryRun,
          },
          message: dryRun
            ? `Dry run complete: ${imported.length} importable, ${skipped.length} skipped, ${notFound.length} not found, ${failed.length} failed`
            : `Imported ${imported.length}, skipped ${skipped.length}, not found ${notFound.length}, failed ${failed.length}`,
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error ? error.message : "Failed to auto-import YouTube titles",
        });
      }
    },
  });

  // GET /api/admin/rss-feeds - Get all RSS feeds
  app.get("/rss-feeds", {
    preHandler: [app.authenticate, requireAdmin],
    handler: async (request, reply) => {
      try {
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

        const [total, feeds] = await Promise.all([
          app.prisma.rssFeed.count(),
          app.prisma.rssFeed.findMany({
            orderBy: { lastChecked: "desc" },
            skip,
            take: limitNum,
          }),
        ]);

        return reply.send({
          status: "success",
          data: feeds,
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
              : "Failed to fetch RSS feeds",
        });
      }
    },
  });

  // POST /api/admin/rss-feeds - Create a new RSS feed
  app.post("/rss-feeds", {
    preHandler: [app.authenticate, requireAdmin],
    schema: {
      body: CreateRssFeedSchema,
    },
    handler: async (request, reply) => {
      try {
        const { name, url } = request.body as z.infer<typeof CreateRssFeedSchema>;

        const feed = await app.prisma.rssFeed.create({
          data: {
            name,
            url,
            isEnabled: true,
          },
        });

        return reply.send({
          status: "success",
          data: feed,
          message: "RSS feed added successfully",
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to create RSS feed",
        });
      }
    },
  });
};
