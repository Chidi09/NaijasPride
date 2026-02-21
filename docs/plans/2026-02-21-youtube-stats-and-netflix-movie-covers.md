# YouTube Stats + Netflix-style Movie Covers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show real YouTube view/like counts cached in DB on music pages; make movie covers consistently portrait (2:3) with Netflix-style wide landscape cards for "Trending Now".

**Architecture:**
- Add `ytViewCount`/`ytLikeCount` fields to `MusicVideo` Prisma model; sync daily via a new scheduler service that batch-calls YouTube Data API (50 videos/request).
- Expose new fields through the existing music API route and types.
- On the frontend, show YouTube stats on `music-watch` page and `music-card` component.
- For movies, transform the "Trending Now" row into wide landscape cards (using `backdropUrl`, 16:9) while all other rows remain portrait 2:3 — matching Netflix's layout.

**Tech Stack:** Prisma, Fastify, Angular signals, Tailwind CSS, Google YouTube Data API v3 (googleapis already installed)

---

## Task 1: Add YouTube stat fields to Prisma schema + migrate

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (lines 519–523, after `weeklyPlays`)

**Step 1: Add fields to MusicVideo model**

In `schema.prisma`, after the `weeklyPlays` line add:

```prisma
  ytViewCount     Int           @default(0)       // Cached from YouTube API
  ytLikeCount     Int           @default(0)       // Cached from YouTube API
  ytStatsUpdatedAt DateTime?                      // Last YouTube stats sync
```

**Step 2: Create migration**

```bash
cd apps/api && npx prisma migrate dev --name add_yt_stats_to_music_video
```

Expected: New migration file created, DB updated.

**Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat: add ytViewCount, ytLikeCount, ytStatsUpdatedAt to MusicVideo"
```

---

## Task 2: Create YouTubeStatsSyncService

**Files:**
- Create: `apps/api/src/modules/music/youtube-stats-sync.service.ts`

**Step 1: Write the service**

```typescript
// apps/api/src/modules/music/youtube-stats-sync.service.ts
import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';

const BATCH_SIZE = 50; // YouTube API max per request

export class YouTubeStatsSyncService {
  private youtube = google.youtube({
    version: 'v3',
    auth: process.env.YOUTUBE_API_KEY,
  });

  constructor(private prisma: PrismaClient, private log: { info: (msg: string) => void; error: (msg: string, err?: unknown) => void }) {}

  async syncAll(): Promise<void> {
    this.log.info('[YTStatsSync] Starting YouTube stats sync...');

    // Fetch all active music video IDs + youtubeIds
    const videos = await this.prisma.musicVideo.findMany({
      where: { status: 'active' },
      select: { id: true, youtubeId: true },
    });

    this.log.info(`[YTStatsSync] Syncing ${videos.length} videos in batches of ${BATCH_SIZE}`);

    // Process in batches of 50
    for (let i = 0; i < videos.length; i += BATCH_SIZE) {
      const batch = videos.slice(i, i + BATCH_SIZE);
      const youtubeIds = batch.map((v) => v.youtubeId);

      try {
        const response = await this.youtube.videos.list({
          part: ['statistics'],
          id: youtubeIds,
          maxResults: BATCH_SIZE,
        });

        const items = response.data.items ?? [];

        for (const item of items) {
          const ytId = item.id;
          const stats = item.statistics;
          if (!ytId || !stats) continue;

          const dbRecord = batch.find((v) => v.youtubeId === ytId);
          if (!dbRecord) continue;

          await this.prisma.musicVideo.update({
            where: { id: dbRecord.id },
            data: {
              ytViewCount: parseInt(stats.viewCount ?? '0', 10),
              ytLikeCount: parseInt(stats.likeCount ?? '0', 10),
              ytStatsUpdatedAt: new Date(),
            },
          });
        }

        this.log.info(`[YTStatsSync] Batch ${Math.floor(i / BATCH_SIZE) + 1} done (${items.length} items updated)`);
      } catch (err) {
        this.log.error(`[YTStatsSync] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed`, err);
      }

      // Small delay between batches to be kind to the API
      if (i + BATCH_SIZE < videos.length) {
        await new Promise((res) => setTimeout(res, 500));
      }
    }

    this.log.info('[YTStatsSync] YouTube stats sync complete.');
  }
}
```

**Step 2: Commit**

```bash
git add apps/api/src/modules/music/youtube-stats-sync.service.ts
git commit -m "feat: add YouTubeStatsSyncService to batch-update YT view/like counts"
```

---

## Task 3: Register daily sync job in app.ts

**Files:**
- Modify: `apps/api/src/app.ts`

**Step 1: Import the service (add after existing music imports around line 35)**

```typescript
import { YouTubeStatsSyncService } from "./modules/music/youtube-stats-sync.service";
```

**Step 2: Register scheduler (add after musicChannelService.monitorAll block, around line 297)**

```typescript
    // Sync YouTube stats daily (views + likes from YouTube Data API)
    const ytStatsSyncService = new YouTubeStatsSyncService(app.prisma, app.log);
    const oneDayMs = 24 * 60 * 60 * 1000;
    setInterval(() => {
      ytStatsSyncService.syncAll().catch((error) => {
        app.log.error({ error }, '[YTStatsSync] Daily sync failed');
      });
    }, oneDayMs);
    // Run 30 minutes after startup (don't hammer at boot)
    setTimeout(() => {
      ytStatsSyncService.syncAll().catch((error) => {
        app.log.error({ error }, '[YTStatsSync] Initial sync failed');
      });
    }, 30 * 60 * 1000);
