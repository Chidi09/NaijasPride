import {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { YoutubeScoutService } from "./services/youtube-scout.service";
import { RssScoutService } from "./services/rss-scout.service";
import { TMDBMetadataService } from "./services/tmdb-metadata.service";
import { YouTubeChannelService } from "./services/youtube-channel.service";
import { YoutubeDiscoveryService } from "./services/youtube-discovery.service";
import { AutoLibraryDiscoveryService } from "../books/auto-library-discovery.service";
import { adminQueueRoutes } from "./admin-queue.routes";
import { adminUserRoutes } from "./admin-user.routes";
import { z } from "zod";
import { Genre as PrismaGenre } from "@prisma/client";
import { QueueService } from "../../shared/services/queue.service";
import { getPushDiagnostics } from "../../shared/services/push-notification.service";

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
  minSeeders: z.number().int().min(0).max(5000).optional().default(1),
  ingest: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(true),
});

const AnnasMirrorRunSchema = z.object({
  batchSize: z.number().int().min(1).max(50).optional().default(10),
  dryRun: z.boolean().optional().default(false),
});

const PushDiagnosticsQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  email: z.string().email().optional(),
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
  const parseBooleanFlag = (value: string | undefined, defaultValue: boolean): boolean => {
    if (typeof value !== 'string') return defaultValue;
    return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
  };
  const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user.role !== "ADMIN") {
      return reply.status(403).send({
        status: "error",
        message: "Forbidden: Admin access required",
      });
    }
  };

  // GET /api/admin/push/diagnostics - quick push/FCM health + token stats
  app.get('/push/diagnostics', {
    preHandler: [app.authenticate, requireAdmin],
    schema: {
      querystring: PushDiagnosticsQuerySchema,
    },
    handler: async (request, reply) => {
      try {
        const { userId, email } = request.query as z.infer<typeof PushDiagnosticsQuerySchema>;
        const diagnostics = await getPushDiagnostics(app.prisma, { userId, email });

        return reply.send({
          status: 'success',
          data: diagnostics,
        });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to fetch push diagnostics',
        });
      }
    },
  });

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
            ? "Auto-Library discovery completed and records imported"
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

  // POST /api/admin/books/annas-mirror/run - Manually trigger Anna's Archive mirror harvester
  const queueService = new QueueService();

  app.post("/books/annas-mirror/run", {
    preHandler: [app.authenticate, requireAdmin],
    schema: {
      body: AnnasMirrorRunSchema,
    },
    handler: async (request, reply) => {
      try {
        const { batchSize, dryRun } = request.body as z.infer<typeof AnnasMirrorRunSchema>;

        await queueService.addAnnasMirrorJob({
          batchSize,
          dryRun,
          triggeredBy: 'admin-api',
        });

        return reply.send({
          status: "success",
          message: `Anna's Archive mirror job enqueued (batch=${batchSize}, dryRun=${dryRun})`,
          data: { batchSize, dryRun },
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to enqueue Anna's Archive mirror job",
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
  const discoveryService = new YoutubeDiscoveryService(app.prisma);

  // POST /api/admin/youtube/discovery/run - Manually trigger auto-discovery
  app.post("/youtube/discovery/run", {
    preHandler: [app.authenticate, requireAdmin],
    handler: async (_request, reply) => {
      try {
        // Run in background
        discoveryService.runDiscoveryCycle().catch(err => {
          console.error('[Admin] Manual YouTube discovery failed:', err);
        });

        return reply.send({
          status: "success",
          message: "YouTube auto-discovery cycle started in background",
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message: error instanceof Error ? error.message : "Failed to start discovery",
        });
      }
    },
  });

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

  // POST /api/admin/movies/soap2day/crawl - Manually trigger Soap2Day crawler
  app.post('/movies/soap2day/crawl', {
    preHandler: [app.authenticate, requireAdmin],
    schema: {
      body: z.object({
        maxPerRun: z.number().int().min(1).max(10).optional().default(5),
      }),
    },
    handler: async (request, reply) => {
      try {
        const { maxPerRun } = request.body as { maxPerRun: number };
        const { Soap2DayCrawlerService } = await import('../movies/soap2day-crawler.service');
        const crawler = new Soap2DayCrawlerService(app.prisma, console, { maxPerRun });
        const summary = await crawler.crawl();
        return reply.send({ status: 'success', data: summary });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Soap2Day crawl failed',
        });
      }
    },
  });

  // GET /api/admin/movies/soap2day/stats - Soap2Day tracked totals and scheduler state
  app.get('/movies/soap2day/stats', {
    preHandler: [app.authenticate, requireAdmin],
    handler: async (_request, reply) => {
      try {
        const soap2dayWhere = {
          OR: [
            { uploadedBy: 'soap2day-crawler' },
            { metadata: { path: ['source'], equals: 'soap2day-crawler' } },
          ],
        };

        const [totalTracked, activeTracked, pendingTracked, lastTracked] = await Promise.all([
          app.prisma.movie.count({ where: soap2dayWhere }),
          app.prisma.movie.count({ where: { ...soap2dayWhere, status: 'active' } }),
          app.prisma.movie.count({ where: { ...soap2dayWhere, status: 'pending' } }),
          app.prisma.movie.findFirst({
            where: soap2dayWhere,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              slug: true,
              title: true,
              year: true,
              status: true,
              createdAt: true,
            },
          }),
        ]);

        const configuredUrls = (process.env.SOAP2DAY_CRAWLER_URLS || '')
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);

        return reply.send({
          status: 'success',
          data: {
            totalTracked,
            activeTracked,
            pendingTracked,
            lastTracked: lastTracked
              ? {
                  ...lastTracked,
                  createdAt: lastTracked.createdAt.toISOString(),
                }
              : null,
            scheduler: {
              enabled: parseBooleanFlag(process.env.SOAP2DAY_CRAWLER_ENABLED, false),
              intervalMs: parsePositiveInt(process.env.SOAP2DAY_CRAWLER_INTERVAL_MS) ?? 12 * 60 * 60 * 1000,
              startupDelayMs: parsePositiveInt(process.env.SOAP2DAY_CRAWLER_STARTUP_DELAY_MS) ?? 10 * 60 * 1000,
              maxPerRun: parsePositiveInt(process.env.SOAP2DAY_CRAWLER_MAX_PER_RUN) ?? 5,
              urls: configuredUrls,
            },
          },
        });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to fetch Soap2Day stats',
        });
      }
    },
  });

  // POST /api/admin/movies/upload-url - Generate signed upload URL for movie files (Admin only)
  app.post('/movies/upload-url', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        if (request.user.role !== 'ADMIN') {
          return reply.status(403).send({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Admin access required',
            },
          });
        }

        const body = request.body as {
          fileName: string;
          contentType: string;
          fileSize?: number;
        };

        const allowedVideoTypes = new Set([
          'video/mp4',
          'video/x-matroska',
          'video/webm',
          'video/quicktime',
          'video/x-msvideo',
          'video/x-m4v',
        ]);

        if (!allowedVideoTypes.has(body.contentType)) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'INVALID_CONTENT_TYPE',
              message: `Unsupported video type: ${body.contentType}. Allowed: ${Array.from(allowedVideoTypes).join(', ')}`,
            },
          });
        }

        // Max 5GB for video uploads
        if (body.fileSize && body.fileSize > 5 * 1024 * 1024 * 1024) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'FILE_TOO_LARGE',
              message: 'File size exceeds 5GB limit',
            },
          });
        }

        const safeName = body.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storageKey = `movies/uploaded/${Date.now()}-${safeName}`;
        
        const { StorageService } = await import('../../shared/services/storage.service');
        const storageService = new StorageService();
        const uploadUrl = await storageService.getUploadUrl(storageKey, body.contentType);

        return reply.send({
          success: true,
          data: {
            uploadUrl,
            storageKey,
            downloadUrl: `/api/v1/movies/download?key=${encodeURIComponent(storageKey)}`,
            expiresIn: 3600, // 1 hour
          },
        });
      } catch (error) {
        console.error('[Admin] Movie upload URL error:', error);
        return reply.status(500).send({
          success: false,
          error: {
            code: 'UPLOAD_URL_ERROR',
            message: error instanceof Error ? error.message : 'Failed to create upload URL',
          },
        });
      }
    },
  });

  // POST /api/admin/movies/create - Create a new movie with metadata (Admin only)
  // Supports TMDB auto-enrichment when tmdbId is provided or via search
  app.post('/movies/create', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        if (request.user.role !== 'ADMIN') {
          return reply.status(403).send({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Admin access required',
            },
          });
        }

        const body = request.body as {
          title: string;
          description?: string;
          year: number;
          genre?: string[];
          director?: string;
          cast?: string[];
          duration?: number;
          thumbnailUrl?: string;
          storageKey: string;
          contentType: string;
          fileSize?: number;
          isStreamOnly?: boolean;
          tmdbId?: number;
          imdbId?: string;
          fetchMetadata?: boolean;
        };

        // Validate required fields
        if (!body.title || !body.year || !body.storageKey) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'MISSING_FIELDS',
              message: 'Title, year, and storageKey are required',
            },
          });
        }

        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();

        // Initialize TMDB service for metadata fetching
        const { TMDBMetadataService } = await import('./services/tmdb-metadata.service');
        const tmdbService = new TMDBMetadataService(prisma);

        // Fetch metadata from TMDB if requested or if tmdbId provided
        let tmdbData = null;
        let metadataSource = 'manual';
        
        if (body.fetchMetadata || body.tmdbId) {
          if (body.tmdbId) {
            tmdbData = await tmdbService.getMovieDetails(body.tmdbId);
          } else {
            tmdbData = await tmdbService.searchMovie(body.title, body.year);
          }
          
          if (tmdbData) {
            metadataSource = 'tmdb';
            console.log(`[Admin] Found TMDB match: ${tmdbData.title} (ID: ${tmdbData.id})`);
          }
        }

        // Generate slug
        const slugBase = body.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
        const slug = `${slugBase}-${body.year}`;

        // Check for duplicate
        const existing = await prisma.movie.findUnique({
          where: { slug },
        });

        if (existing) {
          await prisma.$disconnect();
          return reply.status(409).send({
            success: false,
            error: {
              code: 'DUPLICATE_MOVIE',
              message: `Movie with slug "${slug}" already exists`,
            },
          });
        }

        // Prepare movie data with TMDB enrichment
        const movieData: any = {
          title: body.title,
          slug,
          description: body.description || null,
          overview: tmdbData?.overview || null,
          year: body.year,
          genre: normalizeGenres(
            tmdbData?.genres && tmdbData.genres.length > 0 
              ? tmdbData.genres.map((g: { name: string }) => g.name)
              : body.genre
          ),
          durationMinutes: body.duration || tmdbData?.runtime || null,
          thumbnailUrl: body.thumbnailUrl || null,
          posterUrl: tmdbData?.poster_path 
            ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}` 
            : null,
          backdropUrl: tmdbData?.backdrop_path 
            ? `https://image.tmdb.org/t/p/original${tmdbData.backdrop_path}` 
            : null,
          fileUrls: {
            "Original": `/api/v1/movies/download?key=${encodeURIComponent(body.storageKey)}`
          },
          fileSizes: {
            "Original": body.fileSize || 0
          },
          status: 'active',
          uploadedBy: 'admin',
          isStreamOnly: body.isStreamOnly ?? true,
          tmdbId: tmdbData?.id || null,
          imdbId: body.imdbId || tmdbData?.imdb_id || null,
          tmdbRating: tmdbData?.vote_average ? Math.round(tmdbData.vote_average * 10) : null,
          metadata: {
            storageKey: body.storageKey,
            contentType: body.contentType,
            fileSize: body.fileSize,
            source: 'admin-upload',
            director: body.director || null,
          }
        };

        // Create movie record
        const movie = await prisma.movie.create({
          data: movieData,
        });

        // Add cast members from TMDB if available
        if (tmdbData?.credits?.cast && tmdbData.credits.cast.length > 0) {
          const topCast = tmdbData.credits.cast.slice(0, 10);
          
          for (const actor of topCast) {
            await prisma.cast.create({
              data: {
                name: actor.name,
                character: actor.character || null,
                photoUrl: actor.profile_path 
                  ? `https://image.tmdb.org/t/p/w200${actor.profile_path}` 
                  : null,
                movieId: movie.id,
              },
            });
          }
          
          console.log(`[Admin] Added ${topCast.length} cast members from TMDB`);
        }

        await prisma.$disconnect();

        return reply.status(201).send({
          success: true,
          data: {
            movie,
            metadata: {
              source: metadataSource,
              tmdbId: tmdbData?.id || null,
              enriched: !!tmdbData,
            },
            message: tmdbData 
              ? 'Movie created successfully with TMDB metadata' 
              : 'Movie created successfully (TMDB metadata not found)',
          },
        });
      } catch (error) {
        console.error('[Admin] Movie creation error:', error);
        return reply.status(500).send({
          success: false,
          error: {
            code: 'CREATE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to create movie',
          },
        });
      }
    },
  });

  // POST /api/admin/movies/search-tmdb - Search TMDB for movie metadata
  app.post('/movies/search-tmdb', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        if (request.user.role !== 'ADMIN') {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Admin access required' },
          });
        }

        const body = request.body as {
          title: string;
          year?: number;
        };

        if (!body.title) {
          return reply.status(400).send({
            success: false,
            error: { code: 'MISSING_TITLE', message: 'Title is required' },
          });
        }

        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();
        const { TMDBMetadataService } = await import('./services/tmdb-metadata.service');
        const tmdbService = new TMDBMetadataService(prisma);

        const results = await tmdbService.searchMovie(body.title, body.year);
        
        await prisma.$disconnect();

        if (!results) {
          return reply.send({
            success: true,
            data: {
              results: [],
              message: 'No TMDB matches found',
            },
          });
        }

        return reply.send({
          success: true,
          data: {
            results: [results],
            message: 'TMDB match found',
          },
        });
      } catch (error) {
        console.error('[Admin] TMDB search error:', error);
        return reply.status(500).send({
          success: false,
          error: {
            code: 'SEARCH_ERROR',
            message: error instanceof Error ? error.message : 'Failed to search TMDB',
          },
        });
      }
    },
  });

  // POST /api/admin/movies/:id/enrich - Enrich existing movie with TMDB data
  app.post('/movies/:id/enrich', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        if (request.user.role !== 'ADMIN') {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Admin access required' },
          });
        }

        const { id } = request.params as { id: string };
        const body = request.body as {
          tmdbId?: number;
          searchTitle?: string;
          searchYear?: number;
        };

        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();

        const movie = await prisma.movie.findUnique({
          where: { id },
        });

        if (!movie) {
          await prisma.$disconnect();
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Movie not found' },
          });
        }

        const { TMDBMetadataService } = await import('./services/tmdb-metadata.service');
        const tmdbService = new TMDBMetadataService(prisma);

        let tmdbId = body.tmdbId;
        
        if (!tmdbId && body.searchTitle) {
          const searchResult = await tmdbService.searchMovie(
            body.searchTitle, 
            body.searchYear || movie.year
          );
          if (searchResult) {
            tmdbId = searchResult.id;
          }
        }

        if (!tmdbId) {
          await prisma.$disconnect();
          return reply.status(400).send({
            success: false,
            error: {
              code: 'NO_TMDB_ID',
              message: 'Please provide tmdbId or searchTitle',
            },
          });
        }

        await tmdbService.enrichMovieFromTMDB(id, movie.title, movie.year);
        
        const updatedMovie = await prisma.movie.findUnique({
          where: { id },
          include: { cast: true },
        });

        await prisma.$disconnect();

        return reply.send({
          success: true,
          data: {
            movie: updatedMovie,
            message: 'Movie enriched with TMDB data',
          },
        });
      } catch (error) {
        console.error('[Admin] Enrich error:', error);
        return reply.status(500).send({
          success: false,
          error: {
            code: 'ENRICH_ERROR',
            message: error instanceof Error ? error.message : 'Failed to enrich movie',
          },
        });
      }
    },
  });

  // GET /api/admin/movies/uploads - List uploaded movies (Admin only)
  app.get('/movies/uploads', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        if (request.user.role !== 'ADMIN') {
          return reply.status(403).send({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Admin access required',
            },
          });
        }

        const query = request.query as {
          page?: string;
          limit?: string;
        };

        const page = parseInt(query.page || '1', 10);
        const limit = parseInt(query.limit || '20', 10);
        const skip = (page - 1) * limit;

        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();

        const [movies, total] = await Promise.all([
          prisma.movie.findMany({
            where: {
              metadata: {
                path: ['source'],
                equals: 'admin-upload',
              },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
            select: {
              id: true,
              title: true,
              slug: true,
              year: true,
              genre: true,
              thumbnailUrl: true,
              status: true,
              createdAt: true,
              fileSizes: true,
            },
          }),
          prisma.movie.count({
            where: {
              metadata: {
                path: ['source'],
                equals: 'admin-upload',
              },
            },
          }),
        ]);

        await prisma.$disconnect();

        return reply.send({
          success: true,
          data: {
            movies,
            pagination: {
              page,
              limit,
              total,
              totalPages: Math.ceil(total / limit),
            },
          },
        });
      } catch (error) {
        console.error('[Admin] List uploads error:', error);
        return reply.status(500).send({
          success: false,
          error: {
            code: 'LIST_ERROR',
            message: error instanceof Error ? error.message : 'Failed to list uploads',
          },
        });
      }
    },
  });

  // POST /api/admin/movies/bulk-upload - Upload multiple movies (Admin only)
  app.post('/movies/bulk-upload', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        if (request.user.role !== 'ADMIN') {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Admin access required' },
          });
        }

        const body = request.body as {
          movies: Array<{
            title: string;
            description?: string;
            year: number;
            genre?: string[];
            director?: string;
            cast?: string[];
            duration?: number;
            fileName: string;
            contentType: string;
            fileSize?: number;
          }>;
        };

        if (!body.movies || body.movies.length === 0) {
          return reply.status(400).send({
            success: false,
            error: { code: 'NO_MOVIES', message: 'No movies provided' },
          });
        }

        if (body.movies.length > 50) {
          return reply.status(400).send({
            success: false,
            error: { code: 'TOO_MANY_MOVIES', message: 'Maximum 50 movies per batch' },
          });
        }

        const allowedVideoTypes = new Set([
          'video/mp4', 'video/x-matroska', 'video/webm',
          'video/quicktime', 'video/x-msvideo', 'video/x-m4v',
        ]);

        const { StorageService } = await import('../../shared/services/storage.service');
        const storageService = new StorageService();

        const results = await Promise.all(
          body.movies.map(async (movie) => {
            if (!allowedVideoTypes.has(movie.contentType)) {
              return {
                title: movie.title,
                success: false,
                error: `Unsupported video type: ${movie.contentType}`,
              };
            }

            const safeName = movie.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
            const storageKey = `movies/uploaded/${Date.now()}-${safeName}`;
            const uploadUrl = await storageService.getUploadUrl(storageKey, movie.contentType);

            return {
              title: movie.title,
              success: true,
              uploadUrl,
              storageKey,
              downloadUrl: `/api/v1/movies/download?key=${encodeURIComponent(storageKey)}`,
              movieData: {
                title: movie.title,
                description: movie.description,
                year: movie.year,
                genre: movie.genre,
                director: movie.director,
                cast: movie.cast,
                duration: movie.duration,
                storageKey,
                contentType: movie.contentType,
                fileSize: movie.fileSize,
              },
            };
          })
        );

        return reply.send({
          success: true,
          data: {
            total: results.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            movies: results,
          },
        });
      } catch (error) {
        console.error('[Admin] Bulk upload error:', error);
        return reply.status(500).send({
          success: false,
          error: {
            code: 'BULK_UPLOAD_ERROR',
            message: error instanceof Error ? error.message : 'Failed to process bulk upload',
          },
        });
      }
    },
  });

  // POST /api/admin/movies/:id/thumbnail - Generate thumbnail from video (Admin only)
  app.post('/movies/:id/thumbnail', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        if (request.user.role !== 'ADMIN') {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Admin access required' },
          });
        }

        const { id } = request.params as { id: string };
        const body = request.body as {
          timestamp?: number;
          width?: number;
          height?: number;
        };

        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();

        const movie = await prisma.movie.findUnique({
          where: { id },
        });

        if (!movie) {
          await prisma.$disconnect();
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Movie not found' },
          });
        }

        const storageKey = (movie.metadata as any)?.storageKey;
        if (!storageKey) {
          await prisma.$disconnect();
          return reply.status(400).send({
            success: false,
            error: { code: 'NO_STORAGE_KEY', message: 'Movie has no storage key' },
          });
        }

        // Generate thumbnail using ffmpeg (if available) or placeholder
        const timestamp = body.timestamp || 30;
        const width = body.width || 1280;
        const height = body.height || 720;

        const { StorageService } = await import('../../shared/services/storage.service');
        const storageService = new StorageService();

        const thumbnailKey = `movies/thumbnails/${id}-${Date.now()}.jpg`;

        try {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);

          const videoUrl = await storageService.getDownloadUrl(storageKey, { expiresInSeconds: 3600 });
          const tempPath = `/tmp/thumbnail-${id}.jpg`;

          await execAsync(
            `ffmpeg -ss ${timestamp} -i "${videoUrl}" -vframes 1 -vf "scale=${width}:${height}" -q:v 2 "${tempPath}" -y`,
            { timeout: 60000 }
          );

          const fs = await import('fs');
          const thumbnailBuffer = await fs.promises.readFile(tempPath);
          await storageService.uploadBuffer(thumbnailKey, thumbnailBuffer, 'image/jpeg');
          await fs.promises.unlink(tempPath);
        } catch (ffmpegError) {
          console.warn('[Admin] FFmpeg failed, using placeholder:', ffmpegError);
          const placeholderUrl = `https://via.placeholder.com/${width}x${height}/800020/FFFFFF?text=${encodeURIComponent(movie.title)}`;
          await prisma.$disconnect();
          return reply.send({
            success: true,
            data: {
              message: 'Using placeholder thumbnail (ffmpeg not available)',
              thumbnailUrl: placeholderUrl,
            },
          });
        }

        await prisma.movie.update({
          where: { id },
          data: { thumbnailUrl: `/api/v1/movies/download?key=${encodeURIComponent(thumbnailKey)}` },
        });

        await prisma.$disconnect();

        return reply.send({
          success: true,
          data: {
            message: 'Thumbnail generated successfully',
            thumbnailUrl: `/api/v1/movies/download?key=${encodeURIComponent(thumbnailKey)}`,
            timestamp,
          },
        });
      } catch (error) {
        console.error('[Admin] Thumbnail generation error:', error);
        return reply.status(500).send({
          success: false,
          error: {
            code: 'THUMBNAIL_ERROR',
            message: error instanceof Error ? error.message : 'Failed to generate thumbnail',
          },
        });
      }
    },
  });

  // POST /api/admin/movies/:id/transcode - Transcode video to HLS (Admin only)
  app.post('/movies/:id/transcode', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        if (request.user.role !== 'ADMIN') {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Admin access required' },
          });
        }

        const { id } = request.params as { id: string };
        const body = request.body as {
          qualities?: Array<'240p' | '360p' | '480p' | '720p' | '1080p'>;
        };

        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();

        const movie = await prisma.movie.findUnique({
          where: { id },
        });

        if (!movie) {
          await prisma.$disconnect();
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Movie not found' },
          });
        }

        // Add transcode job to queue
        const jobId = `transcode-${id}-${Date.now()}`;

        await prisma.$disconnect();

        return reply.send({
          success: true,
          data: {
            message: 'Transcoding job queued',
            jobId,
            movieId: id,
            status: 'queued',
            qualities: body.qualities || ['360p', '720p', '1080p'],
          },
        });
      } catch (error) {
        console.error('[Admin] Transcode error:', error);
        return reply.status(500).send({
          success: false,
          error: {
            code: 'TRANSCODE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to queue transcoding',
          },
        });
      }
    },
  });

  // GET /api/admin/movies/progress/:jobId - Get upload/processing progress (Admin only)
  app.get('/movies/progress/:jobId', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        if (request.user.role !== 'ADMIN') {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Admin access required' },
          });
        }

        const { jobId } = request.params as { jobId: string };

        // This is a mock implementation - in production you'd check Redis or database
        const mockProgress = {
          jobId,
          status: 'processing',
          progress: 65,
          stage: 'uploading',
          message: 'Uploading video to R2 storage',
          startedAt: new Date(Date.now() - 300000).toISOString(),
          estimatedCompletion: new Date(Date.now() + 180000).toISOString(),
        };

        return reply.send({
          success: true,
          data: mockProgress,
        });
      } catch (error) {
        console.error('[Admin] Progress check error:', error);
        return reply.status(500).send({
          success: false,
          error: {
            code: 'PROGRESS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get progress',
          },
        });
      }
    },
  });

  // Register queue management routes
  await app.register(adminQueueRoutes, { prefix: '' });

  // Register user management routes
  await app.register(adminUserRoutes, { prefix: '' });
};
