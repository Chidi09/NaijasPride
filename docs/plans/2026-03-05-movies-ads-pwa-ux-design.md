# Movies, Ads, and PWA UX Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans before implementation, then superpowers:subagent-driven-development for execution tasks.

## Goal

Ship a production-quality UX and monetization pass across movies/books/music surfaces with these outcomes:

1. Non-premium users see ads across web + installed PWA + TV layouts.
2. Premium users see no ads.
3. Movie discovery surfaces are ordered correctly for platform growth:
   - Latest Uploads (newly completed R2 uploads first)
   - Trending (recent watch activity, not static lifetime counts)
   - New (2025-2026 and recent-year emphasis)
4. Mobile PWA feels first-class (long-press quick actions, better touch affordances).
5. Visual quality improves by removing grayscale/dulling overlays from covers/posters app-wide.
6. Progress visibility appears on content cards (movies + books/manga/comics) where history exists.
7. Watchlist/star behavior works reliably on mobile and desktop.
8. Historical endpoints and ingestion schedulers are verified and monitored.

## Current State Findings

- Movie search already filters to playable content for users (`isStreamOnly + youtubeId` OR non-empty `fileUrls`).
- Editorial movies page currently sets trending from a slice of most-watched, and latest drops from pending/processing, which does not represent latest successful uploads.
- Star/watchlist on movie cards is hover-centric in places, weak for touch-first usage.
- Watch/book/manga progress endpoints exist and are used, but progress indicators are inconsistent on cards.
- Elsci mirror/auto-import workers are active and completing jobs on schedule.
- Multiple surfaces intentionally desaturate imagery via `grayscale` and heavy dim overlays.

## Product Decisions

1. **Ads policy:** Show ads everywhere for non-premium users; hide all ads for premium users.
2. **Trending model:** Use recent watch activity (time-window based), with fallback to `viewCount` when sparse.
3. **Primary mobile interaction:** Long-press opens quick-action sheet (`Star`, `Watch/Download`, `Details`) on cards.
4. **Visual style:** Remove grayscale/dulling treatment globally across app imagery.

## Architecture Design

### 1) Ads and Premium Gate (Approach B)

Create a centralized ad policy path in frontend:

- `canShowAds = !isPremium` derived from authenticated user state.
- Inject AdSense script globally once for non-premium users:
  - `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2568728658832536`
- Integrate EffectiveGate inventory for non-premium users:
  - Smartlink: `https://www.effectivegatecpm.com/qm7irj9i?key=106d46d6ef4f93102f2d54643357b11c`
  - 320x50 banner slot via componentized script loader using key `efea465d4fdc9eabe553fbaecd0c4948`
- Ensure premium users never render ad script/slots.

### 2) Movie Surface Ordering

Add backend-supported feed semantics and frontend section wiring:

- **Latest Uploads**: `status=active`, non-empty `fileUrls`, ordered by `updatedAt desc`.
- **Trending (7d)**: recent `WatchHistory` activity weighted by recency and progress; fallback to `viewCount desc`.
- **New (2025-2026)**: filtered by year range + `createdAt desc`.

Ensure new completed torrent uploads land in Latest Uploads first automatically.

### 3) Watchlist/Star Reliability

- Make star action touch-accessible (not hover-only).
- Seed card saved state from profile watchlist.
- Keep optimistic toggle with rollback on API failure.
- Keep parity across `movie-card` and `movie-card-youtube`.

### 4) Progress Bars on Cards

- Movies: use watch progress/history map and render card-level progress consistently.
- Books/manga/comics: use book progress and manga history endpoints to compute card progress.
- Show only when progress > 0.

### 5) Mobile PWA, Desktop, and TV UX

- Mobile PWA: long-press quick-action sheet on cards and larger touch targets.
- Desktop web: retain hover/focus affordances.
- TV: keep larger spacing and ratio-safe card layout; no hover dependency for core actions.

### 6) Visual Cleanup (No Dull Tint)

- Remove `grayscale` image classes and heavy opacity dim overlays across landing/editorial/card surfaces (movies/books/music/home landing).
- Preserve minimal contrast overlays only where required for text readability.

### 7) Book Author Backfill

- Add one-time author extraction/backfill pass from existing metadata/content parser outputs.
- Persist normalized author names in DB for card/detail use.

### 8) Elsci Ingestion Continuity

- Keep existing schedulers; add visibility checks and queue health checks in admin/ops runbook.
- Verify periodic jobs continue until backlog is exhausted.

## API and Data Contract Changes

1. Extend movie featured/list feed responses to support explicit sections (`latestUploads`, `trending`, `newReleases`) or equivalent query capabilities.
2. Ensure auth/profile payload always includes premium status needed for ad gating.
3. Reuse existing watch/book progress endpoints; no breaking endpoint changes required.

## Error Handling and Guardrails

- Ad script loaders fail silently and do not block content rendering.
- Long-press interactions include tap fallback actions.
- Watchlist toggles show toast on failure and revert optimistic UI state.
- Feed queries degrade gracefully to existing sort fallbacks if derived trend data is sparse.

## Verification Plan (Required)

Run end-to-end with two dummy users using frontend-accessible endpoints:

1. **Dummy non-premium user**
   - Ads visible (AdSense + EffectiveGate slots where configured)
   - Star/watchlist works
   - Long-press quick actions work on mobile PWA
   - Progress bars appear after watch/read actions

2. **Dummy premium user**
   - No ads anywhere
   - Same watchlist/progress flows work

3. **Movie feed checks**
   - Latest Uploads reflects newest completed uploads first
   - Trending updates from recent watch activity
   - New section prioritizes 2025-2026

4. **Books checks**
   - Author field present post-backfill
   - Reading progress bars visible where applicable

5. **Ops checks**
   - Elsci mirror and import queues active on schedule
   - No regressions in torrent/movie ingestion workflows

## Rollout

1. Implement backend feed + state changes.
2. Implement frontend ad policy and script loaders.
3. Implement card UX (star, progress, long-press) and visual cleanup.
4. Run E2E dummy-user tests and fix regressions.
5. Deploy and verify on active stack.