```

**Step 3: Commit**

```bash
git add apps/api/src/app.ts
git commit -m "feat: register daily YouTube stats sync scheduler in app.ts"
```

---

## Task 4: Expose ytViewCount/ytLikeCount from music API

**Files:**
- Modify: `apps/api/src/modules/music/music.service.ts`

**Step 1: Add fields to MUSIC_VIDEO_SELECT (lines 24–45)**

Add `ytViewCount: true`, `ytLikeCount: true` to the select object.

**Step 2: Add fields to MusicVideoRow type (lines 47–68)**

Add:
```typescript
  ytViewCount: number;
  ytLikeCount: number;
```

**Step 3: Commit**

```bash
git add apps/api/src/modules/music/music.service.ts
git commit -m "feat: expose ytViewCount and ytLikeCount in music API responses"
```

---

## Task 5: Update shared types

**Files:**
- Modify: `packages/shared-types/src/models/music.ts`

**Step 1: Add to MusicVideo interface (after likeCount)**

```typescript
  ytViewCount: number;
  ytLikeCount: number;
```

**Step 2: Add to MusicVideoSummary interface (after likeCount)**

```typescript
  ytViewCount: number;
  ytLikeCount: number;
```

**Step 3: Rebuild types package**

```bash
cd packages/shared-types && npm run build
```

**Step 4: Commit**

```bash
git add packages/shared-types/src/models/music.ts packages/shared-types/dist/
git commit -m "feat: add ytViewCount and ytLikeCount to MusicVideo and MusicVideoSummary types"
```

---

## Task 6: Display YouTube stats on music-watch page

**Files:**
- Modify: `apps/web/src/app/features/music/pages/music-watch/music-watch.component.ts`

**Step 1: Update the stats row (lines 89–98)**

Replace the stats div with:

```html
<div class="flex items-center gap-4 mt-2 text-sm text-[var(--music-text-muted)]">
  <span>{{ formatCount(video()!.viewCount) }} views</span>
  <span>{{ formatCount(video()!.playCount) }} plays</span>
  @if (video()!.ytViewCount > 0) {
    <span class="flex items-center gap-1">
      <svg class="w-3.5 h-3.5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/>
      </svg>
      {{ formatCount(video()!.ytViewCount) }} YT views
    </span>
    <span class="flex items-center gap-1">
      <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>
      {{ formatCount(video()!.ytLikeCount) }} YT likes
    </span>
  }
  @if (!video()!.isOfficial) {
    <span class="bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full text-xs">Fan Upload</span>
  }
  @if (video()!.isExplicit) {
    <span class="bg-[var(--music-surface-strong)] text-[var(--music-text-muted)] px-2 py-0.5 rounded-full text-xs">Explicit</span>
  }
