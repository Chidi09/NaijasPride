# =============================================================================
# NaijasPride API — Dockerfile
# Multi-stage build for DigitalOcean App Platform
# =============================================================================
# Stages:
#   builder   → prune the Turborepo monorepo to just API deps
#   installer → npm ci + TypeScript compile + Prisma client generate
#   runner    → lean production image with ffmpeg for the torrent worker
# =============================================================================

FROM node:20-alpine AS base

# ---------------------------------------------------------------------------
# Stage 1: Prune — isolate the api package and its workspace dependencies
# ---------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
RUN npm install -g turbo@^2
COPY . .
# Produces /app/out/json/ (package.jsons + lockfile) and /app/out/full/ (source)
RUN turbo prune --scope=api --docker

# ---------------------------------------------------------------------------
# Stage 2: Install — npm ci + compile TypeScript + generate Prisma client
# ---------------------------------------------------------------------------
FROM base AS installer
WORKDIR /app

# Copy pruned package manifests + lockfile first so Docker layer-caches deps
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/package-lock.json ./package-lock.json
RUN npm ci

# Copy full pruned source
COPY --from=builder /app/out/full/ .

# Build: generates Prisma client (prebuild) then compiles TS → dist/
RUN npm run build --workspace api

# ---------------------------------------------------------------------------
# Stage 3: Runner — minimal production image
# ---------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

# ffmpeg is required by the torrent worker for HLS packaging + MKV transcoding.
# If you're not using the torrent worker, you can remove this line to save ~40 MB.
RUN apk add --no-cache ffmpeg

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs fastify

# Copy the fully-built app from the installer stage
COPY --from=installer --chown=fastify:nodejs /app .

# Create the temp download directory used by the torrent worker.
# Must be owned by the app user so it can write downloads at runtime.
RUN mkdir -p /tmp/naijaspride/torrent-downloads \
 && chown -R fastify:nodejs /tmp/naijaspride

USER fastify

# DO App Platform injects $PORT; Fastify reads process.env.PORT in app.ts
EXPOSE 3000

# Default command — the API server.
# Worker services in app.yaml override this with their own run_command.
CMD ["node", "apps/api/dist/app.js"]
