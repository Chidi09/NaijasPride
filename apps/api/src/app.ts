import 'dotenv/config';
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import sanitizeHtml from "sanitize-html";
import { randomUUID } from "crypto";
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { healthRoutes } from "./modules/health/health.routes";
import { movieRoutes } from "./modules/movies/movies.routes";
import { subtitleRoutes } from "./modules/movies/subtitles.routes";
import { bookRoutes } from "./modules/books/books.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { paymentRoutes } from "./modules/payments/payments.routes";
import { profileRoutes } from "./modules/users/profile.routes";
import { offlineRoutes } from "./modules/users/offline.routes";
import { booksLibraryRoutes } from "./modules/books/books-library.routes";
import { NewChapterService } from "./modules/books/new-chapter.service";
import { MangaService } from "./modules/books/manga.service";
import { adminRoutes } from "./modules/admin/admin.routes";
import { watchRoutes } from "./modules/users/watch.routes";
import { plansRoutes } from "./modules/payments/plans.routes";
import { musicRoutes } from "./modules/music/music.routes";
import { adminMusicRoutes } from "./modules/music/admin-music.routes";
import { AutoLibraryDiscoveryService } from "./modules/books/auto-library-discovery.service";
import { wrappedRoutes } from "./modules/wrapped/wrapped.routes";
import { WrappedCronService } from "./modules/wrapped/wrapped.cron";
import { YouTubeChannelService } from "./modules/admin/services/youtube-channel.service";
import { YouTubeMusicService } from "./modules/music/youtube-music.service";
import { YouTubeStatsSyncService } from "./modules/music/youtube-stats-sync.service";
import { TorrentDiscoveryService } from "./modules/movies/torrent-discovery.service";
import prismaPlugin from "./plugins/prisma";
import authPlugin from "./shared/plugins/auth.plugin";
import { globalErrorHandler } from "./shared/errors/global-handler";
import { sentryService } from "./shared/services/sentry.service";
import { StorageService } from './shared/services/storage.service';
import { bookImportQueue, elsciMirrorQueue, annasMirrorQueue, bookCoverQueue } from "./shared/services/queue.service";

const DEFAULT_BODY_LIMIT_BYTES = 1_048_576; // 1 MiB
const DEFAULT_CORS_ORIGINS = [
  "http://localhost:4200",
  "http://127.0.0.1:4200",
  "https://naijaspride.vercel.app",
  "https://naijaspride.com",
  "https://www.naijaspride.com",
  "https://naijaspride.pxxl.click",
];
const CSRF_COOKIE_NAME = "np_csrf";
const COOKIE_AUTH_NAMES = ["accessToken", "refreshToken"] as const;
const UNSAFE_HTTP_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const parseBodyLimit = () => {
  const value = process.env.BODY_LIMIT_BYTES;
  if (!value) return DEFAULT_BODY_LIMIT_BYTES;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_BODY_LIMIT_BYTES;
};

const parseCorsOrigins = () => {
  const configured = process.env.CORS_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configured?.length ? configured : DEFAULT_CORS_ORIGINS;
};

const parseCookies = (cookieHeader?: string) => {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey || rest.length === 0) continue;
    cookies[rawKey] = decodeURIComponent(rest.join("="));
  }

  return cookies;
};

const readHeaderToken = (header: string | string[] | undefined) =>
  typeof header === "string" ? header : header?.[0];

const parseBooleanFlag = (value: string | undefined, defaultValue: boolean): boolean => {
  if (typeof value !== "string") return defaultValue;
  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
};

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const isCookieAuthenticatedRequest = (cookies: Record<string, string>) =>
  COOKIE_AUTH_NAMES.some((cookieName) => !!cookies[cookieName]);

const sanitizeRequestBody = (body: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") {
      body[key] = sanitizeHtml(value, {
        allowedTags: [], // Strict mode: No HTML allowed in titles/descriptions
        allowedAttributes: {},
      });
    }
  }
};

