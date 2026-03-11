# Anime Discovery Rails Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the default anime flat grid with curated discovery rails and a cleaner search-results flow.

**Architecture:** Keep AniList as source and issue intent-based search queries per rail from the web app service. Build a sectioned rails UI in the anime list page, with independent loading/error states and a separate search results mode. Reuse existing anime card metadata and routing patterns to minimize risk.

**Tech Stack:** Angular standalone components, RxJS, existing `AnimeApiService`, Fastify anime search endpoint.

---

### Task 1: Define rail query model in web service

**Files:**
- Modify: `apps/web/src/app/features/anime/services/anime-api.service.ts`
- Test: `apps/web/src/app/features/anime/services/anime-api.service.spec.ts` (create if missing)

**Step 1: Write the failing test**

Add tests for:
- `getDiscoveryRails()` issues query requests for `TRENDING_DESC`, `POPULARITY_DESC`, `SCORE_DESC`, seasonal query, and classics query.
- `search()` stays unchanged for explicit search mode.

**Step 2: Run test to verify it fails**

Run: `npm run test --workspace web -- anime-api.service.spec.ts`
Expected: FAIL because `getDiscoveryRails()` does not exist.

**Step 3: Write minimal implementation**

Add typed rail helper methods to `AnimeApiService`:
- `getDiscoveryRails()` returning `forkJoin` of rail calls.
- Private helper for search params per rail.

**Step 4: Run test to verify it passes**

Run: `npm run test --workspace web -- anime-api.service.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/app/features/anime/services/anime-api.service.ts apps/web/src/app/features/anime/services/anime-api.service.spec.ts
git commit -m "feat(anime): add discovery rail query helpers"
```

### Task 2: Build curated rails state in anime list component

**Files:**
- Modify: `apps/web/src/app/features/anime/pages/anime-list/anime-list.component.ts`
- Test: `apps/web/src/app/features/anime/pages/anime-list/anime-list.component.spec.ts` (create if missing)

**Step 1: Write the failing test**

Add tests for component behavior:
- default load calls rails fetch and renders rail sections
- entering search switches to search mode and hides rails
- clearing search returns to rails mode

**Step 2: Run test to verify it fails**

Run: `npm run test --workspace web -- anime-list.component.spec.ts`
Expected: FAIL because rails/search-mode state is missing.

**Step 3: Write minimal implementation**

In component class add:
- `mode` signal: `rails | search`
- rail state map with per-rail loading/error/items
- `loadDiscoveryRails()` and `runSearch()` mode-aware behavior
- search reset method (clear query back to rails)

**Step 4: Run test to verify it passes**

Run: `npm run test --workspace web -- anime-list.component.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/app/features/anime/pages/anime-list/anime-list.component.ts apps/web/src/app/features/anime/pages/anime-list/anime-list.component.spec.ts
git commit -m "feat(anime): add discovery rails and search mode state"
```

### Task 3: Implement Crunchyroll-style rails UI

**Files:**
- Modify: `apps/web/src/app/features/anime/pages/anime-list/anime-list.component.ts` (inline template)

**Step 1: Write the failing test**

Add view assertions in component spec:
- default page shows headings for rails (Trending Now, New This Season, Most Popular, Top Rated, Classics)
- each rail renders horizontal card list
- per-rail skeleton while loading and retry button on rail error

**Step 2: Run test to verify it fails**

Run: `npm run test --workspace web -- anime-list.component.spec.ts`
Expected: FAIL because template does not include rail sections.

**Step 3: Write minimal implementation**

Update template:
- compact hero and search
- sectioned rails with horizontal overflow and snap
- `View all` link/button per rail (wired to search mode with prefilled sort intent)
- remove giant aggregate result count from default mode

**Step 4: Run test to verify it passes**

Run: `npm run test --workspace web -- anime-list.component.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/app/features/anime/pages/anime-list/anime-list.component.ts apps/web/src/app/features/anime/pages/anime-list/anime-list.component.spec.ts
git commit -m "feat(anime): redesign library as curated discovery rails"
```

### Task 4: Add dedupe and rail-level resiliency

**Files:**
- Modify: `apps/web/src/app/features/anime/pages/anime-list/anime-list.component.ts`
- Test: `apps/web/src/app/features/anime/pages/anime-list/anime-list.component.spec.ts`

**Step 1: Write the failing test**

Add tests for:
- deduping repeated anime IDs in lower-priority rails
- one rail error does not block others
- retry only refreshes target rail

**Step 2: Run test to verify it fails**

Run: `npm run test --workspace web -- anime-list.component.spec.ts`
Expected: FAIL because dedupe and isolated retry are missing.

**Step 3: Write minimal implementation**

Implement:
- stable dedupe function by ID with rail priority order
- per-rail `reloadRail(key)` method
- isolated error display and retry controls

**Step 4: Run test to verify it passes**

Run: `npm run test --workspace web -- anime-list.component.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/app/features/anime/pages/anime-list/anime-list.component.ts apps/web/src/app/features/anime/pages/anime-list/anime-list.component.spec.ts
git commit -m "fix(anime): isolate rail failures and dedupe repeated titles"
```

### Task 5: Verify mobile/desktop behavior and build

**Files:**
- Modify (if needed): `apps/web/src/app/features/anime/pages/anime-list/anime-list.component.ts`

**Step 1: Run targeted tests**

Run: `npm run test --workspace web -- anime-list.component.spec.ts anime-api.service.spec.ts`
Expected: PASS.

**Step 2: Run web build**

Run: `npm run build:fast --workspace web`
Expected: SUCCESS build.

**Step 3: Manual verification checklist**

- `/anime` opens curated rails by default
- search still works and displays focused results
- cards navigate correctly to `/anime/:id`
- rails are swipeable on mobile width
- no visual overlap with navbar/footer/side panel

**Step 4: Commit final polish**

```bash
git add apps/web/src/app/features/anime/pages/anime-list/anime-list.component.ts apps/web/src/app/features/anime/services/anime-api.service.ts apps/web/src/app/features/anime/pages/anime-list/anime-list.component.spec.ts apps/web/src/app/features/anime/services/anime-api.service.spec.ts
git commit -m "feat(anime): ship crunchyroll-style discovery rails experience"
```
