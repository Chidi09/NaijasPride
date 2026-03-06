import { Component, Input, OnChanges, SimpleChanges, computed, effect, inject, signal } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { Router } from '@angular/router';
import { MovieSummary } from '@naijaspride/types';
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
  template: `
    <div
      class="group cursor-pointer transition-transform duration-200 ease-out hover:scale-105"
      tabindex="0"
      (click)="onCardClick($event)"
      (keydown.enter)="openDetails($event)"
      (touchstart)="onTouchStart($event)"
      (touchend)="onTouchEnd()"
      (touchcancel)="onTouchCancel()"
      (touchmove)="onTouchMove($event)"
      (contextmenu)="onContextMenu($event)"
    >
      <!-- Thumbnail Container - 16:9 Aspect Ratio -->
      <div class="aspect-video relative rounded-lg overflow-hidden bg-[#e5d2c6] dark:bg-cinema-800">
        @if (isLoggedIn()) {
          <button
            type="button"
            (click)="toggleWatchlist($event)"
            (touchstart)="$event.stopPropagation()"
            class="absolute left-2 top-2 z-10 rounded-full bg-black/70 px-2 py-1 text-[11px] text-white hover:bg-black"
          >{{ saved() ? '★' : '☆' }}</button>
        }
        @if (movie.thumbnailUrl) {
          <img 
            [ngSrc]="movie.thumbnailUrl" 
            [alt]="movie.title"
            fill
            sizes="(min-width: 1024px) 20vw, (min-width: 768px) 33vw, 50vw"
            class="w-full h-full object-cover"
          >
        } @else {
          <div class="w-full h-full flex items-center justify-center bg-[#dfc8bb] dark:bg-cinema-700">
            <span class="text-4xl">🎬</span>
          </div>
        }
        
        <!-- Quality Badge - Always Visible -->
        @if (movie.quality?.includes('4K')) {
          <div class="absolute top-2 right-2 bg-black/80 text-white text-[10px] font-bold px-2 py-1 rounded">
            4K
          </div>
        } @else if (movie.quality?.includes('1080p') || movie.quality?.includes('720p')) {
          <div class="absolute top-2 right-2 bg-black/80 text-white text-[10px] font-bold px-2 py-1 rounded">
            HD
          </div>
        }

        <!-- Watch Progress Bar -->
        @if (progressPercent > 0) {
          <div class="absolute inset-x-0 bottom-0 h-1 bg-black/60">
            <div
              class="h-full bg-red-600"
              [style.width.%]="progressPercent"
            ></div>
          </div>
        }
      </div>

      <!-- Movie Info - Always Visible -->
      <div class="mt-2 space-y-1">
        <!-- Title -->
        <h3 class="text-[#24181b] dark:text-white text-sm font-medium line-clamp-2 leading-tight group-hover:text-[#5f1327] dark:group-hover:text-[#d6b87a] transition-colors">
          {{ movie.title }}
        </h3>
        
        <!-- Meta Row -->
        <div class="flex items-center gap-2 text-xs text-[#7e6a63] dark:text-gray-400">
          <span>{{ movie.year }}</span>
          
          @if (movie.genre?.length > 0) {
            <span class="text-[#9a857d] dark:text-gray-500">•</span>
            <span class="truncate max-w-[100px]">{{ movie.genre[0] }}</span>
          }
        </div>
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

  get progressPercent() {
    if (this.progress === null || Number.isNaN(this.progress)) {
      return 0;
    }
    return Math.max(0, Math.min(100, this.progress));
  }

  shouldWatchMovie() {
    return !!this.movie?.isStreamOnly || !!this.movie?.canStream;
  }

  primaryActionLabel() {
    return this.shouldWatchMovie() ? 'Watch' : 'Download';
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
