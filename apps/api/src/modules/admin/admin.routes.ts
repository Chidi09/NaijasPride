import {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { YoutubeScoutService } from "./services/youtube-scout.service";
import { RssScoutService } from "./services/rss-scout.service";
import { TMDBMetadataService } from "./services/tmdb-metadata.service";
import { YouTubeChannelService } from "./services/youtube-channel.service";
import { AutoLibraryDiscoveryService } from "../books/auto-library-discovery.service";
import { adminQueueRoutes } from "./admin-queue.routes";
import { adminUserRoutes } from "./admin-user.routes";
import { z } from "zod";
import { Genre as PrismaGenre } from "@prisma/client";

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

const ChannelImportYoutubeSchema = z.object({
  channels: z.array(z.string().min(1)).min(1).max(20),
  maxResultsPerChannel: z.number().int().min(1).max(50).optional().default(8),
  genre: z.array(z.string()).optional().default(["Nollywood"]),
  isStreamOnly: z.boolean().optional().default(true),
  dryRun: z.boolean().optional().default(false),
});

const PRISMA_GENRE_SET = new Set(Object.values(PrismaGenre));

const normalizeGenres = (rawGenres: string[] | undefined): PrismaGenre[] => {
  const normalized = (rawGenres || ['Nollywood'])
    .map((entry) => entry.trim())
    .filter((entry): entry is PrismaGenre => PRISMA_GENRE_SET.has(entry as PrismaGenre));

  return normalized.length > 0 ? normalized : [PrismaGenre.Nollywood];
};

const CreateRssFeedSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.string().url(),
});

const AutoLibraryDiscoverSchema = z.object({
  includeMustHaves: z.boolean().optional().default(true),
  includeTrending: z.boolean().optional().default(true),
  maxTargets: z.number().int().min(1).max(60).optional().default(24),
  maxMatches: z.number().int().min(1).max(25).optional().default(8),
  minSeeders: z.number().int().min(0).max(5000).optional().default(5),
  ingest: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(true),
});

