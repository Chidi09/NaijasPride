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
import { bookRoutes } from "./modules/books/books.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { paymentRoutes } from "./modules/payments/payments.routes";
import { profileRoutes } from "./modules/users/profile.routes";
import { adminRoutes } from "./modules/admin/admin.routes";
import { watchRoutes } from "./modules/users/watch.routes";
import prismaPlugin from "./plugins/prisma";
import authPlugin from "./shared/plugins/auth.plugin";
import { globalErrorHandler } from "./shared/errors/global-handler";
import { sentryService } from "./shared/services/sentry.service";

const DEFAULT_BODY_LIMIT_BYTES = 1_048_576; // 1 MiB
const DEFAULT_CORS_ORIGINS = [
  "http://localhost:4200",
  "http://127.0.0.1:4200",
  "https://naijaspride.vercel.app",
  "https://naijaspride.com",
  "https://www.naijaspride.com",
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

      callback(new Error("Origin not allowed"), false);
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
  await app.register(bookRoutes, { prefix: `${apiPrefix}/books` });
  await app.register(paymentRoutes, { prefix: `${apiPrefix}/payments` });
  await app.register(profileRoutes, { prefix: `${apiPrefix}/profile` });
  await app.register(adminRoutes, { prefix: `${apiPrefix}/admin` });
  await app.register(watchRoutes, { prefix: `${apiPrefix}/watch` });

  return app;
};

const start = async () => {
  try {
    const app = await buildServer();
    const port = parseInt(process.env.PORT || "3000", 10);

    await app.listen({ port, host: "0.0.0.0" });
    console.log(`🚀 NaijasPride API running on http://localhost:${port}`);
  } catch (err) {
    console.error(err);
    sentryService.captureException(err, { phase: "startup" });
    process.exit(1);
  }
};

start();

