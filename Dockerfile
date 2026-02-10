FROM node:20-alpine AS base

# 1) Prune the monorepo to only API deps
FROM base AS builder
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune --scope=api --docker

# 2) Install deps and build API
FROM base AS installer
WORKDIR /app
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/package-lock.json ./package-lock.json
RUN npm ci
COPY --from=builder /app/out/full/ .
RUN npm run build --workspace api

# 3) Runtime image
FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 fastify
USER fastify
COPY --from=installer /app .
EXPOSE 3000
CMD ["node", "apps/api/dist/app.js"]
