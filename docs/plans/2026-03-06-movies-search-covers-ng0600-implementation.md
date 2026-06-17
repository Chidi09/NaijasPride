# Movies Search UX, Cover Fallbacks, and NG0600 Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade movie discovery UX (clean filter/search with preview dropdown), harden poster fallback behavior when TMDB is missing art, and remove the recurring NG0600 runtime errors.

**Architecture:** Keep the existing `/api/v1/movies` search endpoint as the single source of truth, add lightweight query-driven preview in the filter bar, and improve metadata enrichment with layered poster fallbacks (TMDB -> OMDb). Fix NG0600 at source by allowing signal writes in effect blocks that call `hydrateSavedState()`.

**Tech Stack:** Angular 17 signals + standalone components, Fastify + Prisma API, TMDB + OMDb integrations.

---

### Task 1: Root-Cause Runtime Error (NG0600)

**Files:**

- Modify: `apps/web/src/app/features/movies/components/movie-card/movie-card.component.ts`
- Modify: `apps/web/src/app/features/movies/components/movie-card-youtube/movie-card-youtube.component.ts`

**Step 1: Confirm root cause**

Observed stack references `hydrateSavedState` from movie card chunks. Both components call `saved.set(...)` inside `effect(...)` without `allowSignalWrites`.

**Step 2: Apply minimal fix**

Set effect options to allow signal writes:

```ts
effect(
  () => {
    this.hydrateSavedState();
  },
  { allowSignalWrites: true },
);
```

**Step 3: Verify no type/build regressions**

Run: `npm run build --workspace web`

---

### Task 2: Clean Movie Search/Filter UX + Poster Preview Dropdown

**Files:**

- Modify: `apps/web/src/app/features/movies/components/filter-bar/filter-bar.component.ts`
- Modify: `apps/web/src/app/features/movies/services/movies-api.service.ts`

**Step 1: Add search suggestion data flow**

Add a helper method in API service for small suggestion result sets using existing `/api/v1/movies` endpoint (e.g. `limit=6`, `sortBy=popular`).

**Step 2: Add debounced preview in filter bar**

Enhance filter bar to:

- debounce typing,
- fetch suggestions for `q.length >= 2`,
- display poster/thumbnail + title/year in a clean dropdown,
- close dropdown on escape/click outside,
- allow click/enter to navigate to movie detail.

**Step 3: Keep existing list filtering intact**

Continue emitting `filterChange` so current page filtering works as before.

**Step 4: Improve visual polish**

Refine spacing, border, and density for cleaner “streaming-style” filter bar while preserving existing brand language.

**Step 5: Verify no build regressions**

Run: `npm run build --workspace web`

---

### Task 3: Remove Misleading `% Match` Badge Logic

**Files:**

- Modify: `apps/web/src/app/features/movies/components/movie-card/movie-card.component.ts`
- Modify: `apps/web/src/app/features/movies/components/movie-card-youtube/movie-card-youtube.component.ts`

**Step 1: Remove or replace incorrect “match” semantics**

Because no personalized recommendation model exists, `% Match` is misleading.

**Step 2: Use neutral metadata chip**

Replace with neutral info (e.g. year/genre/quality) or hide when no reliable metric exists.

**Step 3: Verify visual consistency**

Run: `npm run build --workspace web`

---

### Task 4: Poster Fallback Strategy When TMDB Has No Image

**Files:**

- Modify: `apps/api/src/modules/movies/metadata.service.ts`
- (If required) Modify: `apps/api/src/modules/admin/services/tmdb-metadata.service.ts`

**Step 1: Add structured fallback chain**

For metadata enrichment:

- primary: TMDB poster/backdrop,
- fallback: OMDb `Poster` using `imdb_id` + `OMDB_KEY`.

**Step 2: Only persist valid fallback URLs**

Ignore `N/A`, blank, or malformed URLs.

**Step 3: Verify API build**

Run: `npm run build --workspace api`

---

### Task 5: Verification and Deployment

**Files:**

- No code changes required

**Step 1: Local verification**

Run:

- `npm run build --workspace web`
- `npm run build --workspace api`

**Step 2: Deploy API to VPS**

Run blue/green deploy script and verify `/api/v1/health`.

**Step 3: Validate user flows**

Smoke-check:

- movie list filter bar + dropdown suggestions,
- movie cards render without `% Match` noise,
- no NG0600 spam during page interactions.
