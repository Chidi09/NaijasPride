# TV Shows Embed Automation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build end-to-end TV shows support (data model, automated TMDB ingestion, backend APIs, frontend pages, and episode embed playback) without manual admin ingestion.

**Architecture:** Add dedicated TV Prisma models, a TMDB TV sync service (trending + popular + top-rated), and a TV API module that mirrors the existing movies architecture. Reuse the multi-provider embed strategy by extending resolver logic for TV episode URLs, then wire new Angular routes/pages for browse/detail/watch with season/episode selection.

**Tech Stack:** Prisma, Fastify + Zod, Redis caching, TMDB API (axios), Angular 17, shared workspace packages (`@naijaspride/types`, `@naijaspride/validators`).

---

### Task 1: Add TV schema models and relations

**Files:**

- Modify: `apps/api/prisma/schema.prisma`

**Step 1: Write migration-driven schema assertions (failing check)**

```bash
npm run db:migrate:status --workspace api
```

Expected: current migrations applied; no TV tables yet.

**Step 2: Add Prisma models**

Add:

```prisma
model TvShow { ... }
model TvSeason { ... }
model TvEpisode { ... }
model TvWatchHistory { ... }
```

And on `User`:

```prisma
tvWatchHistory TvWatchHistory[]
```

**Step 3: Validate Prisma schema compiles**

```bash
npm run db:generate
```

Expected: Prisma Client generated successfully.

**Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma
git commit -m "feat(api): add tv show domain models"
```

### Task 2: Create SQL migration `0012_tv_shows`

**Files:**

- Create: `apps/api/prisma/migrations/0012_tv_shows/migration.sql`

**Step 1: Write migration SQL**

Include `CREATE TABLE` for `TvShow`, `TvSeason`, `TvEpisode`, `TvWatchHistory`, all indexes, and foreign keys with cascade deletes.

**Step 2: Verify SQL shape against schema**

```bash
npm run db:migrate:status --workspace api
```

Expected: migration listed as pending (locally) and ready for deploy-time apply.

**Step 3: Commit**

```bash
git add apps/api/prisma/migrations/0012_tv_shows/migration.sql
git commit -m "feat(api): add tv shows migration"
```

### Task 3: Add shared TV types

**Files:**

- Create: `packages/shared-types/src/models/tv-show.ts`
- Modify: `packages/shared-types/src/index.ts`
- Modify: `packages/shared-types/src/api/index.ts`

**Step 1: Write failing typecheck**

```bash
npm run typecheck
```

Expected: fail until new exports/interfaces are wired.

**Step 2: Add TV interfaces**

Create interfaces:

```ts
export interface TvEpisode { ... }
export interface TvSeason { episodes: TvEpisode[]; ... }
export interface TvShow { seasons: TvSeason[]; ... }
export interface TvShowSummary { ... }
export interface TvShowSearchParams extends PaginationParams { ... }
```

**Step 3: Export from package entrypoint**

```ts
export * from "./models/tv-show";
```

**Step 4: Re-run typecheck**

```bash
npm run typecheck
```

Expected: shared-types package passes.

**Step 5: Commit**

```bash
git add packages/shared-types/src/models/tv-show.ts packages/shared-types/src/index.ts packages/shared-types/src/api/index.ts
git commit -m "feat(types): add tv show contracts"
```

### Task 4: Add shared TV validators

**Files:**

- Create: `packages/shared-validators/src/tv-show.schema.ts`
- Modify: `packages/shared-validators/src/index.ts`

**Step 1: Write failing usage import in route stub (temporary)**

```ts
import { tvShowSearchSchema } from "@naijaspride/validators";
```

Expected: unresolved export before implementation.

**Step 2: Implement validator schemas**

Add:

```ts
export const tvShowSearchSchema = z.object({ ... });
export const tvEmbedQuerySchema = z.object({ season: z.coerce.number().int().min(1), episode: z.coerce.number().int().min(1) });
```

**Step 3: Export validators**

```ts
export * from "./tv-show.schema";
```

**Step 4: Build validators package**

```bash
npm run build --workspace @naijaspride/validators
```

Expected: successful build.

**Step 5: Commit**

```bash
git add packages/shared-validators/src/tv-show.schema.ts packages/shared-validators/src/index.ts
git commit -m "feat(validators): add tv show query schemas"
```

### Task 5: Build TMDB TV metadata + sync service

**Files:**

- Create: `apps/api/src/modules/tv-shows/tv-tmdb-sync.service.ts`

**Step 1: Write failing minimal test harness command (build-time)**

```bash
npm run build --workspace api
```

Expected: fail until service/module imports resolve.

**Step 2: Implement TMDB sync service**

Implement methods:

```ts
syncCatalog(): Promise<{ scanned: number; upserted: number; failed: number }>;
private fetchDiscoveryIds(): Promise<number[]>;
private upsertShowByTmdbId(tmdbId: number): Promise<void>;
```

Requirements:

- use `TMDB_API_KEY` with fallback `TMDB_KEY`
- fetch trending/popular/top-rated lists
- dedupe tmdb ids
- upsert show, season, episodes idempotently

**Step 3: Re-run build**

```bash
npm run build --workspace api
```

Expected: passes for service file compilation.

**Step 4: Commit**

```bash
git add apps/api/src/modules/tv-shows/tv-tmdb-sync.service.ts
git commit -m "feat(api): add automated tmdb tv sync service"
```

### Task 6: Build TV service and mapping layer

**Files:**

- Create: `apps/api/src/modules/tv-shows/tv-shows.service.ts`

**Step 1: Add failing imports in routes file stub**

```ts
import { TvShowsService } from "./tv-shows.service";
```

Expected: unresolved until file exists.

**Step 2: Implement service methods**

Methods:

```ts
search(params);
findBySlug(slug);
resolveEpisode(slug, season, episode);
saveProgress(userId, payload);
```

Include Redis caching pattern aligned with `movies.service.ts`.

**Step 3: Re-run build**

```bash
npm run build --workspace api
```

Expected: compilation success.

**Step 4: Commit**

```bash
git add apps/api/src/modules/tv-shows/tv-shows.service.ts
git commit -m "feat(api): add tv shows domain service"
```

### Task 7: Extend embed resolver for TV mode

**Files:**

- Modify: `apps/api/src/modules/movies/embed-resolver.service.ts`

**Step 1: Write failing type usage for TV params**

```ts
resolveTv(imdbId, tmdbId, season, episode);
```

Expected: missing method before implementation.

**Step 2: Implement TV resolver path**

Add `resolveTv(...)` that maps providers to TV URL templates and validates positive season/episode.

**Step 3: Verify movie behavior remains intact**

Run:

```bash
npm run build --workspace api
```

Expected: existing movie consumers compile unchanged.

**Step 4: Commit**

```bash
git add apps/api/src/modules/movies/embed-resolver.service.ts
git commit -m "feat(api): add tv episode embed provider resolution"
```

### Task 8: Add TV routes module

**Files:**

- Create: `apps/api/src/modules/tv-shows/tv-shows.routes.ts`
- Modify: `apps/api/src/app.ts`

**Step 1: Implement route handlers**

Add endpoints:

- `GET /api/v1/tv-shows`
- `GET /api/v1/tv-shows/:slug`
- `GET /api/v1/tv-shows/:slug/embeds?season=&episode=`
- `POST /api/v1/tv-shows/sync` (admin)
- `POST /api/v1/watch/tv-progress`

**Step 2: Register routes in server**

```ts
await app.register(tvShowRoutes, { prefix: `${apiPrefix}/tv-shows` });
```

**Step 3: Build API**

```bash
npm run build --workspace api
```

Expected: route registration and imports resolve.

**Step 4: Commit**

```bash
git add apps/api/src/modules/tv-shows/tv-shows.routes.ts apps/api/src/app.ts
git commit -m "feat(api): add tv show endpoints and route wiring"
```

### Task 9: Add automated scheduler wiring

**Files:**

- Modify: `apps/api/src/app.ts`

**Step 1: Add env-driven scheduler block**

Pattern-match existing schedulers (`setInterval` + `setTimeout`) and add TV sync scheduler.

**Step 2: Verify compile**

```bash
npm run build --workspace api
```

Expected: scheduler compiles and logs clearly.

**Step 3: Commit**

```bash
git add apps/api/src/app.ts
git commit -m "feat(api): add scheduled tmdb tv catalog sync"
```

### Task 10: Add frontend TV API service and query layer

**Files:**

- Create: `apps/web/src/app/features/tv-shows/services/tv-shows-api.service.ts`
- Create: `apps/web/src/app/features/tv-shows/services/tv-shows-query.service.ts`

**Step 1: Add failing route/component imports**

Expected: unresolved files before implementation.

**Step 2: Implement API methods**

Methods:

```ts
list(params);
getBySlug(slug);
getEmbeds(slug, season, episode);
saveProgress(payload);
```

**Step 3: Build web app**

```bash
npm run build:fast --workspace web
```

Expected: services compile.

**Step 4: Commit**

```bash
git add apps/web/src/app/features/tv-shows/services/tv-shows-api.service.ts apps/web/src/app/features/tv-shows/services/tv-shows-query.service.ts
git commit -m "feat(web): add tv shows data services"
```

### Task 11: Add TV listing/detail/watch pages

**Files:**

- Create: `apps/web/src/app/features/tv-shows/pages/tv-shows-list/tv-shows-list.component.ts`
- Create: `apps/web/src/app/features/tv-shows/pages/tv-show-detail/tv-show-detail.component.ts`
- Create: `apps/web/src/app/features/tv-shows/pages/tv-watch-room/tv-watch-room.component.ts`
- Create: `apps/web/src/app/features/tv-shows/components/tv-show-card/tv-show-card.component.ts`

**Step 1: Build list page with cards + pagination**

Use existing movie cards UX patterns for consistency.

**Step 2: Build detail page with season + episode selectors**

Default selection logic:

- first season with episodes
- first episode in selected season

**Step 3: Build watch page with shared embed player**

Pass `contentType='tv'`, `seasonNumber`, `episodeNumber` to embed component.

**Step 4: Build web**

```bash
npm run build:fast --workspace web
```

Expected: tv pages compile and route lazily.

**Step 5: Commit**

```bash
git add apps/web/src/app/features/tv-shows
git commit -m "feat(web): add tv shows browse detail and watch pages"
```

### Task 12: Wire app routes for TV shows

**Files:**

- Modify: `apps/web/src/app/app.routes.ts`

**Step 1: Add TV route tree**

```ts
{
  path: 'tv-shows',
  canActivate: [authGuard],
  children: [
    { path: '', ... },
    { path: ':slug', ... },
    { path: ':slug/watch', ... },
  ]
}
```

**Step 2: Build web**

```bash
npm run build:fast --workspace web
```

Expected: route tree compiles.

**Step 3: Commit**

```bash
git add apps/web/src/app/app.routes.ts
git commit -m "feat(web): add tv shows routing"
```

### Task 13: Add TV progress persistence flow

**Files:**

- Modify: `apps/web/src/app/shared/components/embed-player/embed-player.component.ts`
- Modify: `apps/api/src/modules/users/watch.routes.ts` or `apps/api/src/modules/tv-shows/tv-shows.routes.ts`

**Step 1: Add TV progress payload contract**

Include `showId`, `episodeId`, `seasonNumber`, `episodeNumber`, `progress`, `duration`.

**Step 2: Wire frontend progress posting for TV content type**

Re-use existing debounce save behavior.

**Step 3: Verify API + web builds**

```bash
npm run build --workspace api
npm run build:fast --workspace web
```

Expected: both builds pass.

**Step 4: Commit**

```bash
git add apps/web/src/app/shared/components/embed-player/embed-player.component.ts apps/api/src/modules/users/watch.routes.ts apps/api/src/modules/tv-shows/tv-shows.routes.ts
git commit -m "feat: persist tv watch progress"
```

### Task 14: Remove unused Vidking player component

**Files:**

- Delete: `apps/web/src/app/shared/components/vidking-player/vidking-player.component.ts`
- Modify any remaining imports/references if present

**Step 1: Search for references**

```bash
npm run build:fast --workspace web
```

Expected: fail if references remain.

**Step 2: Remove component and references**

Delete file and clean imports.

**Step 3: Rebuild web**

```bash
npm run build:fast --workspace web
```

Expected: passes.

**Step 4: Commit**

```bash
git add -A
git commit -m "chore(web): remove unused vidking player component"
```

### Task 15: Full verification and deployment

**Files:**

- Modify: `.env.example` (if adding TV sync env docs)
- Verify runtime via existing deployment scripts

**Step 1: Run local verification commands**

```bash
npm run build --workspace @naijaspride/types
npm run build --workspace @naijaspride/validators
npm run build --workspace api
npm run build:fast --workspace web
```

Expected: all pass.

**Step 2: Deploy on VPS (blue/green)**

```bash
ssh naijaspride
docker builder prune -af && docker image prune -af
bash /opt/naijaspride/deploy.sh
docker ps
```

Expected: successful deploy, health checks pass, active stack flips.

**Step 3: Smoke test production endpoints**

- `GET /api/v1/tv-shows`
- `GET /api/v1/tv-shows/:slug`
- `GET /api/v1/tv-shows/:slug/embeds?season=1&episode=1`
- frontend `/tv-shows` browse/detail/watch flow

**Step 4: Final commit (if env/docs updated)**

```bash
git add .env.example docs/plans/2026-03-09-tv-shows-embed-automation-implementation.md
git commit -m "docs: add tv shows implementation and env notes"
```