</div>
```

**Step 2: Commit**

```bash
git add apps/web/src/app/features/music/pages/music-watch/music-watch.component.ts
git commit -m "feat: display YouTube view and like counts on music watch page"
```

---

## Task 7: Display YouTube view count on music-card

**Files:**
- Modify: `apps/web/src/app/features/music/components/music-card/music-card.component.ts`

**Step 1: Update the stats line at bottom of card (lines 96–100)**

Replace the stats div:

```html
<div class="mt-1 flex items-center gap-2 text-[10px] text-[var(--music-text-muted)] sans-text">
  <span>{{ video.year }}</span>
  <span>•</span>
  @if (video.ytViewCount > 0) {
    <span class="flex items-center gap-1">
      <svg class="w-2.5 h-2.5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/>
      </svg>
      {{ formatCount(video.ytViewCount) }}
    </span>
  } @else {
    <span>{{ formatCount(video.viewCount) }} views</span>
  }
</div>
```

**Step 2: Commit**

```bash
git add apps/web/src/app/features/music/components/music-card/music-card.component.ts
git commit -m "feat: show YouTube view count badge on music card when available"
```

---

## Task 8: Netflix-style Trending Now row on movie landing page

**Files:**
- Modify: `apps/web/src/app/features/movies/pages/movies-editorial-landing/movies-editorial-landing.component.ts`

**Step 1: Replace the "Trending Now" row (lines 157–176)**

Change from standard `<app-movie-card>` portrait cards to wide landscape cards using `backdropUrl`:

```html
<!-- Trending Now — Netflix-style wide landscape cards -->
@if (trendingDownload().length > 0) {
  <div class="py-8 pl-8 md:pl-16 relative group/row">
    <div class="flex items-center justify-between mb-6 pr-8">
      <div class="flex items-center gap-2 cursor-pointer w-fit group-hover/row:text-[#800020] transition-colors">
        <h2 class="serif-text text-2xl md:text-3xl text-[var(--movies-text)]">Trending Now</h2>
        <span [innerHTML]="chevronIcon" class="opacity-0 group-hover/row:opacity-100 -translate-x-2 group-hover/row:translate-x-0 transition-all"></span>
      </div>
      <a [routerLink]="['/browse']" class="sans-text text-xs tracking-[0.18em] uppercase text-[var(--movies-text-muted)] hover:text-[#800020] transition-colors">View More</a>
    </div>

    <div class="flex overflow-x-auto no-scrollbar pb-8 pr-8 gap-4">
      @for (movie of trendingDownload(); track movie.id; let i = $index) {
        <a [routerLink]="['/movies', movie.slug]" class="flex-shrink-0 w-[340px] md:w-[420px] group/card relative rounded-sm overflow-hidden block">
          <!-- Landscape thumbnail -->
          <div class="aspect-video w-full relative overflow-hidden">
            <img
              [src]="movie.backdropUrl || movie.thumbnailUrl || ''"
              [alt]="movie.title"
              class="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-105"
              referrerpolicy="no-referrer"
            />
            <!-- Rank number overlay -->
            <div class="absolute bottom-0 left-0 text-[120px] font-black leading-none text-white/10 select-none pointer-events-none" style="font-family: serif; line-height: 0.8; padding-bottom: 0; margin-left: -8px">{{ i + 1 }}</div>
            <!-- Dark gradient overlay -->
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
            <!-- Badges -->
            <div class="absolute top-2 right-2 flex gap-1">
              @if (movie.quality?.[0]) {
                <span class="bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-sm">{{ movie.quality[0] }}</span>
              }
            </div>
          </div>
          <!-- Info below -->
          <div class="bg-[var(--movies-surface)] px-3 py-2.5">
            <p class="text-[var(--movies-text)] text-sm font-semibold truncate">{{ movie.title }}</p>
            <p class="text-[var(--movies-text-muted)] text-xs mt-0.5">{{ movie.year }} &middot; {{ movie.genre?.[0] || '' }}</p>
          </div>
        </a>
      }
    </div>
  </div>
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/features/movies/pages/movies-editorial-landing/movies-editorial-landing.component.ts
git commit -m "feat: Netflix-style wide landscape cards for Trending Now row on movie landing"
```

---

## Task 9: Final build verification + push

**Step 1: Run local build**

```bash
cd apps/api && npm run build 2>&1
cd packages/shared-types && npm run build 2>&1
```

**Step 2: Push to origin**

```bash
git push
```

Expected: All changes pushed to `main`.
