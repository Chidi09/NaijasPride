# =============================================================================
# NaijasPride API — Dockerfile
# Multi-stage build for DigitalOcean App Platform
# =============================================================================
# Stages:
#   builder   → prune the Turborepo monorepo to just API deps
#   installer → npm install + TypeScript compile + Prisma client generate
#   runner    → lean production image with ffmpeg + Playwright Chromium
# =============================================================================

FROM node:20-alpine AS base
# Playwright requires a glibc-based OS (Debian/Ubuntu). We use node:20-slim
# for the runner stage only. Alpine is fine for builder + installer stages.
FROM node:20-slim AS runner-base

# ---------------------------------------------------------------------------
# Stage 1: Prune — isolate the api package and its workspace dependencies
# ---------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
RUN npm install -g turbo@^2
COPY . .
# Produces /app/out/json/ (package.jsons + lockfile) and /app/out/full/ (source)
RUN turbo prune --scope=api --docker
# tsconfig.base.json is at repo root, outside turbo prune output.
# Copy it into out/full/ so the installer stage can access it.
RUN cp tsconfig.base.json out/full/tsconfig.base.json

# ---------------------------------------------------------------------------
# Stage 2: Install — npm install + compile TypeScript + generate Prisma client
# ---------------------------------------------------------------------------
FROM base AS installer
WORKDIR /app

# Copy pruned package manifests + lockfile first so Docker layer-caches deps
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/package-lock.json ./package-lock.json
RUN npm install --legacy-peer-deps

# Copy full pruned source (includes tsconfig.base.json added in builder stage)
COPY --from=builder /app/out/full/ .

# Build shared packages first so their dist/ exists when the API compiles.
# These extend ../../tsconfig.base.json so the COPY above is required.
RUN npm run build --workspace @naijaspride/types
RUN npm run build --workspace @naijaspride/validators
RUN npm run build --workspace @naijaspride/utils || true

# Build API: generates Prisma client (prebuild) then compiles TS → dist/
RUN npm run build --workspace api

# ---------------------------------------------------------------------------
# Stage 3: Runner — production image (Debian slim for Playwright compatibility)
# ---------------------------------------------------------------------------
FROM runner-base AS runner
WORKDIR /app

# ffmpeg is required by the torrent worker for HLS packaging + MKV transcoding.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

# Non-root user for security
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs fastify

# Copy the fully-built app from the installer stage
COPY --from=installer --chown=fastify:nodejs /app .

# Install Playwright's Chromium browser + its OS-level dependencies.
# Must run as root (before USER fastify) so apt-get can install system libs.
RUN node_modules/.bin/playwright install chromium --with-deps

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
