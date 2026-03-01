# Vidking Embed Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Embed Vidking's iframe player in the watch room for movies that have a `tmdbId`, with postMessage-based progress sync back to our `WatchHistory` DB, falling back to the existing self-hosted HLS/MP4 player when `tmdbId` is absent.

**Architecture:** A new standalone `VidkingPlayerComponent` handles the iframe + postMessage listener. The `WatchRoomComponent` stream-priority chain becomes: offline cache → Vidking iframe (tmdbId present) → self-hosted fileUrls (HLS/MP4) → YouTube. No backend changes are needed — `tmdbId` is already stored in the `Movie` model.

**Tech Stack:** Angular 17 standalone components, Vidking embed API (`https://www.vidking.net/embed/movie/{tmdbId}`), postMessage events, existing `WatchApiService.saveProgress()`, existing `AnonymousWatchService`.

---

### Task 1: Create VidkingPlayerComponent

**Files:**
- Create: `apps/web/src/app/shared/components/vidking-player/vidking-player.component.ts`

**Context:**
Vidking's player sends `postMessage` events to the parent window in this shape:
```json
{
  "type": "PLAYER_EVENT",
  "data": {
    "event": "timeupdate|play|pause|ended|seeked",
    "currentTime": 120.5,
    "duration": 7200,
    "progress": 1.6,
    "id": "299534",
    "mediaType": "movie",
    "season": 1,
    "episode": 8,
    "timestamp": 1640995200000
  }
}
```
We listen for `timeupdate` and `ended` events and debounce saves every 5 seconds (matching the existing video player behaviour). Progress is saved via `WatchApiService.saveProgress(movieId, currentTime, duration)` for authenticated users, or `AnonymousWatchService` for guests.

**Step 1: Create the component file**

```typescript
// apps/web/src/app/shared/components/vidking-player/vidking-player.component.ts
import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  inject,
  PLATFORM_ID,
  ChangeDetectionStrategy,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { WatchApiService } from '../../../features/watch/services/watch-api.service';
import { AnonymousWatchService } from '../../../core/services/anonymous-watch.service';
import { AuthStateService } from '../../../core/auth/auth-state.service';

interface VidkingEventData {
  event: 'timeupdate' | 'play' | 'pause' | 'ended' | 'seeked';
  currentTime: number;
  duration: number;
  progress: number;
  id: string;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  timestamp: number;
}

interface VidkingMessage {
  type: 'PLAYER_EVENT';
  data: VidkingEventData;
}

@Component({
  selector: 'app-vidking-player',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl">
      <iframe
        [src]="safeUrl"
        width="100%"
        height="100%"
        frameborder="0"
        allowfullscreen
        allow="autoplay; fullscreen"
        referrerpolicy="no-referrer-when-downgrade"
        title="Video player"
      ></iframe>
    </div>
  `,
})
export class VidkingPlayerComponent implements OnInit, OnDestroy {
  /** Internal NaijasPride movie UUID — used for progress saving */
  @Input({ required: true }) movieId!: string;
  /** TMDB numeric ID — used to build the Vidking embed URL */
  @Input({ required: true }) tmdbId!: number;
  /** Optional: resume position in seconds */
  @Input() startAt = 0;
  /** Optional: primary brand colour (hex without #) */
  @Input() color = 'e50914';

  safeUrl!: SafeResourceUrl;

  private sanitizer = inject(DomSanitizer);
  private watchApi = inject(WatchApiService);
  private anonWatch = inject(AnonymousWatchService);
  private auth = inject(AuthStateService);
  private platformId = inject(PLATFORM_ID);

  private destroy$ = new Subject<void>();
  private progress$ = new Subject<{ currentTime: number; duration: number }>();
  private boundListener!: (event: MessageEvent) => void;