const buildServer = async () => {
  const allowedOrigins = parseCorsOrigins();
  const usePrettyLogger = process.env.NODE_ENV === 'development';
  const app = Fastify({
    bodyLimit: parseBodyLimit(),
    requestIdHeader: "x-request-id",
    genReqId: (req) => {
      const requestId = req.headers["x-request-id"];
      if (Array.isArray(requestId)) {
        return requestId[0] || randomUUID();
      }
      return requestId || randomUUID();
    },
    logger: usePrettyLogger
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              translateTime: "HH:MM:ss Z",
              ignore: "pid,hostname",
            },
          },
        }
      : true,
  });

  // 1. Register Global Plugins
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    global: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    errorResponseBuilder: (req, context) => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: "You are hitting the server too fast. Slow down and try again.",
      date: Date.now(),
      expiresIn: context.ttl,
    }),
  });

  await app.register(cors, {
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-csrf-token", "x-request-id"],
    exposedHeaders: ["x-request-id"],
    strictPreflight: true,
    origin: (origin, callback) => {
      // Allow requests without Origin header (curl/mobile/server-to-server).
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      // Reject with false instead of throwing — avoids 500 and lets Fastify return a proper CORS rejection.
      callback(null, false);
    },
  });
  await app.register(prismaPlugin);
  await app.register(authPlugin);

  await app.register(swagger, {
    openapi: {
      info: {
        title: "NaijasPride API",
        version: "1.0.0",
      },
      servers: [{ url: "/api/v1" }],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, {
    routePrefix: "/documentation",
  });

  // Register Global Error Handler
  await globalErrorHandler(app);

  // Echo request id so clients can correlate server logs.
  app.addHook("onRequest", async (req, reply) => {
    reply.header("x-request-id", req.id);
  });

  // Enforce CSRF only for cookie-authenticated mutating requests.
  app.addHook("preHandler", async (req, reply) => {
    if (!UNSAFE_HTTP_METHODS.has(req.method)) return;
    if (req.headers.authorization) return; // Bearer token auth is not CSRF-vulnerable.
    if (req.url.includes("/auth/csrf-token")) return;

    const cookies = parseCookies(req.headers.cookie);
    if (!isCookieAuthenticatedRequest(cookies)) return;

    const csrfFromCookie = cookies[CSRF_COOKIE_NAME];
    const csrfFromHeader = readHeaderToken(req.headers["x-csrf-token"]);
    if (!csrfFromCookie || !csrfFromHeader || csrfFromCookie !== csrfFromHeader) {
      return reply.status(403).send({
        success: false,
        error: "Forbidden: CSRF token validation failed",
      });
    }
  });

  // Global Hook: Sanitize Body to prevent XSS
  app.addHook("preValidation", async (req) => {
    if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
      sanitizeRequestBody(req.body as Record<string, unknown>);
    }
  });

  // 2. Configure Zod for Validation
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // 3. Register Routes
  const apiPrefix = "/api/v1";
  app.get("/", async () => ({
    name: "NaijasPride API",
    status: "ok",
    health: `${apiPrefix}/health`,
    docs: "/documentation",
  }));

  await app.register(healthRoutes, { prefix: `${apiPrefix}/health` });
  await app.register(authRoutes, { prefix: `${apiPrefix}/auth` }); // Auth routes
  await app.register(movieRoutes, { prefix: `${apiPrefix}/movies` });
  await app.register(subtitleRoutes, { prefix: `${apiPrefix}/movies` });
  await app.register(bookRoutes, { prefix: `${apiPrefix}/books` });
  await app.register(paymentRoutes, { prefix: `${apiPrefix}/payments` });
  await app.register(profileRoutes, { prefix: `${apiPrefix}/profile` });
  await app.register(offlineRoutes, { prefix: `${apiPrefix}/profile` });
  await app.register(booksLibraryRoutes, { prefix: `${apiPrefix}/library` });
  await app.register(adminRoutes, { prefix: `${apiPrefix}/admin` });
  await app.register(watchRoutes, { prefix: `${apiPrefix}/watch` });
  await app.register(plansRoutes, { prefix: `${apiPrefix}/plans` });
  await app.register(musicRoutes, { prefix: `${apiPrefix}/music` });
  await app.register(adminMusicRoutes, { prefix: `${apiPrefix}/admin/music` });
  await app.register(wrappedRoutes, { prefix: `${apiPrefix}/wrapped` });

  return app;
};

