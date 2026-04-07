import { Component, Input, OnChanges, SimpleChanges, computed, effect, inject, signal } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { Router } from '@angular/router';
import { MovieSummary } from '@naijaspride/types';
import { normalizeYouTubeTitle } from '@naijaspride/utils';
import { ProfileApiService } from '../../../profile/services/profile-api.service';
import { AuthStateService } from '../../../../core/auth/auth-state.service';
import { ProfileQueryService } from '../../../profile/services/profile-query.service';

/**
 * YouTube-style movie card component
 * - 16:9 aspect ratio for thumbnails
 * - Title always visible below poster
 * - Quality badges always visible
 * - Better for stream-only content
 */
@Component({
  selector: 'app-movie-card-youtube',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage],
  styles: [`
    :host { display: block; width: 100%; }

    .stream-card {
      display: block;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #1c1c1c;
      background: #111;
      transition: transform 280ms cubic-bezier(0.16,1,0.3,1),
                  box-shadow 280ms ease,
                  border-color 280ms ease;
    }
    .stream-card:hover {
      transform: translateY(-3px);
      border-color: rgba(128,0,32,0.35);
      box-shadow: 0 10px 24px rgba(0,0,0,0.35);
      position: relative;
      z-index: 5;
    }
    .poster-img {
      transition: transform 0.5s cubic-bezier(0.16,1,0.3,1);
    }
    .stream-card:hover .poster-img {
      transform: scale(1.05);
    }
    .stream-play {
      opacity: 0;
      transform: scale(0.8);
      transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16,1,0.3,1);
    }
    .stream-card:hover .stream-play {
      opacity: 1;
      transform: scale(1);
    }
  `],
  template: `
    <div
      class="stream-card group cursor-pointer"
      tabindex="0"
      (click)="onCardClick($event)"
      (keydown.enter)="openDetails($event)"
      (touchstart)="onTouchStart($event)"
      (touchend)="onTouchEnd()"
      (touchcancel)="onTouchCancel()"
      (touchmove)="onTouchMove($event)"
      (contextmenu)="onContextMenu($event)"
    >
      <!-- Thumbnail - 16:9 -->
      <div class="relative aspect-video overflow-hidden bg-[#181818]">
        @if (movie.thumbnailUrl?.trim()) {
          <img
            [ngSrc]="movie.thumbnailUrl!"
            [alt]="displayTitle"
            fill
            sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            class="poster-img h-full w-full object-cover"
          >
        } @else {
          <div class="poster-img flex h-full w-full items-center justify-center bg-[#181818]">
            <span class="material-symbols-outlined text-4xl" aria-hidden="true">movie</span>
          </div>
        }

        <!-- Hover play overlay -->
        <div class="stream-play absolute inset-0 flex items-center justify-center bg-black/40">
          <div class="flex h-12 w-12 items-center justify-center rounded-full bg-[#800020]/90 shadow-lg shadow-black/40">
            <svg class="h-5 w-5 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>

        <!-- Watchlist button -->
        @if (isLoggedIn()) {
          <button
            type="button"
            (click)="toggleWatchlist($event)"
            (touchstart)="$event.stopPropagation()"
            class="absolute left-2 top-2 z-10 rounded-full bg-black/70 px-2 py-1 text-[11px] text-white hover:bg-black"
          >{{ saved() ? '★' : '☆' }}</button>
        }

        <!-- Quality badge -->
        @if (movie.quality?.includes('4K')) {
          <div class="absolute right-2 top-2 rounded bg-black/80 px-2 py-1 text-[10px] font-bold text-white">4K</div>
        } @else if (movie.quality?.includes('1080p') || movie.quality?.includes('720p')) {
          <div class="absolute right-2 top-2 rounded bg-black/80 px-2 py-1 text-[10px] font-bold text-white">HD</div>
        }

        <!-- Progress bar -->
        @if (progressPercent > 0) {
          <div class="absolute inset-x-0 bottom-0 h-1 bg-black/60">
            <div class="h-full bg-[#800020]" [style.width.%]="progressPercent"></div>
          </div>
        }
      </div>

      <!-- Title + year below card -->
      <div class="px-3 py-2.5">
        <p class="truncate text-[12px] font-semibold leading-tight text-[#f9f9f2]">{{ displayTitle }}</p>
        <p class="mt-0.5 text-[10px] text-[#a88a78]">{{ movie.year }} · {{ formatCount(movie.viewCount ?? 0) }} views</p>
      </div>
    </div>

    @if (showQuickActionSheet()) {
      <div class="fixed inset-0 z-50 flex items-end bg-black/55 p-3" (click)="closeQuickActions($event)">
        <div class="w-full rounded-2xl border border-white/10 bg-[#1d1a1a] p-3 text-white" (click)="$event.stopPropagation()">
          @if (isLoggedIn()) {
            <button
              type="button"
              class="w-full rounded-xl border border-white/15 px-4 py-3 text-left text-sm font-semibold hover:bg-white/10"
              (click)="toggleWatchlistFromSheet($event)"
            >
              {{ saved() ? 'Unstar' : 'Star' }}
            </button>
          }
          <button
            type="button"
            class="w-full rounded-xl border border-white/15 px-4 py-3 text-left text-sm font-semibold hover:bg-white/10"
            [class.mt-2]="isLoggedIn()"
            (click)="runPrimaryAction($event)"
          >
            {{ primaryActionLabel() }}
          </button>
          <button
            type="button"
            class="mt-2 w-full rounded-xl border border-white/15 px-4 py-3 text-left text-sm font-semibold hover:bg-white/10"
            (click)="openDetails($event)"
          >
            Details
          </button>
          <button
            type="button"
            class="mt-2 w-full rounded-xl bg-white/10 px-4 py-3 text-left text-sm"
            (click)="closeQuickActions($event)"
          >
            Cancel
          </button>
        </div>
      </div>
    }
  `
})
export class MovieCardYoutubeComponent implements OnChanges {
  @Input({ required: true }) movie!: MovieSummary;
  @Input() progress: number | null = null;