export const adminRoutes = async (
  app: FastifyInstance,
  _opts: unknown,
) => {
  const ytService = new YoutubeScoutService(app.prisma);
  const rssService = new RssScoutService();
  const tmdbService = new TMDBMetadataService(app.prisma);
  const autoLibraryService = new AutoLibraryDiscoveryService(app.prisma);
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

        // Enrich with TMDB metadata in background (don't wait for it)
        tmdbService.enrichMovieFromTMDB(movie.id, data.title, data.year).catch(err => {
          console.error(`[TMDB] Failed to enrich ${data.title}:`, err);
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

            const movie = await app.prisma.movie.create({
              data: {
                title: data.title,
                slug,
                description: data.description || null,
                year: data.year,
                genre: normalizeGenres(data.genre),
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

            // Enrich with TMDB metadata in background
            tmdbService.enrichMovieFromTMDB(movie.id, data.title, data.year).catch(err => {
              console.error(`[TMDB] Failed to enrich ${data.title}:`, err);
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
              const movie = await app.prisma.movie.create({
                data: {
                  title,
                  slug,
                  description: best.description || null,
                  year,
                  genre: normalizeGenres(genre),
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

              // Enrich with TMDB metadata in background
              tmdbService.enrichMovieFromTMDB(movie.id, title, year).catch(err => {
                console.error(`[TMDB] Failed to enrich ${title}:`, err);
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

  // POST /api/admin/import/youtube/channels - Import latest long-form videos from selected channels
  app.post("/import/youtube/channels", {
    preHandler: [app.authenticate, requireAdmin],
    schema: {
      body: ChannelImportYoutubeSchema,
    },
    handler: async (request, reply) => {
      try {
        const {
          channels,
          maxResultsPerChannel = 8,
          genre = ["Nollywood"],
          isStreamOnly = true,
          dryRun = false,
        } = request.body as z.infer<typeof ChannelImportYoutubeSchema>;

        const discovered = await ytService.searchByChannels(
          channels,
          maxResultsPerChannel,
        );

        const imported: string[] = [];
        const skipped: string[] = [];
        const unresolvedChannels = discovered
          .filter((entry) => !entry.channelId)
          .map((entry) => entry.requestedName);
        const failed: { title: string; error: string }[] = [];

        // Save channels to database
        for (const entry of discovered) {
          if (entry.channelId) {
            try {
              await channelService.registerDiscoveredChannel(
                entry.channelId,
                entry.channelTitle,
                entry.requestedName,
              );
            } catch {
              // Channel might already exist, that's fine
            }
          }
        }

        for (const entry of discovered) {
          for (const video of entry.videos) {
            try {
              const year =
                new Date(video.publishedAt).getFullYear() || new Date().getFullYear();
              const slug = `${video.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${year}`;

              const existing = await app.prisma.movie.findFirst({
                where: { OR: [{ slug }, { youtubeId: video.youtubeId }] },
                select: { id: true },
              });

              if (existing) {
                skipped.push(video.title);
                continue;
              }

              if (!dryRun) {
                const movie = await app.prisma.movie.create({
                  data: {
                    title: video.title,
                    slug,
                    description: video.description || null,
                    year,
                    genre: normalizeGenres(genre),
                    quality: [],
                    language: "English",
                    thumbnailUrl: video.thumbnail || null,
                    youtubeId: video.youtubeId,
                    isStreamOnly,
                    fileUrls: {},
                    fileSizes: {},
                    status: "active",
                  },
                });

                // Enrich with TMDB metadata in background
                tmdbService.enrichMovieFromTMDB(movie.id, video.title, year).catch(err => {
                  console.error(`[TMDB] Failed to enrich ${video.title}:`, err);
                });
              }

              imported.push(video.title);
            } catch (err) {
              failed.push({
                title: video.title,
                error: err instanceof Error ? err.message : "Unknown error",
              });
            }
          }
        }

        return reply.send({
          status: "success",
          data: {
            imported,
            skipped,
            failed,
            unresolvedChannels,
            discovered: discovered.map((entry) => ({
              requestedName: entry.requestedName,
              channelId: entry.channelId,
              channelTitle: entry.channelTitle,
              videoCount: entry.videos.length,
            })),
            dryRun,
          },
          message: dryRun
            ? `Dry run complete: ${imported.length} importable, ${skipped.length} skipped, ${failed.length} failed`
            : `Imported ${imported.length}, skipped ${skipped.length}, failed ${failed.length}`,
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to import from YouTube channels",
        });
      }
    },
  });

  // GET /api/admin/books/auto-library/must-haves - Preview must-have seed list
  app.get("/books/auto-library/must-haves", {
    preHandler: [app.authenticate, requireAdmin],
    handler: async (_request, reply) => {
      try {
        const mustHaves = await autoLibraryService.loadMustHaves();
        return reply.send({
          status: "success",
          data: mustHaves,
          meta: { total: mustHaves.length },
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to load Auto-Library must-have list",
        });
      }
    },
  });

  // POST /api/admin/books/auto-library/discover - Search 1337x for must-haves/trending books
  app.post("/books/auto-library/discover", {
    preHandler: [app.authenticate, requireAdmin],
    schema: {
      body: AutoLibraryDiscoverSchema,
    },
    handler: async (request, reply) => {
      try {
        const body = request.body as z.infer<typeof AutoLibraryDiscoverSchema>;
        const summary = await autoLibraryService.discoverAndSync(body);

        return reply.send({
          status: "success",
          data: summary,
          message: body.ingest
            ? "Auto-Library discovery completed and pending records updated"
            : "Auto-Library discovery completed",
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Auto-Library discovery failed",
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

  // ===== YouTube Channel Management Routes =====
  const channelService = new YouTubeChannelService(app.prisma);

  // GET /api/admin/youtube/channels - List all configured channels
  app.get("/youtube/channels", {
    preHandler: [app.authenticate, requireAdmin],
    handler: async (_request, reply) => {
      try {
        const channels = await channelService.listChannels();
        return reply.send({
          status: "success",
          data: channels,
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to fetch channels",
        });
      }
    },
  });

  // POST /api/admin/youtube/channels - Add a new channel
  app.post("/youtube/channels", {
    preHandler: [app.authenticate, requireAdmin],
    schema: {
      body: z.object({
        url: z.string().url(),
      }),
    },
    handler: async (request, reply) => {
      try {
        const { url } = request.body as { url: string };
        const channel = await channelService.addChannel(url);
        return reply.send({
          status: "success",
          data: channel,
          message: "Channel added successfully",
        });
      } catch (error) {
        return reply.status(400).send({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to add channel",
        });
      }
    },
  });

  // POST /api/admin/youtube/channels/backfill - Start background backfill job (returns jobId immediately)
  app.post("/youtube/channels/backfill", {
    preHandler: [app.authenticate, requireAdmin],
    handler: async (_request, reply) => {
      try {
        const jobId = channelService.startBackfill();
        return reply.send({
          status: "success",
          data: { jobId },
          message: "Backfill started in background",
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to start backfill",
        });
      }
    },
  });

  // GET /api/admin/youtube/channels/backfill/:jobId - Poll backfill progress
  app.get("/youtube/channels/backfill/:jobId", {
    preHandler: [app.authenticate, requireAdmin],
    handler: async (request, reply) => {
      try {
        const { jobId } = request.params as { jobId: string };
        const progress = channelService.getBackfillProgress(jobId);
        if (!progress) {
          return reply.status(404).send({ status: "error", message: "Job not found" });
        }
        return reply.send({ status: "success", data: progress });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message: error instanceof Error ? error.message : "Failed to get progress",
        });
      }
    },
  });

  // DELETE /api/admin/youtube/channels/:id - Remove a channel
  app.delete("/youtube/channels/:id", {
    preHandler: [app.authenticate, requireAdmin],
    handler: async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        await channelService.deleteChannel(id);
        return reply.send({
          status: "success",
          message: "Channel removed successfully",
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to remove channel",
        });
      }
    },
  });

  // GET /api/admin/youtube/channels/:channelId/videos - Get all videos from channel
  app.get("/youtube/channels/:channelId/videos", {
    preHandler: [app.authenticate, requireAdmin],
    schema: {
      querystring: z.object({
        pageToken: z.string().optional(),
        maxResults: z.coerce.number().int().min(1).max(50).optional().default(50),
      }),
    },
    handler: async (request, reply) => {
      try {
        const { channelId } = request.params as { channelId: string };
        const { pageToken, maxResults } = request.query as { pageToken?: string; maxResults: number };
        
        const result = await channelService.getChannelVideos(channelId, pageToken, maxResults);
        return reply.send({
          status: "success",
          data: result,
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to fetch channel videos",
        });
      }
    },
  });

  // POST /api/admin/youtube/channels/:channelId/import-remaining - Batch import remaining videos
  app.post("/youtube/channels/:channelId/import-remaining", {
    preHandler: [app.authenticate, requireAdmin],
    schema: {
      body: z.object({
        batchSize: z.number().int().min(1).max(20).optional().default(10),
      }),
    },
    handler: async (request, reply) => {
      try {
        const { channelId } = request.params as { channelId: string };
        const { batchSize } = request.body as { batchSize?: number };
        
        const progressId = await channelService.startBatchImport(channelId, batchSize);
        return reply.send({
          status: "success",
          data: { progressId },
          message: "Batch import started",
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to start batch import",
        });
      }
    },
  });

  // GET /api/admin/youtube/import-progress/:progressId - Get import progress
  app.get("/youtube/import-progress/:progressId", {
    preHandler: [app.authenticate, requireAdmin],
    handler: async (request, reply) => {
      try {
        const { progressId } = request.params as { progressId: string };
        const progress = channelService.getImportProgress(progressId);
        
        if (!progress) {
          return reply.status(404).send({
            status: "error",
            message: "Import progress not found",
          });
        }
        
        return reply.send({
          status: "success",
          data: progress,
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to fetch import progress",
        });
      }
    },
  });

  // POST /api/admin/movies/backfill-slugs - Generate slugs for movies without them
  app.post("/movies/backfill-slugs", {
    preHandler: [app.authenticate, requireAdmin],
    handler: async (_request, reply) => {
      try {
        const { MoviesService } = await import("../movies/movies.service");
        const moviesService = new MoviesService(app.prisma);
        const result = await moviesService.backfillSlugs();
        return reply.send({
          status: "success",
          data: result,
          message: `Backfilled ${result.updated} of ${result.total} movies`,
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to backfill slugs",
        });
      }
    },
  });

  // Register queue management routes
  await app.register(adminQueueRoutes, { prefix: '' });

  // Register user management routes
  await app.register(adminUserRoutes, { prefix: '' });
};
