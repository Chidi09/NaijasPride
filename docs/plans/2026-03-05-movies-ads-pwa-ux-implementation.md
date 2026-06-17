# Movies, Ads, and PWA UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver premium-aware ads, correct movie feed ordering, mobile-first quick actions, and progress-rich cards across movies/books with end-to-end dummy-user verification.

**Architecture:** Add a centralized frontend ad policy gate driven by premium state, extend movie API feed semantics for latest/trending/new sections, and standardize card interaction/progress behavior across devices. Keep existing watch/book history endpoints as the source of truth and wire UI state from those APIs.

**Tech Stack:** Fastify + Prisma (API), Angular 17 standalone (web/PWA), BullMQ workers, Redis, AdSense script loader, EffectiveGate script/link integrations.

---

### Task 1: Add centralized ad policy + script loaders (premium gate)

**Files:**

- Create: `apps/web/src/app/core/services/ad-policy.service.ts`
- Create: `apps/web/src/app/core/services/ad-script.service.ts`
- Modify: `apps/web/src/app/core/auth/auth-state.service.ts`
- Modify: `apps/web/src/app/app.component.ts`
- Modify: `apps/web/src/app/shared/components/ad-banner/ad-banner.component.ts`

**Step 1: Write failing tests/spec stubs (or component harness checks)**

- Create/extend lightweight specs for:
  - non-premium -> `canShowAds = true`
  - premium -> `canShowAds = false`
  - script loader idempotency (no duplicate inserts)

**Step 2: Run targeted tests to confirm failure**

- Run: `npm run test --workspace web -- --watch=false --browsers=ChromeHeadless`
- Expected: failing assertions for missing policy/loader behavior.

**Step 3: Implement ad policy service**

- Derive `isPremium` from auth user state.
- Expose `canShowAds()` signal/computed.

**Step 4: Implement global ad script service**

- AdSense auto ads script:
  - `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2568728658832536`
- EffectiveGate 320x50 config injection for non-premium slots.
- Guard against duplicate script/tag insertion.

**Step 5: Wire app shell and banners**

- Load scripts only when `canShowAds=true`.
- Ensure premium never receives any ad script/slot rendering.

**Step 6: Re-run tests**

- Run: `npm run test --workspace web -- --watch=false --browsers=ChromeHeadless`
- Expected: policy/loader tests pass.

**Step 7: Commit**

```bash
git add apps/web/src/app/core/services/ad-policy.service.ts apps/web/src/app/core/services/ad-script.service.ts apps/web/src/app/core/auth/auth-state.service.ts apps/web/src/app/app.component.ts apps/web/src/app/shared/components/ad-banner/ad-banner.component.ts
git commit -m "feat(ads): centralize premium ad policy and global script loading"
```

### Task 2: Add EffectiveGate Smartlink + 320x50 slot component safely

**Files:**

- Create: `apps/web/src/app/shared/components/effectivegate-banner/effectivegate-banner.component.ts`
- Modify: `apps/web/src/app/features/movies/pages/watch-room/watch-room.component.ts`
- Modify: `apps/web/src/app/features/movies/pages/movie-detail/movie-detail.component.ts`

**Step 1: Write failing component behavior checks**

- Banner renders only when non-premium.
- Smartlink applies only to configured outbound links (not Angular router internal links).

**Step 2: Implement slot component**

- Use provided config:
  - key: `efea465d4fdc9eabe553fbaecd0c4948`
  - format: `iframe`, width `320`, height `50`
- Body placement only.

**Step 3: Implement Smartlink hook points**

- Add designated outbound CTA usage for non-premium:
  - `https://www.effectivegatecpm.com/qm7irj9i?key=106d46d6ef4f93102f2d54643357b11c`
- Keep navigation-safe behavior on internal routes.

**Step 4: Validate visually in dev build**

- Run: `npm run build --workspace web -- --configuration development`
- Expected: successful build, no template/runtime errors.

**Step 5: Commit**