  private profileApi = inject(ProfileApiService);
  private profileQueryService = inject(ProfileQueryService);
  private authState = inject(AuthStateService);
  private router = inject(Router);

  private isMutating = signal(false);
  private pendingSaved = signal<boolean | null>(null);
  showQuickActionSheet = signal(false);
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private suppressNextCardClick = false;
  private touchStartPoint: { x: number; y: number } | null = null;

  saved = signal(false);
  isLoggedIn = computed(() => !!this.authState.currentUser());
  profileQuery = this.profileQueryService.getProfileQuery();

  constructor() {
    effect(() => {
      this.hydrateSavedState();
    }, { allowSignalWrites: true });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['movie']) {
      this.hydrateSavedState();
    }
  }

  get displayTitle(): string {
    return normalizeYouTubeTitle(this.movie?.title ?? '');
  }

  get progressPercent() {
    if (this.progress === null || Number.isNaN(this.progress)) {
      return 0;
    }
    return Math.max(0, Math.min(100, this.progress));
  }

  formatCount(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return String(value);
  }

  shouldWatchMovie() {
    return !!this.movie?.isStreamOnly || !!this.movie?.canStream;
  }

  primaryActionLabel() {
    return this.shouldWatchMovie() ? 'Watch' : 'Details';
  }

  toggleWatchlist(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    if (!this.isLoggedIn() || this.isMutating() || !this.movie?.id) {
      return;
    }

    const previous = this.saved();
    const optimistic = !previous;
    this.pendingSaved.set(optimistic);
    this.saved.set(optimistic);
    this.isMutating.set(true);

    this.profileApi.toggleWatchlist(this.movie.id).subscribe({
      next: () => {
        void Promise.resolve(this.profileQuery.refetch()).finally(() => {
          this.pendingSaved.set(null);
          this.isMutating.set(false);
          this.hydrateSavedState();
        });
      },
      error: () => {
        this.pendingSaved.set(null);
        this.saved.set(previous);
        this.isMutating.set(false);
      },
    });
  }

  toggleWatchlistFromSheet(event: Event) {
    this.toggleWatchlist(event);
    this.showQuickActionSheet.set(false);
    this.suppressNextCardClick = false;
  }

  runPrimaryAction(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.showQuickActionSheet.set(false);
    this.suppressNextCardClick = false;

    if (this.shouldWatchMovie()) {
      this.router.navigate(['/watch', this.movie.slug || this.movie.id]);
      return;
    }

    this.router.navigate(['/movies', this.movie.slug || this.movie.id]);
  }

  openDetails(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.showQuickActionSheet.set(false);
    this.suppressNextCardClick = false;
    this.router.navigate(['/movies', this.movie.slug || this.movie.id]);
  }

  onCardClick(event: MouseEvent) {
    if (this.suppressNextCardClick) {
      event.preventDefault();
      event.stopPropagation();
      this.suppressNextCardClick = false;
      return;
    }

    this.router.navigate(['/movies', this.movie.slug || this.movie.id]);
  }

  onTouchStart(event: TouchEvent) {
    if (!this.isTouchInteraction() || event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    this.touchStartPoint = { x: touch.clientX, y: touch.clientY };
    this.clearLongPressTimer();
    this.longPressTimer = setTimeout(() => {
      this.openQuickActionSheetFromGesture();
    }, 420);
  }

  onTouchMove(event: TouchEvent) {
    if (!this.touchStartPoint || event.touches.length !== 1) {
      this.clearLongPressTimer();
      return;
    }

    const touch = event.touches[0];
    const deltaX = Math.abs(touch.clientX - this.touchStartPoint.x);
    const deltaY = Math.abs(touch.clientY - this.touchStartPoint.y);

    if (deltaX > 12 || deltaY > 12) {
      this.clearLongPressTimer();
    }
  }

  onTouchEnd() {
    this.clearLongPressTimer();
    this.touchStartPoint = null;
  }

  onTouchCancel() {
    this.clearLongPressTimer();
    this.touchStartPoint = null;
  }

  onContextMenu(event: Event) {
    if (this.isTouchInteraction() && !this.showQuickActionSheet()) {
      event.preventDefault();
      this.openQuickActionSheetFromGesture();
    }
  }

  closeQuickActions(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.showQuickActionSheet.set(false);
    this.suppressNextCardClick = false;
  }

  private hydrateSavedState() {
    if (!this.movie?.id || this.pendingSaved() !== null) {
      return;
    }

    if (!this.isLoggedIn()) {
      this.saved.set(false);
      return;
    }

    const watchlist = this.profileQuery.data()?.data?.watchlist ?? [];
    this.saved.set(watchlist.some((watchlistMovie) => watchlistMovie.id === this.movie.id));
  }

  private clearLongPressTimer() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private openQuickActionSheetFromGesture() {
    this.showQuickActionSheet.set(true);
    this.suppressNextCardClick = true;

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(12);
    }
  }

  private isTouchInteraction() {
    return typeof window !== 'undefined' && window.matchMedia('(hover: none), (pointer: coarse)').matches;
  }
}
