import { Component, Input, OnChanges, SimpleChanges, computed, effect, inject, signal } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { Router } from '@angular/router';
import { MovieSummary } from '@naijaspride/types';
import { normalizeYouTubeTitle } from '@naijaspride/utils';
import { ProfileApiService } from '../../../profile/services/profile-api.service';
import { AuthStateService } from '../../../../core/auth/auth-state.service';
import { ProfileQueryService } from '../../../profile/services/profile-query.service';

@Component({
  selector: 'app-movie-card',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage],
  styles: [`
    :host {
      display: block;
      width: 100%;
    }

    .card {
      border-radius: 14px;
      overflow: hidden;
      background: var(--bg-card, #ffffff);
      border: 1px solid var(--border-color, #d8c2b8);
      transition: transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease;
    }

    .card:hover {
      transform: translateY(-4px) scale(1.02);
      border-color: rgba(128, 0, 32, 0.45);
      box-shadow: 0 16px 34px rgba(0, 0, 0, 0.25);
      z-index: 10;
      position: relative;
    }
  `],
  template: `
    <article
      class="card group relative cursor-pointer"
      tabindex="0"
      (click)="onCardClick($event)"
      (keydown.enter)="openDetails($event)"
      (touchstart)="onTouchStart($event)"
      (touchend)="onTouchEnd()"
      (touchcancel)="onTouchCancel()"
      (touchmove)="onTouchMove($event)"
      (contextmenu)="onContextMenu($event)"
    >
      <div class="relative aspect-[2/3]">
        @if (primaryImage(movie); as imageUrl) {
          <img 
            [ngSrc]="imageUrl" 
            [alt]="displayTitle"
            fill
            sizes="(min-width: 1024px) 20vw, (min-width: 768px) 33vw, 50vw"
            class="w-full h-full object-cover"
          >
        } @else {
          <div class="w-full h-full flex items-center justify-center bg-[#dfc8bb] dark:bg-cinema-700">
            <span class="material-symbols-outlined text-4xl text-cinema-500" aria-hidden="true">movie</span>
          </div>
        }
        
        @if (movie.quality?.includes('4K')) {
          <div class="absolute top-2 right-2 bg-cinema-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">
            4K UHD
          </div>
        }

        @if (shouldWatchMovie()) {
          <div class="absolute top-2 left-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">
            WATCH
          </div>
        } @else {
          <div class="absolute top-2 left-2 bg-cinema-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">
            DETAILS
          </div>
        }

        @if (isLoggedIn()) {
          <button
            type="button"
            class="absolute right-2 z-10 rounded-full bg-black/65 p-2 text-white transition-colors hover:bg-black"
            [class.top-2]="!movie.quality?.includes('4K')"
            [class.top-10]="movie.quality?.includes('4K')"
            (click)="toggleWatchlist($event)"
            (touchstart)="$event.stopPropagation()"
            [attr.aria-label]="saved() ? 'Remove from watchlist' : 'Add to watchlist'"
          >
            @if (saved()) {
              <svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5A4.5 4.5 0 016.5 4c1.74 0 3.41.81 4.5 2.09A6 6 0 0115 4a4.5 4.5 0 014.5 4.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            } @else {
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12.1 21.35l-1.2-1.1C5.1 14.9 2 12.1 2 8.7A4.7 4.7 0 016.7 4c1.7 0 3.3.8 4.3 2.1A5.7 5.7 0 0115.3 4 4.7 4.7 0 0120 8.7c0 3.4-3.1 6.2-8.9 11.5l-1 .95z"/></svg>
            }
          </button>
        }

        @if (progressPercent > 0) {
          <div class="absolute inset-x-0 bottom-0 h-1 bg-black/60">
            <div
              class="h-full bg-red-600 transition-all duration-300"
              [style.width.%]="progressPercent"
            ></div>
          </div>
        }

        <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent p-3">
          <h3 class="font-semibold text-white text-sm leading-tight line-clamp-2">{{ displayTitle }}</h3>
          <p class="mt-1 text-[11px] text-gray-200/90">{{ movie.year }} • {{ movie.genre?.[0] || 'Feature' }}</p>
          <div class="mt-2 flex items-center gap-2 text-[10px]">
            <span class="rounded-full bg-white/20 px-2 py-0.5 text-white">{{ movie.genre?.[0] || 'Movie' }}</span>
            @if (shouldWatchMovie()) {
              <span class="rounded-full bg-blue-500/80 px-2 py-0.5 text-white">Watch</span>
            } @else {
              <span class="rounded-full bg-[#800020]/90 px-2 py-0.5 text-white">Details</span>
            }
          </div>
        </div>
      </div>

      <div class="absolute inset-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all duration-300 flex items-end p-4 pointer-events-none">
        <div class="w-full rounded-lg bg-black/70 border border-white/10 p-3 pointer-events-auto">
          <div class="flex gap-2">
            <button
              type="button"
              class="bg-white text-black rounded-full p-1.5 hover:bg-cinema-100 transition-colors"
              (click)="runPrimaryAction($event)"
              aria-label="Open primary action"
            >
              <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </button>
            @if (isLoggedIn()) {
              <button
                type="button"
                class="border border-gray-400 rounded-full p-1.5 hover:border-white transition-colors"
                (click)="toggleWatchlist($event)"
                [attr.aria-label]="saved() ? 'Unstar movie' : 'Star movie'"
              >
                @if (saved()) {
                  <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5A4.5 4.5 0 016.5 4c1.74 0 3.41.81 4.5 2.09A6 6 0 0115 4a4.5 4.5 0 014.5 4.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                } @else {
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                }
              </button>
            }
          </div>
          <div class="mt-2 text-[10px] text-gray-300">
            @if (movie.isStreamOnly) {
              Instant play available
            } @else if (movie.canStream) {
              Streaming available
            } @else {
              Processing source
            }
          </div>
        </div>
      </div>
    </article>

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
export class MovieCardComponent implements OnChanges {
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

  primaryImage(movie: MovieSummary): string | null {
    return movie.thumbnailUrl || movie.posterUrl || movie.coverUrl || movie.backdropUrl || null;
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

  private isTouchInteraction() {
    return typeof window !== 'undefined' && window.matchMedia('(hover: none), (pointer: coarse)').matches;
  }
}
