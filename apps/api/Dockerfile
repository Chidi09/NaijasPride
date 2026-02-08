FROM node:20-alpine AS base

# 1. Prune Stage: Isolate the API and its dependencies
FROM base AS builder
WORKDIR /app
RUN npm install -g turbo
COPY . .
# Prunes the workspace to just what 'api' needs
RUN turbo prune --scope=api --docker

# 2. Installer Stage: Install dependencies
FROM base AS installer
WORKDIR /app

# Copy lockfile and package.json's from the pruned stage
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/package-lock.json ./package-lock.json

# Install dependencies from lockfile
RUN npm ci

# Copy the source code
COPY --from=builder /app/out/full/ .

# Build the project (generate Prisma client + compile TS)
RUN npm run build --workspace api

# 3. Runner Stage: Production Image
FROM base AS runner
WORKDIR /app

# Don't run as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 fastify
USER fastify

COPY --from=installer /app .

EXPOSE 3000

CMD ["node", "apps/api/dist/app.js"]
