# =============================================================================
# NaijasPride — Production Dockerfile
# Single image for API server + workers (different CMD per service)
# =============================================================================
# Build: docker compose build
# Run:   docker compose up -d
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Prune — isolate the api package and its workspace dependencies
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g turbo@^2

COPY . .

# Produces /app/out/json/ (package.jsons + lockfile) and /app/out/full/ (source)
RUN turbo prune --scope=api --docker

# tsconfig.base.json lives at repo root — turbo prune doesn't include it
RUN cp tsconfig.base.json out/full/tsconfig.base.json

# ---------------------------------------------------------------------------
# Stage 2: Install + Build — all TypeScript compiled here
# ---------------------------------------------------------------------------
FROM node:20-alpine AS installer
WORKDIR /app

# Copy pruned package manifests + lockfile (layer cached)
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/package-lock.json ./package-lock.json
RUN npm install --legacy-peer-deps

# Copy full pruned source (includes tsconfig.base.json)
COPY --from=builder /app/out/full/ .

# Build shared packages first (they produce dist/ that the API imports)
RUN npm run build --workspace @naijaspride/types
RUN npm run build --workspace @naijaspride/validators
RUN npm run build --workspace @naijaspride/utils || true

# Build API: runs prisma generate (prebuild) then tsc + tsc-alias
RUN npm run build --workspace api

# Copy non-TS assets (Handlebars templates, etc.) into dist/ so they're
# available at runtime via __dirname-relative paths
RUN cp -r apps/api/src/modules/wrapped/templates apps/api/dist/modules/wrapped/templates

# ---------------------------------------------------------------------------
# Stage 3: Runner — production image
# ---------------------------------------------------------------------------
# Using bookworm-slim (Debian) instead of Alpine because:
# - Playwright Chromium requires glibc + system libs (not available on musl/Alpine)
# - ffmpeg from Debian repos is more stable for HLS transcoding
FROM node:20-bookworm-slim AS runner
WORKDIR /app

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      curl \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs appuser

# Copy built app from installer
COPY --from=installer --chown=appuser:nodejs /app .

# Install Playwright Chromium + system deps (must run as root)
RUN npx playwright install chromium --with-deps \
 && rm -rf /tmp/* /root/.cache

# Temp dir for torrent downloads
RUN mkdir -p /tmp/naijaspride/torrent-downloads \
 && chown -R appuser:nodejs /tmp/naijaspride

USER appuser

EXPOSE 3000

# Default: run the API server. Workers override this via docker-compose command.
CMD ["node", "apps/api/dist/app.js"]
