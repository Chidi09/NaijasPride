import { Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MovieSummary } from '@naijaspride/types';
import { ProfileApiService } from '../../../profile/services/profile-api.service';
import { AuthStateService } from '../../../../core/auth/auth-state.service';

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
  imports: [CommonModule, RouterLink, NgOptimizedImage],
  template: `
    <div 
      [routerLink]="['/movies', movie.id]" 
      class="group cursor-pointer transition-transform duration-200 ease-out hover:scale-105"
    >
      <!-- Thumbnail Container - 16:9 Aspect Ratio -->
      <div class="aspect-video relative rounded-lg overflow-hidden bg-[#e5d2c6] dark:bg-cinema-800">
        @if (isLoggedIn()) {
          <button
            type="button"
            (click)="toggleWatchlist($event)"
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
        } @else if (movie.quality?.includes('Q1080p')) {
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
          @if (movie.rating) {
            <span class="text-green-400 font-medium">{{ movie.rating }}% Match</span>
          }
          <span>{{ movie.year }}</span>
          
          @if (movie.genre?.length > 0) {
            <span class="text-[#9a857d] dark:text-gray-500">•</span>
            <span class="truncate max-w-[100px]">{{ movie.genre[0] }}</span>
          }
        </div>
      </div>
    </div>
  `
})
export class MovieCardYoutubeComponent {
  @Input({ required: true }) movie!: MovieSummary;
  @Input() progress: number | null = null;

  private profileApi = inject(ProfileApiService);
  private authState = inject(AuthStateService);

  saved = signal(false);
  isLoggedIn = computed(() => !!this.authState.currentUser());

  get progressPercent() {
    if (this.progress === null || Number.isNaN(this.progress)) {
      return 0;
    }
    return Math.max(0, Math.min(100, this.progress));
  }

  toggleWatchlist(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.profileApi.toggleWatchlist(this.movie.id).subscribe({
      next: () => this.saved.update((current) => !current),
    });
  }
}