```bash
git add apps/web/src/app/shared/components/effectivegate-banner/effectivegate-banner.component.ts apps/web/src/app/features/movies/pages/watch-room/watch-room.component.ts apps/web/src/app/features/movies/pages/movie-detail/movie-detail.component.ts
git commit -m "feat(ads): add EffectiveGate smartlink and 320x50 slot for non-premium"
```

### Task 3: Fix movie feed semantics (Latest Uploads, Trending 7d, New 2025-2026)

**Files:**

- Modify: `apps/api/src/modules/movies/movies.routes.ts`
- Modify: `apps/api/src/modules/movies/movies.service.ts`
- Modify: `apps/web/src/app/features/movies/pages/movies-editorial-landing/movies-editorial-landing.component.ts`

**Step 1: Write failing API-level checks (scripted integration assertions)**

- Verify latest uploads are `status=active` + non-empty `fileUrls` ordered by `updatedAt desc`.
- Verify trending uses recent watch activity window with fallback.
- Verify new section prefers year 2025-2026.

**Step 2: Implement backend feed query helpers**

- Add query methods for:
  - `latestUploads`
  - `trendingRecent`
  - `newReleases`
- Preserve existing response compatibility where needed.

**Step 3: Wire frontend sections**

- Replace current “trending from mostWatched slice” behavior.
- Add/rename rows to reflect true section meaning.

**Step 4: Validate API + web build**

- Run: `npm run build --workspace api`
- Run: `npm run build --workspace web -- --configuration development`

**Step 5: Commit**

```bash
git add apps/api/src/modules/movies/movies.routes.ts apps/api/src/modules/movies/movies.service.ts apps/web/src/app/features/movies/pages/movies-editorial-landing/movies-editorial-landing.component.ts
git commit -m "feat(movies): add latest uploads, recent trending, and new releases feeds"
```

### Task 4: Fix star/watchlist UX + mobile long-press quick actions

**Files:**

- Modify: `apps/web/src/app/features/movies/components/movie-card/movie-card.component.ts`
- Modify: `apps/web/src/app/features/movies/components/movie-card-youtube/movie-card-youtube.component.ts`
- Modify: `apps/web/src/app/features/profile/services/profile-query.service.ts`
- Optional create: `apps/web/src/app/shared/components/quick-action-sheet/quick-action-sheet.component.ts`

**Step 1: Write failing interaction checks**

- Star action accessible without hover.
- Long-press opens quick-action sheet on touch devices.
- Saved state initializes from profile watchlist.

**Step 2: Implement star state hydration + optimistic rollback**

- Pull watchlist IDs from profile query.
- On mutation failure, revert local state and show toast.

**Step 3: Implement long-press quick actions**

- Actions: Star, Watch/Download, Details.
- Keep desktop/TV hover/focus behavior.

**Step 4: Validate via build**

- Run: `npm run build --workspace web -- --configuration development`

**Step 5: Commit**

```bash
git add apps/web/src/app/features/movies/components/movie-card/movie-card.component.ts apps/web/src/app/features/movies/components/movie-card-youtube/movie-card-youtube.component.ts apps/web/src/app/features/profile/services/profile-query.service.ts apps/web/src/app/shared/components/quick-action-sheet/quick-action-sheet.component.ts
git commit -m "fix(ux): make watchlist reliable and add mobile long-press quick actions"
```

### Task 5: Add progress bars to movie and book-related cards

**Files:**

- Modify: `apps/web/src/app/features/movies/pages/movie-list/movie-list.component.ts`
- Modify: `apps/web/src/app/features/home/home.component.ts`
- Modify: `apps/web/src/app/features/books/pages/books-editorial-landing/books-editorial-landing.component.ts`
- Modify: relevant book card components used on landing/library pages

**Step 1: Write failing UI data-flow checks**

- Progress map generated from movie watch history endpoint.
- Book progress map generated from book progress/history endpoints.

**Step 2: Implement progress mapping utilities**

- Build maps keyed by movie/book ids/slugs.
- Pass progress into cards and render bars when >0.

**Step 3: Validate with authenticated dummy data**

