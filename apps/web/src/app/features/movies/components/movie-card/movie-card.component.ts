import { Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MovieSummary } from '@naijaspride/types';
import { ProfileApiService } from '../../../profile/services/profile-api.service';
import { AuthStateService } from '../../../../core/auth/auth-state.service';

@Component({
  selector: 'app-movie-card',
  standalone: true,
  imports: [CommonModule, RouterLink, NgOptimizedImage],
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
    }
  `],
  template: `
    <article
      [routerLink]="['/movies', movie.slug || movie.id]"
      class="card group relative cursor-pointer"
    >
      <div class="relative aspect-[2/3]">
        @if (primaryImage(movie); as imageUrl) {
          <img 
            [ngSrc]="imageUrl" 
            [alt]="movie.title"
            fill
            sizes="(min-width: 1024px) 20vw, (min-width: 768px) 33vw, 50vw"
            class="w-full h-full object-cover opacity-95 group-hover:opacity-100 transition-opacity"
          >
        } @else {
          <div class="w-full h-full flex items-center justify-center bg-[#dfc8bb] dark:bg-cinema-700">
            <span class="text-4xl text-cinema-500">🎬</span>
          </div>
        }
        
        @if (movie.quality?.includes('4K')) {
          <div class="absolute top-2 right-2 bg-cinema-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">
            4K UHD
          </div>
        }

        @if (movie.isStreamOnly) {
          <div class="absolute top-2 left-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">
            STREAM
          </div>
        } @else {
          <div class="absolute top-2 left-2 bg-cinema-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">
            DOWNLOAD
          </div>
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
          <h3 class="font-semibold text-white text-sm leading-tight line-clamp-2">{{ movie.title }}</h3>
          <p class="mt-1 text-[11px] text-gray-200/90">{{ movie.year }} • {{ movie.genre?.[0] || 'Feature' }}</p>
          <div class="mt-2 flex items-center gap-2 text-[10px]">
            <span class="rounded-full bg-white/20 px-2 py-0.5 text-white">{{ movie.rating || 0 }}% Match</span>
            @if (movie.isStreamOnly) {
              <span class="rounded-full bg-blue-500/80 px-2 py-0.5 text-white">Watch</span>
            } @else {
              <span class="rounded-full bg-[#800020]/90 px-2 py-0.5 text-white">Download</span>
            }
          </div>
        </div>
      </div>

      <div class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end p-4 pointer-events-none">
        <div class="w-full rounded-lg bg-black/70 border border-white/10 p-3 pointer-events-auto">
          <div class="flex gap-2">
            <button
              class="bg-white text-black rounded-full p-1.5 hover:bg-cinema-100 transition-colors"
              (click)="$event.stopPropagation()"
             aria-label="Play movie"
           >
             <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
           </button>
            @if (isLoggedIn()) {
            <button
              class="border border-gray-400 rounded-full p-1.5 hover:border-white transition-colors"
              (click)="toggleWatchlist($event)"
             aria-label="Add movie"
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
              Stream + download ready
            } @else if (isReadyForDownload(movie)) {
              Torrent/download ready
            } @else {
              Processing source
            }
          </div>
        </div>
      </div>
    </article>
  `
})
export class MovieCardComponent {
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

  primaryImage(movie: MovieSummary): string | null {
    return movie.thumbnailUrl || movie.posterUrl || movie.coverUrl || movie.backdropUrl || null;
  }

  isReadyForDownload(movie: MovieSummary): boolean {
    return !movie.isStreamOnly && Array.isArray(movie.quality) && movie.quality.length > 0;
  }

  toggleWatchlist(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.profileApi.toggleWatchlist(this.movie.id).subscribe({
      next: () => this.saved.update((current) => !current),
    });
  }
}
