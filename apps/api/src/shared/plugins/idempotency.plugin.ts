import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyRequest,
  FastifyReply,
} from "fastify";
import { getRedis } from "../services/redis.service";

interface IdempotencyOptions {
  // Key prefix for Redis storage
  keyPrefix?: string;
  // TTL in seconds (default: 24 hours)
  ttlSeconds?: number;
  // Header name for idempotency key (default: x-idempotency-key)
  headerName?: string;
  // Whether to store and return cached responses
  cacheResponses?: boolean;
}

interface StoredResponse {
  statusCode: number;
  payload: unknown;
  timestamp: number;
}

const DEFAULT_OPTIONS: Required<IdempotencyOptions> = {
  keyPrefix: "idempotency",
  ttlSeconds: 24 * 60 * 60, // 24 hours
  headerName: "x-idempotency-key",
  cacheResponses: true,
};

/**
 * Generate a storage key for an idempotency request
 */
function generateKey(
  prefix: string,
  userId: string | undefined,
  idempotencyKey: string,
  route: string,
): string {
  const userPart = userId || "anonymous";
  return `${prefix}:${userPart}:${route}:${idempotencyKey}`;
}

/**
 * Idempotency middleware for Fastify
 * Prevents duplicate POST/PUT/PATCH requests by tracking idempotency keys
 *
 * Usage:
 * 1. Client generates unique key (UUID) for each request
 * 2. Client sends key in header: x-idempotency-key: <uuid>
 * 3. Server caches response for 24 hours
 * 4. If same key is sent again, server returns cached response
 */
export const idempotencyPlugin: FastifyPluginAsync<IdempotencyOptions> = async (
  fastify: FastifyInstance,
  opts: IdempotencyOptions,
) => {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const redis = getRedis();

  if (!redis) {
    fastify.log.warn(
      "[Idempotency] Redis not available — idempotency checks disabled",
    );
    return;
  }

  fastify.addHook(
    "preHandler",
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Only apply to mutating methods
      if (!["POST", "PUT", "PATCH"].includes(request.method)) {
        return;
      }

      const idempotencyKey = request.headers[options.headerName] as
        | string
        | undefined;

      // If no key provided, let the request proceed normally
      if (!idempotencyKey) {
        return;
      }

      // Validate key format (must be UUID-like: at least 8 chars, alphanumeric + dashes)
      if (!/^[a-zA-Z0-9-]{8,}$/.test(idempotencyKey)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "INVALID_IDEMPOTENCY_KEY",
            message: `Invalid ${options.headerName} format. Must be at least 8 alphanumeric characters.`,
          },
        });
      }

      const userId = (request as { user?: { id?: string } }).user?.id;
      const storageKey = generateKey(
        options.keyPrefix,
        userId,
        idempotencyKey,
        request.routerPath || request.url,
      );

      try {
        // Check if we have a stored response
        const stored = await redis.get(storageKey);

        if (stored) {
          const parsed = JSON.parse(stored) as StoredResponse;

          fastify.log.info(
            { idempotencyKey, route: request.routerPath },
            "[Idempotency] Returning cached response",
          );

          // Add header to indicate this is a cached response
          reply.header("x-idempotency-cached", "true");
          return reply.status(parsed.statusCode).send(parsed.payload);
        }

        // Store the key in request for postHandler to save response
        (request as { idempotencyStorageKey?: string }).idempotencyStorageKey =
          storageKey;
      } catch (error) {
        fastify.log.error(
          { error, idempotencyKey },
          "[Idempotency] Error checking key",
        );
        // Continue with request even if idempotency check fails
      }
    },
  );

  // Store successful responses for replay
  fastify.addHook(
    "onSend",
    async (request: FastifyRequest, reply: FastifyReply, payload: string) => {
      if (!options.cacheResponses) return payload;

      const storageKey = (request as { idempotencyStorageKey?: string })
        .idempotencyStorageKey;
      if (!storageKey) return payload;

      const statusCode = reply.statusCode;

      // Only cache successful responses (2xx)
      if (statusCode < 200 || statusCode >= 300) {
        return payload;
      }

      try {
        const toStore: StoredResponse = {
          statusCode,
          payload: JSON.parse(payload),
          timestamp: Date.now(),
        };

        await redis.setex(
          storageKey,
          options.ttlSeconds,
          JSON.stringify(toStore),
        );

        fastify.log.debug(
          { storageKey, ttl: options.ttlSeconds },
          "[Idempotency] Response cached",
        );
      } catch (error) {
        fastify.log.error(
          { error, storageKey },
          "[Idempotency] Failed to cache response",
        );
      }

      return payload;
    },
  );
};

