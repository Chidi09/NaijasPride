import 'dotenv/config';
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import sanitizeHtml from "sanitize-html";
import { randomUUID } from "crypto";
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
import { YouTubeChannelService } from "./modules/admin/services/youtube-channel.service";
import { YouTubeMusicService } from "./modules/music/youtube-music.service";
import prismaPlugin from "./plugins/prisma";
import authPlugin from "./shared/plugins/auth.plugin";
import { globalErrorHandler } from "./shared/errors/global-handler";
import { sentryService } from "./shared/services/sentry.service";
import { bookImportQueue } from "./shared/services/queue.service";

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

    // New-chapter checker: poll manga sources for new chapters every hour
    const newChapterIntervalMs = parseInt(process.env.NEW_CHAPTER_CHECK_INTERVAL_MS || '3600000', 10);
    const mangaService = new MangaService(app.prisma);
    const newChapterService = new NewChapterService(app.prisma, (mangaService as any).sourceManager);
    const runNewChapterCheck = () => {
      newChapterService.runCheck().catch((err) => {
        app.log.error({ err }, '[NewChapterService] Check failed');
      });
    };
    setInterval(runNewChapterCheck, newChapterIntervalMs);
    // Initial run after 5 minutes (let the app warm up first)
    setTimeout(runNewChapterCheck, 5 * 60 * 1000);

    // Auto-import epubBooks titles gradually (queue-based).
    const autoImportEnabled = ['1', 'true', 'yes', 'on'].includes(
      (process.env.EPUBBOOKS_AUTO_IMPORT_ENABLED || '').trim().toLowerCase()
    );
    if (autoImportEnabled) {
      const intervalMsRaw = Number.parseInt(process.env.EPUBBOOKS_AUTO_IMPORT_INTERVAL_MS || '21600000', 10); // 6h
      const intervalMs = Number.isFinite(intervalMsRaw) && intervalMsRaw >= 60_000 ? intervalMsRaw : 21_600_000;
      const sort = (process.env.EPUBBOOKS_AUTO_IMPORT_SORT || 'title').trim().toLowerCase();
      const maxBooksRaw = Number.parseInt(process.env.EPUBBOOKS_AUTO_IMPORT_MAX_BOOKS || '8', 10);
      const concurrencyRaw = Number.parseInt(process.env.EPUBBOOKS_AUTO_IMPORT_CONCURRENCY || '2', 10);
      const maxBooks = Number.isFinite(maxBooksRaw) && maxBooksRaw > 0 ? Math.min(maxBooksRaw, 50) : 8;
      const concurrency = Number.isFinite(concurrencyRaw) && concurrencyRaw > 0 ? Math.min(concurrencyRaw, 6) : 2;

      const enqueueAutoImport = async () => {
        const queue = bookImportQueue.get();
        if (!queue) {
          app.log.warn('EPUBBOOKS_AUTO_IMPORT_ENABLED is on but REDIS_URL is not set; skipping auto import');
          return;
        }

        // Avoid building a backlog if the worker is offline.
        const counts = await queue.getJobCounts('active', 'waiting', 'delayed');
        const backlog = (counts.active || 0) + (counts.waiting || 0) + (counts.delayed || 0);
        if (backlog > 2) {
          app.log.info({ backlog }, 'Skipping epubBooks auto import (queue backlog)');
          return;
        }

        const job = await queue.add(
          'import-epubbooks',
          {
            source: 'epubbooks',
            mode: 'auto',
            options: {
              sort: sort === 'released' ? 'released' : 'title',
              maxBooks,
              concurrency,
              dryRun: false,
            },
            requestedAt: Date.now(),
          },
          { removeOnComplete: true, removeOnFail: false }
        );

        app.log.info({ jobId: String(job.id), maxBooks, sort }, 'Queued epubBooks auto import');
      };

      setInterval(() => {
        enqueueAutoImport().catch((error) => {
          app.log.error({ error }, 'epubBooks auto import enqueue failed');
        });
      }, intervalMs);

      enqueueAutoImport().catch((error) => {
        app.log.error({ error }, 'Initial epubBooks auto import enqueue failed');
      });
    }

    await app.listen({ port, host: "0.0.0.0" });
    console.log(`🚀 NaijasPride API running on http://localhost:${port}`);
  } catch (err) {
    console.error(err);
    sentryService.captureException(err, { phase: "startup" });
    process.exit(1);
  }
};

start();

