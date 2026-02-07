FROM node:20-alpine AS base
# Enable pnpm via Corepack (included in Node 20)
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# 1. Prune Stage: Isolate the API and its dependencies
FROM base AS builder
WORKDIR /app
RUN pnpm add -g turbo
COPY . .
# Prunes the workspace to just what 'api' needs
RUN turbo prune --scope=api --docker

# 2. Installer Stage: Install dependencies
FROM base AS installer
WORKDIR /app

# Copy lockfile and package.json's from the pruned stage
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

# Install dependencies (frozen-lockfile ensures strict versioning)
RUN pnpm install --frozen-lockfile

# Copy the source code
COPY --from=builder /app/out/full/ .

# Build the project (generate Prisma client + compile TS)
RUN pnpm turbo run build --filter=api

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