- Use seeded or dummy user with known progress records.

**Step 4: Run build/tests**

- Run: `npm run build --workspace web -- --configuration development`

**Step 5: Commit**

```bash
git add apps/web/src/app/features/movies/pages/movie-list/movie-list.component.ts apps/web/src/app/features/home/home.component.ts apps/web/src/app/features/books/pages/books-editorial-landing/books-editorial-landing.component.ts
git commit -m "feat(progress): render movie and book progress bars on content cards"
```

### Task 6: Remove grayscale/dull tint across app imagery

**Files:**

- Modify: `apps/web/src/app/features/books/pages/books-editorial-landing/books-editorial-landing.component.ts`
- Modify: `apps/web/src/app/features/movies/pages/movies-editorial-landing/movies-editorial-landing.component.ts`
- Modify: `apps/web/src/app/pages/landing/editorial-landing.component.ts`
- Modify: `apps/web/src/app/features/music/pages/music-editorial-landing/music-editorial-landing.component.ts`
- Modify: any shared card styles with grayscale/low-opacity image filters

**Step 1: Remove grayscale classes and excessive opacity overlays**

- Replace `grayscale` image treatments with full-color defaults.
- Reduce heavy dark overlays to readability-only levels.

**Step 2: Responsive visual sanity check**

- Mobile, desktop, and TV breakpoints.

**Step 3: Build**

- Run: `npm run build --workspace web -- --configuration development`

**Step 4: Commit**

```bash
git add apps/web/src/app/features/books/pages/books-editorial-landing/books-editorial-landing.component.ts apps/web/src/app/features/movies/pages/movies-editorial-landing/movies-editorial-landing.component.ts apps/web/src/app/pages/landing/editorial-landing.component.ts apps/web/src/app/features/music/pages/music-editorial-landing/music-editorial-landing.component.ts
git commit -m "style(ui): remove grayscale and dull image overlays across app"
```

### Task 7: One-time author backfill from book metadata/content

**Files:**

- Create: `tools/scripts/backfill-book-authors.ts`
- Modify (if needed): `apps/api/src/modules/books/*` services for parser reuse

**Step 1: Write script dry-run mode first**

- Output candidate updates without writing.

**Step 2: Validate sample records**

- Compare extracted author strings against known books.

**Step 3: Execute write mode**

- Update missing/empty author fields only.

**Step 4: Commit script + docs**

```bash
git add tools/scripts/backfill-book-authors.ts
git commit -m "chore(books): add one-time author backfill script"
```

### Task 8: Verify ingestion/history endpoints and Elsci cadence, then E2E with dummy users

**Files:**

- Modify docs/runbook as needed: `docs/` operational notes

**Step 1: Endpoint verification matrix**

- Movies: `/api/v1/watch/progress`, `/api/v1/watch/progress/:movieId`, `/api/v1/watch/history`
- Books/manga: `/api/v1/books/progress`, `/api/v1/books/progress/:slug`, `/api/v1/books/manga/progress`, `/api/v1/books/manga/history`
- Profile/watchlist: `/api/v1/profile`, `/api/v1/profile/watchlist`

**Step 2: Dummy user E2E (non-premium)**

- Login/register dummy non-premium.
- Watch/read content and confirm progress bars update.
- Confirm ads/scripts/slots visible.
- Confirm long-press quick actions + star toggle behavior.

**Step 3: Dummy user E2E (premium)**

- Upgrade or seed premium dummy user.
- Confirm no ads/scripts/slots rendered anywhere.
- Confirm history/progress/watchlist still works.

**Step 4: Elsci scheduler/worker health checks**

- Confirm queue cadence and job completion in Redis + worker logs.
- Confirm mirror/import continue periodically.

**Step 5: Final verification commands**

- `npm run build --workspace api`
- `npm run build --workspace web -- --configuration production`
- Optional targeted tests for changed components/routes.

**Step 6: Final commit(s)**

```bash
git add .
git commit -m "feat: finalize ads gating, content UX upgrades, and e2e verification"
```