const start = async () => {
  try {
    const app = await buildServer();
    const port = parseInt(process.env.PORT || "3000", 10);

    // Monitor configured YouTube channels every 6 hours.
    const channelService = new YouTubeChannelService(app.prisma);
    const musicChannelService = new YouTubeMusicService(app.prisma);
    const sixHoursMs = 6 * 60 * 60 * 1000;
    setInterval(() => {
      channelService.monitorAllChannelsEvery6Hours().catch((error) => {
        app.log.error({ error }, "YouTube channel monitor failed");
      });
      musicChannelService.monitorAll().catch((error) => {
        app.log.error({ error }, "YouTube music channel monitor failed");
      });
    }, sixHoursMs);
    channelService.monitorAllChannelsEvery6Hours().catch((error) => {
      app.log.error({ error }, "Initial YouTube channel monitor run failed");
    });
    musicChannelService.monitorAll().catch((error) => {
      app.log.error({ error }, "Initial YouTube music channel monitor run failed");
    });

    const movieChannelBootstrapEnabled = parseBooleanFlag(process.env.MOVIE_CHANNEL_BOOTSTRAP_ENABLED, true);
    if (movieChannelBootstrapEnabled) {
      const fallbackUrls = [
        'https://www.youtube.com/@shemaroomoviein',
        'https://www.youtube.com/@UltraBollywood',
        'https://www.youtube.com/@GoldminesBollywood',
        'https://www.youtube.com/@MovieCentral',
      ];
      const configuredUrls = (process.env.MOVIE_CHANNEL_BOOTSTRAP_URLS || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
      const channelUrls = configuredUrls.length > 0 ? configuredUrls : fallbackUrls;

      setTimeout(() => {
        channelService.bootstrapChannels(channelUrls)
          .then((summary) => {
            app.log.info({ summary, attempted: channelUrls.length }, '[MovieChannelBootstrap] Completed');
            if (summary.created > 0) {
              channelService.monitorAllChannelsEvery6Hours().catch((error) => {
                app.log.error({ error }, '[MovieChannelBootstrap] Monitor run after bootstrap failed');
              });
            }
          })
          .catch((error) => {
            app.log.error({ error }, '[MovieChannelBootstrap] Failed');
          });
      }, 25_000);
    }

    // Sync YouTube public stats (views + likes) for all music videos — daily.
    const ytStatsSyncService = new YouTubeStatsSyncService(app.prisma, app.log);
    const oneDayMs = 24 * 60 * 60 * 1000;
    setInterval(() => {
      ytStatsSyncService.syncAll().catch((error) => {
        app.log.error({ error }, '[YTStatsSync] Daily sync failed');
      });
    }, oneDayMs);
    // First run 30 minutes after startup so we don't hammer the API at boot
    setTimeout(() => {
      ytStatsSyncService.syncAll().catch((error) => {
        app.log.error({ error }, '[YTStatsSync] Initial sync failed');
      });
    }, 30 * 60 * 1000);

    // Optional bootstrap: auto-import from top Nigerian artists/labels when
    // the catalog is still empty or too small. This removes manual admin setup
    // for first-time deployments.
    const musicAutoBootstrapEnabled = (process.env.MUSIC_AUTO_BOOTSTRAP_ENABLED || 'true').toLowerCase() !== 'false';
    if (musicAutoBootstrapEnabled) {
      setTimeout(() => {
        musicChannelService.bootstrapTopNigerianCatalog()
          .then((summary) => {
            if (summary.skipped) {
              app.log.info({ summary }, '[MusicBootstrap] Skipped');
            } else {
              app.log.info({ summary }, '[MusicBootstrap] Started top-artist imports');
            }
          })
          .catch((error) => {
            app.log.error({ error }, '[MusicBootstrap] Failed');
          });
      }, 20_000);
    }

    // One-time migration: update Elsci book downloadUrls to point to R2.
    // The mirror harvester uploaded 120 books to R2 but may not have updated
    // every DB row (Cloudflare blocks, timeouts, etc.).  This patches any
    // remaining rows so the reader/download endpoints serve from R2 directly.
    setTimeout(async () => {
      try {
        const staleElsci = await app.prisma.book.findMany({
          where: {
            OR: [
              { publisher: { contains: 'elsci', mode: 'insensitive' } },
              { slug: { startsWith: 'elsci-ln-' } },
            ],
            downloadUrl: { startsWith: '/api/v1/books/external/elsci/file' },
          },
          select: { id: true, slug: true, format: true },
        });
        if (staleElsci.length === 0) {
          app.log.info('[ElsciUrlFix] All Elsci books already point to R2. Nothing to do.');
        } else {
          app.log.info(`[ElsciUrlFix] Fixing ${staleElsci.length} Elsci books with stale downloadUrl...`);
          let fixed = 0;
          for (const book of staleElsci) {
            const ext = (book.format || 'epub').toLowerCase() === 'pdf' ? 'pdf' : 'epub';
            const storageKey = `books/elsci/${book.slug}.${ext}`;
            const localUrl = `/api/v1/books/download?key=${encodeURIComponent(storageKey)}`;
            await app.prisma.book.update({
              where: { id: book.id },
              data: { downloadUrl: localUrl },
            });
            fixed++;
          }
          app.log.info(`[ElsciUrlFix] Updated ${fixed} Elsci book downloadUrls to R2 paths.`);
        }
      } catch (error) {
        app.log.error({ error }, '[ElsciUrlFix] Failed to fix Elsci downloadUrls');
      }
    }, 15_000); // Run 15s after startup

    // One-time migration: if cover images already exist in R2 under
    // covers/books/<slug>.<ext>, backfill missing book.coverUrl values.
    setTimeout(async () => {
      try {
        const storagePublicBaseUrl = (process.env.STORAGE_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL || '').trim();
        const coverKeyBySlug = new Map<string, string>();
        let continuationToken: string | undefined;

        do {
          const page = await StorageService.getClient().send(
            new ListObjectsV2Command({
              Bucket: StorageService.getBucket(),
              Prefix: 'covers/books/',
              ContinuationToken: continuationToken,
            }),
          );

          for (const entry of page.Contents || []) {
            const key = (entry.Key || '').trim();
            if (!key || !/\.(jpg|jpeg|png|webp|gif|avif)$/i.test(key)) continue;
            const fileName = key.split('/').pop() || '';
            const slug = fileName.replace(/\.[^.]+$/i, '').trim();
            if (!slug || coverKeyBySlug.has(slug)) continue;
            coverKeyBySlug.set(slug, key);
          }

          continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
        } while (continuationToken);

        if (coverKeyBySlug.size === 0) {
          app.log.info('[BookCoverUrlFix] No R2 cover keys found under covers/books/.');
          return;
        }

        const missingCovers = await app.prisma.book.findMany({
          where: {
            status: 'active',
            OR: [{ coverUrl: null }, { coverUrl: '' }],
          },
          select: { id: true, slug: true },
        });

        let updated = 0;
        for (const book of missingCovers) {
          const key = coverKeyBySlug.get(book.slug);
          if (!key) continue;

          const coverUrl = storagePublicBaseUrl
            ? `${storagePublicBaseUrl.replace(/\/+$/, '')}/${key}`
            : `/api/v1/books/download?key=${encodeURIComponent(key)}`;

          await app.prisma.book.update({
            where: { id: book.id },
            data: { coverUrl },
          });
          updated++;
        }

        app.log.info(
          { r2CoverKeys: coverKeyBySlug.size, missingBefore: missingCovers.length, updated },
          '[BookCoverUrlFix] Backfilled book cover URLs from existing R2 objects',
        );

        // Queue cover extraction for remaining missing covers so they are filled over time.
        const remainingMissing = await app.prisma.book.findMany({
          where: {
            status: 'active',
            OR: [{ coverUrl: null }, { coverUrl: '' }],
            AND: [
              { downloadUrl: { not: null } },
              { NOT: { downloadUrl: { startsWith: 'magnet:' } } },
            ],
          },
          select: { id: true },
          take: parsePositiveInt(process.env.BOOK_COVER_STARTUP_BACKFILL_LIMIT, 200),
        });

        const queue = bookCoverQueue.get();
        if (!queue || remainingMissing.length === 0) return;

        let queued = 0;
        for (const book of remainingMissing) {
          try {
            await queue.add(
              'extract-book-cover',
              {
                bookId: book.id,
                reason: 'startup-missing-cover-backfill',
                timestamp: Date.now(),
              },
              {
                jobId: `book-cover-${book.id}`,
                removeOnComplete: true,
                removeOnFail: false,
              },
            );
            queued++;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (/job.+exists/i.test(message)) continue;
            app.log.warn({ error, bookId: book.id }, '[BookCoverUrlFix] Failed to queue cover extraction job');
          }
        }

        app.log.info({ queued }, '[BookCoverUrlFix] Queued missing cover extraction jobs');
      } catch (error) {
        app.log.error({ error }, '[BookCoverUrlFix] Failed to backfill book cover URLs');
      }
    }, 25_000); // Run after Elsci URL migration

    // Optional Auto-Library discovery scheduler for high-value books.
    const autoLibraryEnabled = parseBooleanFlag(process.env.BOOK_AUTO_LIBRARY_ENABLED, false);
    if (autoLibraryEnabled) {
      const intervalMs = parsePositiveInt(process.env.BOOK_AUTO_LIBRARY_INTERVAL_MS, 24 * 60 * 60 * 1000);
      const startupDelayMs = parsePositiveInt(process.env.BOOK_AUTO_LIBRARY_STARTUP_DELAY_MS, 3 * 60 * 1000);
      const autoLibraryService = new AutoLibraryDiscoveryService(app.prisma, console);

      const runAutoLibrary = () => {
        autoLibraryService
          .discoverAndSync({
            includeMustHaves: parseBooleanFlag(process.env.BOOK_AUTO_LIBRARY_INCLUDE_MUST_HAVES, true),
            includeTrending: parseBooleanFlag(process.env.BOOK_AUTO_LIBRARY_INCLUDE_TRENDING, true),
            maxTargets: parsePositiveInt(process.env.BOOK_AUTO_LIBRARY_MAX_TARGETS, 24),
            maxMatches: parsePositiveInt(process.env.BOOK_AUTO_LIBRARY_MAX_MATCHES, 8),
            minSeeders: parsePositiveInt(process.env.BOOK_AUTO_LIBRARY_MIN_SEEDERS, 1),
            ingest: parseBooleanFlag(process.env.BOOK_AUTO_LIBRARY_INGEST, false),
            dryRun: parseBooleanFlag(process.env.BOOK_AUTO_LIBRARY_DRY_RUN, true),
          })
          .then((summary) => {
            app.log.info({ summary }, '[AutoLibrary] Scheduled run completed');
          })
          .catch((error) => {
            app.log.error({ error }, '[AutoLibrary] Scheduled run failed');
          });
      };

      setInterval(runAutoLibrary, intervalMs);
      setTimeout(runAutoLibrary, startupDelayMs);

      app.log.info(
        {
          intervalMs,
          startupDelayMs,
          ingest: parseBooleanFlag(process.env.BOOK_AUTO_LIBRARY_INGEST, false),
          dryRun: parseBooleanFlag(process.env.BOOK_AUTO_LIBRARY_DRY_RUN, true),
        },
        '[AutoLibrary] Scheduler enabled',
      );
    }

    // Optional Elsci light novels auto-import scheduler
    const elsciAutoEnabled = parseBooleanFlag(process.env.ELSCI_AUTO_IMPORT_ENABLED, false);
    if (elsciAutoEnabled) {
      const elsciIntervalMs = parsePositiveInt(process.env.ELSCI_AUTO_IMPORT_INTERVAL_MS, 6 * 60 * 60 * 1000);
      const elsciStartupDelayMs = parsePositiveInt(process.env.ELSCI_AUTO_IMPORT_STARTUP_DELAY_MS, 5 * 60 * 1000);

      const runElsciImport = () => {
        const q = bookImportQueue.get();
        if (!q) {
          app.log.warn('[ElsciScheduler] bookImportQueue not available — Redis may not be configured');
          return;
        }
        q.add(
          'elsci-lightnovels',
          { source: 'elsci-lightnovels', mode: 'manual' },
          { jobId: `elsci-auto-${Date.now()}`, removeOnComplete: 50, removeOnFail: 20 },
        ).then(() => {
          app.log.info('[ElsciScheduler] Enqueued elsci-lightnovels import job');
        }).catch((err: unknown) => {
          app.log.error({ err }, '[ElsciScheduler] Failed to enqueue import job');
        });
      };

      setInterval(runElsciImport, elsciIntervalMs);
      setTimeout(runElsciImport, elsciStartupDelayMs);
      app.log.info({ elsciIntervalMs, elsciStartupDelayMs }, '[ElsciScheduler] Enabled');
    }

    // Elsci mirror harvester scheduler — downloads unmirrored files to R2
    const elsciMirrorEnabled = parseBooleanFlag(process.env.ELSCI_MIRROR_ENABLED, true);
    if (elsciMirrorEnabled) {
      const mirrorIntervalMs = parsePositiveInt(process.env.ELSCI_MIRROR_INTERVAL_MS, 4 * 60 * 60 * 1000); // 4h
      const mirrorStartupDelayMs = parsePositiveInt(process.env.ELSCI_MIRROR_STARTUP_DELAY_MS, 8 * 60 * 1000); // 8min
      const mirrorBatchSize = parsePositiveInt(process.env.ELSCI_MIRROR_BATCH_SIZE, 10);

      const runElsciMirror = () => {
        const q = elsciMirrorQueue.get();
        if (!q) {
          app.log.warn('[ElsciMirror] elsciMirrorQueue not available — Redis may not be configured');
          return;
        }
        q.add(
          'mirror-batch',
          {
            batchSize: mirrorBatchSize,
            triggeredBy: 'scheduler',
            timestamp: Date.now(),
          },
          { jobId: `elsci-mirror-${Date.now()}`, removeOnComplete: 20, removeOnFail: 10 },
        ).then(() => {
          app.log.info('[ElsciMirror] Enqueued mirror job');
        }).catch((err: unknown) => {
          app.log.error({ err }, '[ElsciMirror] Failed to enqueue mirror job');
        });
      };

      setInterval(runElsciMirror, mirrorIntervalMs);
      setTimeout(runElsciMirror, mirrorStartupDelayMs);
      app.log.info(
        { mirrorIntervalMs, mirrorStartupDelayMs, mirrorBatchSize },
        '[ElsciMirror] Scheduler enabled',
      );
    }

    // Anna's Archive mirror scheduler — downloads discovered books to R2
    const annasMirrorEnabled = parseBooleanFlag(process.env.ANNAS_MIRROR_ENABLED, false);
    if (annasMirrorEnabled) {
      const annasMirrorIntervalMs = parsePositiveInt(process.env.ANNAS_MIRROR_INTERVAL_MS, 6 * 60 * 60 * 1000); // 6h
      const annasMirrorStartupDelayMs = parsePositiveInt(process.env.ANNAS_MIRROR_STARTUP_DELAY_MS, 10 * 60 * 1000); // 10min
      const annasMirrorBatchSize = parsePositiveInt(process.env.ANNAS_MIRROR_BATCH_SIZE, 5);

      const runAnnasMirror = () => {
        const q = annasMirrorQueue.get();
        if (!q) {
          app.log.warn('[AnnasMirror] annasMirrorQueue not available — Redis may not be configured');
          return;
        }
        q.add(
          'mirror-annas-books',
          {
            batchSize: annasMirrorBatchSize,
            triggeredBy: 'scheduler',
            timestamp: Date.now(),
          },
          { jobId: `annas-mirror-${Date.now()}`, removeOnComplete: 20, removeOnFail: 10 },
        ).then(() => {
          app.log.info('[AnnasMirror] Enqueued mirror job');
        }).catch((err: unknown) => {
          app.log.error({ err }, '[AnnasMirror] Failed to enqueue mirror job');
        });
      };

      setInterval(runAnnasMirror, annasMirrorIntervalMs);
      setTimeout(runAnnasMirror, annasMirrorStartupDelayMs);
      app.log.info(
        { annasMirrorIntervalMs, annasMirrorStartupDelayMs, annasMirrorBatchSize },
        '[AnnasMirror] Scheduler enabled',
      );
    }

    // Optional torrent discovery scheduler (1337x + FlareSolverr).
    const torrentDiscoveryEnabled = parseBooleanFlag(process.env.TORRENT_DISCOVERY_ENABLED, false);
    if (torrentDiscoveryEnabled) {
      const torrentDiscoveryIntervalMs = parsePositiveInt(
        process.env.TORRENT_DISCOVERY_INTERVAL_MS,
        12 * 60 * 60 * 1000,
      );
      const torrentDiscoveryStartupDelayMs = parsePositiveInt(
        process.env.TORRENT_DISCOVERY_STARTUP_DELAY_MS,
        2 * 60 * 1000,
      );

      const torrentDiscoveryService = new TorrentDiscoveryService(
        app.prisma,
        console,
        {
          sourceUrl: process.env.TORRENT_SOURCE_URL,
          maxItemsPerRun: parsePositiveInt(process.env.TORRENT_DISCOVERY_MAX_ITEMS, 8),
          requireApproval: parseBooleanFlag(process.env.TORRENT_DISCOVERY_REQUIRE_APPROVAL, true),
          requestTimeoutMs: parsePositiveInt(process.env.TORRENT_DISCOVERY_REQUEST_TIMEOUT_MS, 60_000),
          dryRun: parseBooleanFlag(process.env.TORRENT_DISCOVERY_DRY_RUN, false),
          failureThreshold: parsePositiveInt(process.env.TORRENT_DISCOVERY_FAILURE_THRESHOLD, 5),
          recoveryTimeoutMs: parsePositiveInt(process.env.TORRENT_DISCOVERY_RECOVERY_MS, 300_000),
        },
      );

      const bollywoodTorrentDiscoveryService = new TorrentDiscoveryService(
        app.prisma,
        console,
        {
          sourceUrl: process.env.TORRENT_BOLLYWOOD_SOURCE_URL || 'https://www.1377x.to/search/bollywood/1/',
          maxItemsPerRun: parsePositiveInt(process.env.TORRENT_BOLLYWOOD_MAX_ITEMS, 4),
          requireApproval: parseBooleanFlag(process.env.TORRENT_DISCOVERY_REQUIRE_APPROVAL, true),
          requestTimeoutMs: parsePositiveInt(process.env.TORRENT_DISCOVERY_REQUEST_TIMEOUT_MS, 60_000),
          dryRun: parseBooleanFlag(process.env.TORRENT_DISCOVERY_DRY_RUN, false),
          failureThreshold: parsePositiveInt(process.env.TORRENT_DISCOVERY_FAILURE_THRESHOLD, 5),
          recoveryTimeoutMs: parsePositiveInt(process.env.TORRENT_DISCOVERY_RECOVERY_MS, 300_000),
        },
      );

      const runTorrentDiscovery = () => {
        torrentDiscoveryService
          .discoverAndIngest()
          .then((summary) => {
            if (summary.skippedRunReason) {
              app.log.warn({ summary }, '[TorrentDiscovery] Run skipped');
              return;
            }
            app.log.info({ summary }, '[TorrentDiscovery] Run completed');
          })
          .catch((error) => {
            app.log.error({ error }, '[TorrentDiscovery] Run failed');
          });

        bollywoodTorrentDiscoveryService
          .discoverAndIngest()
          .then((summary) => {
            if (summary.skippedRunReason) {
              app.log.warn({ summary }, '[TorrentDiscovery:Bollywood] Run skipped');
              return;
            }
            app.log.info({ summary }, '[TorrentDiscovery:Bollywood] Run completed');
          })
          .catch((error) => {
            app.log.error({ error }, '[TorrentDiscovery:Bollywood] Run failed');
          });
      };

      setInterval(runTorrentDiscovery, torrentDiscoveryIntervalMs);
      setTimeout(runTorrentDiscovery, torrentDiscoveryStartupDelayMs);

      app.log.info(
        {
          intervalMs: torrentDiscoveryIntervalMs,
          startupDelayMs: torrentDiscoveryStartupDelayMs,
          sourceUrl: process.env.TORRENT_SOURCE_URL || 'https://www.1377x.to/popular-movies-week',
          bollywoodSourceUrl: process.env.TORRENT_BOLLYWOOD_SOURCE_URL || 'https://www.1377x.to/search/bollywood/1/',
          requireApproval: parseBooleanFlag(process.env.TORRENT_DISCOVERY_REQUIRE_APPROVAL, true),
          dryRun: parseBooleanFlag(process.env.TORRENT_DISCOVERY_DRY_RUN, false),
        },
        '[TorrentDiscovery] Scheduler enabled',
      );
    }

    // Optional Soap2Day crawler scheduler
    const soap2dayCrawlerEnabled = parseBooleanFlag(process.env.SOAP2DAY_CRAWLER_ENABLED, false);
    if (soap2dayCrawlerEnabled) {
      const soap2dayIntervalMs = parsePositiveInt(process.env.SOAP2DAY_CRAWLER_INTERVAL_MS, 24 * 60 * 60 * 1000);
      const soap2dayStartupDelayMs = parsePositiveInt(process.env.SOAP2DAY_CRAWLER_STARTUP_DELAY_MS, 10 * 60 * 1000);

      const { Soap2DayCrawlerService } = await import('./modules/movies/soap2day-crawler.service');
      const soap2dayCrawler = new Soap2DayCrawlerService(app.prisma, console, {
        maxPerRun: parsePositiveInt(process.env.SOAP2DAY_CRAWLER_MAX_PER_RUN, 1),
      });

      const runSoap2DayCrawl = () => {
        soap2dayCrawler.crawl()
          .then(summary => app.log.info({ summary }, '[Soap2DayCrawler] Scheduled run complete'))
          .catch(err => app.log.error({ err }, '[Soap2DayCrawler] Scheduled run failed'));
      };

      setInterval(runSoap2DayCrawl, soap2dayIntervalMs);
      setTimeout(runSoap2DayCrawl, soap2dayStartupDelayMs);
      app.log.info({ soap2dayIntervalMs, soap2dayStartupDelayMs }, '[Soap2DayCrawler] Scheduler enabled');
    }

    // New-chapter checker: poll manga sources for new chapters every hour
    const newChapterIntervalMs = parseInt(process.env.NEW_CHAPTER_CHECK_INTERVAL_MS || '3600000', 10);
    const mangaService = new MangaService(app.prisma);
    const newChapterService = new NewChapterService(app.prisma, mangaService.getSourceManager());
    const runNewChapterCheck = () => {
      newChapterService.runCheck().catch((err) => {
        app.log.error({ err }, '[NewChapterService] Check failed');
      });
    };
    setInterval(runNewChapterCheck, newChapterIntervalMs);
    // Initial run after 5 minutes (let the app warm up first)
    setTimeout(runNewChapterCheck, 5 * 60 * 1000);

    // Start Wrapped Cron Service (monthly + annual wrapped generation)
    const wrappedCron = new WrappedCronService(app);
    wrappedCron.start();

    await app.listen({ port, host: "0.0.0.0" });
    console.log(`🚀 NaijasPride API running on http://localhost:${port}`);
  } catch (err) {
    console.error(err);
    sentryService.captureException(err, { phase: "startup" });
    process.exit(1);
  }
};

start();