  ngOnInit(): void {
    this.safeUrl = this.buildSafeUrl();

    if (!isPlatformBrowser(this.platformId)) return;

    // Debounce progress saves — fire at most once every 5 seconds
    this.progress$
      .pipe(debounceTime(5000), takeUntil(this.destroy$))
      .subscribe(({ currentTime, duration }) => {
        this.persistProgress(currentTime, duration);
      });

    this.boundListener = this.onMessage.bind(this);
    window.addEventListener('message', this.boundListener);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('message', this.boundListener);
    }
  }

  private buildSafeUrl(): SafeResourceUrl {
    const params = new URLSearchParams({
      color: this.color,
      autoPlay: 'true',
    });
    if (this.startAt > 0) params.set('progress', String(this.startAt));

    const url = `https://www.vidking.net/embed/movie/${this.tmdbId}?${params.toString()}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  private onMessage(event: MessageEvent): void {
    // Ignore messages from other origins
    if (!event.origin.includes('vidking.net')) return;

    let parsed: VidkingMessage;
    try {
      parsed = typeof event.data === 'string'
        ? JSON.parse(event.data)
        : event.data;
    } catch {
      return;
    }

    if (parsed?.type !== 'PLAYER_EVENT' || !parsed.data) return;

    const { event: evtName, currentTime, duration } = parsed.data;

    if (evtName === 'timeupdate' && currentTime > 0 && duration > 0) {
      this.progress$.next({ currentTime: Math.floor(currentTime), duration: Math.floor(duration) });
    }

    if (evtName === 'ended' && duration > 0) {
      // Save final position immediately on end
      this.persistProgress(Math.floor(duration), Math.floor(duration));
    }
  }

  private persistProgress(currentTime: number, duration: number): void {
    if (this.auth.isLoggedIn()) {
      this.watchApi.saveProgress(this.movieId, currentTime, duration).subscribe({
        error: (err) => console.warn('[Vidking] Progress save failed', err),
      });
    } else {
      this.anonWatch.saveProgress(this.movieId, currentTime, duration);
    }
  }
}
```

**Step 2: Verify the file was created correctly**

Run: `ls apps/web/src/app/shared/components/vidking-player/`
Expected: `vidking-player.component.ts` listed.

**Step 3: Commit**

```bash
git add apps/web/src/app/shared/components/vidking-player/
git commit -m "feat: add VidkingPlayerComponent with postMessage progress sync"
```

---

### Task 2: Wire VidkingPlayerComponent into WatchRoomComponent

**Files:**
- Modify: `apps/web/src/app/features/movies/pages/watch-room/watch-room.component.ts`

**Context:**
The current stream-priority chain in `WatchRoomComponent._resolveStreamUrl()` is:
1. Offline cache → 2. self-hosted HLS/MP4 (`fileUrls`)

We need to insert Vidking as priority 2 (after offline, before self-hosted):
1. Offline cache → 2. Vidking (if `tmdbId` present) → 3. self-hosted HLS/MP4

The template currently has two branches: `@if (m.youtubeId)` and `@else`. We replace the `@else` branch with three sub-branches:
- Vidking iframe (`streamSource === 'vidking'`)
- Native player (`streamSource === 'hosted'`)
- Unavailable message

**Step 1: Add imports and new signal to the component class**

In `watch-room.component.ts`, add the import:
```typescript
import { VidkingPlayerComponent } from "../../../../shared/components/vidking-player/vidking-player.component";
```

Add it to the `imports` array:
```typescript
imports: [
  CommonModule,
  VideoPlayerComponent,
  VidkingPlayerComponent,
  BrandedIntroComponent,
  AdBannerComponent,
  RouterLink,
],
```

Add a new signal below the existing signals:
```typescript
streamSource = signal<'vidking' | 'hosted' | null>(null);
```

**Step 2: Update `_resolveStreamUrl` to check for tmdbId first**

Replace the existing `_resolveStreamUrl` method body with:
```typescript
private async _resolveStreamUrl(movie: Movie) {
  // 1. Offline cache (highest priority — works when offline)
  const preferred = ['4K', '1080p', '720p', '480p'];
  for (const q of preferred) {
    try {
      if (!this.offlineService.isAvailableOffline(movie.id, q)) continue;
      const offlineUrl = await this.offlineService.getOfflineUrl(movie.id, q);
      if (offlineUrl) {
        this.resolvedStreamUrl.set(offlineUrl);
        this.streamSource.set('hosted');
        this.isOffline.set(true);
        return;
      }
    } catch {
      // continue to next priority
    }
  }

  // 2. Vidking embed (requires tmdbId)
  if (movie.tmdbId) {
    this.streamSource.set('vidking');
    this.isOffline.set(false);
    return;
  }

  // 3. Self-hosted HLS/MP4
  const hostedUrl = this.primaryStreamUrl(movie);
  this.resolvedStreamUrl.set(hostedUrl);
  this.streamSource.set(hostedUrl ? 'hosted' : null);
  this.isOffline.set(false);
}
```

**Step 3: Replace the `@else` template block**

Find the current `@else` block (everything after `@if (m.youtubeId)`) in the template and replace with:

```html
} @else {
  @if (streamSource() === 'vidking' && m.tmdbId) {
    <app-vidking-player
      [movieId]="m.id"
      [tmdbId]="m.tmdbId"
    ></app-vidking-player>
  } @else if (streamSource() === 'hosted' && resolvedStreamUrl(); as streamUrl) {
    @if (isOffline()) {
      <div class="mb-3 flex items-center gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-2 rounded">
        <svg class="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
        </svg>
        Playing saved offline copy
      </div>
    }
    <app-video-player
      [videoUrl]="streamUrl"
      [movieId]="m.id"
      [movie]="m"
      [config]="playerConfig"
      (playerReady)="onPlayerReady()"
    ></app-video-player>
  } @else {
    <div class="aspect-video rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm flex items-center justify-center p-8 text-center">
      <div class="max-w-md">
        <h2 class="text-white font-serif text-xl">Stream not available</h2>
        <p class="text-[#9a857d] dark:text-gray-500 text-sm mt-2">
          This title is currently download-only. Please use the download option on the details page.
        </p>
      </div>
    </div>
  }
}
```

**Step 4: Update the info text below the player**

Find the `@else if (isOffline())` text paragraph and add a Vidking branch:
```html
@if (m.youtubeId) {
  Streaming via YouTube • Support the creators by subscribing to their channel.
} @else if (streamSource() === 'vidking') {
  Streaming via Vidking • Enjoy the show.
} @else if (isOffline()) {
  Playing from offline storage • No internet required.
} @else if (resolvedStreamUrl()) {
  Streaming via NaijasPride • Enjoy the show.
} @else {
  Download-only right now.
}
```

**Step 5: Commit**

```bash
git add apps/web/src/app/features/movies/pages/watch-room/watch-room.component.ts
git commit -m "feat: use Vidking iframe embed as primary stream source when tmdbId exists"
```

---

### Task 3: Check AnonymousWatchService signature

**Files:**
- Read: `apps/web/src/app/core/services/anonymous-watch.service.ts`

**Context:**
`VidkingPlayerComponent` calls `this.anonWatch.saveProgress(movieId, currentTime, duration)`. Verify the method accepts those three args in that order before running the build. If the signature differs, adjust the call in `vidking-player.component.ts`.

**Step 1: Read the file and check the `saveProgress` signature**

Open `apps/web/src/app/core/services/anonymous-watch.service.ts` and find `saveProgress`. Confirm it accepts `(movieId: string, progress: number, duration: number)`. If not, update the call in `vidking-player.component.ts` to match.

**Step 2: Commit only if a fix was needed**

```bash
git add apps/web/src/app/shared/components/vidking-player/vidking-player.component.ts
git commit -m "fix: align VidkingPlayerComponent with AnonymousWatchService signature"
```

---

### Task 4: Build verification

**Step 1: Run the Angular build**

```bash
cd apps/web && npx ng build --configuration production 2>&1 | tail -30
```

Expected: `Build at: ... - Hash: ... - Time: ...ms` with no errors.

**Step 2: Fix any TypeScript errors**

Common issues to watch for:
- `tmdbId` typed as `number | null` on the `Movie` type — the template guard `m.tmdbId` (truthy check) covers `null` but the `@Input() tmdbId!: number` in `VidkingPlayerComponent` must receive a `number`. If Angular flags a type mismatch, change the input to `@Input({ required: true }) tmdbId!: number | null` and add a guard in `buildSafeUrl()`:
  ```typescript
  if (!this.tmdbId) return this.sanitizer.bypassSecurityTrustResourceUrl('about:blank');
  ```
- `streamSource()` signal not recognised — ensure `streamSource = signal<...>(null)` is declared inside the class body before the `constructor`.

**Step 3: Commit build fix if needed**

```bash
git add -A
git commit -m "fix: resolve TypeScript build errors in Vidking embed integration"
```

---

### Task 5: Push and verify

**Step 1: Push to main**

```bash
git push origin main
```

**Step 2: Manual smoke test after deploy**

1. Open a movie that has a `tmdbId` (e.g. any Hollywood movie synced from TMDB) → `/watch/:slug`
2. Confirm the Vidking iframe renders instead of the custom player.
3. Play the video for 10+ seconds → check Adsterra dashboard and the Vidking player overlay loads correctly.
4. Open a movie with **no `tmdbId`** (e.g. an older Nollywood upload) → confirm the existing HLS/MP4 player renders as before.
5. In browser DevTools → Console, confirm no `blocked:csp` errors for `vidking.net`. If CSP is blocking the iframe, see the note below.

**CSP note:** If your server sets a `Content-Security-Policy` header that blocks `frame-src`, add `https://www.vidking.net` to the `frame-src` directive. Check `apps/api/src/app.ts` or any nginx/Cloudflare config for existing CSP headers.

---

### Summary of files changed

| File | Action |
|---|---|
| `apps/web/src/app/shared/components/vidking-player/vidking-player.component.ts` | **Create** |
| `apps/web/src/app/features/movies/pages/watch-room/watch-room.component.ts` | **Modify** |

No backend changes. No DB migration. No new dependencies.
