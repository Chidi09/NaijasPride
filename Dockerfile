# Root Dockerfile — delegates to apps/api/Dockerfile
# This file exists so Docker Compose and other tools that reference the root
# context still work. The actual build logic lives in apps/api/Dockerfile.
#
# DigitalOcean App Platform uses apps/api/Dockerfile directly (set in app.yaml).

FROM node:20-alpine AS base

# ---------------------------------------------------------------------------
# Stage 1: Prune
# ---------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
RUN npm install -g turbo@^2
COPY . .
RUN turbo prune --scope=api --docker

# ---------------------------------------------------------------------------
# Stage 2: Install + Build
# ---------------------------------------------------------------------------
FROM base AS installer
WORKDIR /app
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/package-lock.json ./package-lock.json
RUN npm ci
COPY --from=builder /app/out/full/ .
RUN npm run build --workspace api

# ---------------------------------------------------------------------------
# Stage 3: Runner
# ---------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

RUN apk add --no-cache ffmpeg

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs fastify

COPY --from=installer --chown=fastify:nodejs /app .

RUN mkdir -p /tmp/naijaspride/torrent-downloads \
 && chown -R fastify:nodejs /tmp/naijaspride

USER fastify

EXPOSE 3000
CMD ["node", "apps/api/dist/app.js"]
