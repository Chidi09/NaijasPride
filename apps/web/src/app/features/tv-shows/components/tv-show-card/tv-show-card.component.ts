import { Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TvShowSummary } from '@naijaspride/types';
import { TvShowFavoritesService } from '../../services/tv-show-favorites.service';

@Component({
  selector: 'app-tv-show-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <a
      class="group relative block overflow-hidden rounded-xl border border-white/10 bg-black/30 transition-all duration-500 hover:border-[#800020]/50 hover:shadow-2xl hover:shadow-[#800020]/20"
      [routerLink]="['/tv-shows', show.slug]"
    >
      <!-- Glow Effect -->
      <div class="absolute -inset-0.5 bg-gradient-to-r from-[#800020]/0 via-[#800020]/0 to-[#800020]/0 opacity-0 blur transition duration-500 group-hover:from-[#800020]/20 group-hover:via-[#800020]/10 group-hover:to-[#800020]/20 group-hover:opacity-100"></div>
      
      <!-- Favorite Button -->
      <button
        type="button"
        class="absolute right-2 top-2 z-20 rounded-full bg-black/70 p-2 text-white backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:bg-[#800020]"
        [class.bg-[#800020]]="isFavorite()"
        [class.scale-110]="isFavorite()"
        (click)="toggleFavorite($event)"
        [attr.aria-label]="isFavorite() ? 'Remove from favorites' : 'Add to favorites'"
      >
        @if (isFavorite()) {
          <svg class="h-3.5 w-3.5 animate-pulse" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5A4.5 4.5 0 016.5 4c1.74 0 3.41.81 4.5 2.09A6 6 0 0115 4a4.5 4.5 0 014.5 4.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        } @else {
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
        }
      </button>

      <!-- Poster Image -->
      <div class="relative aspect-[2/3] overflow-hidden bg-gradient-to-b from-zinc-800 to-zinc-900">
        <img
          class="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
          [src]="show.posterUrl || show.thumbnailUrl || '/assets/images/poster-placeholder.svg'"
          [alt]="show.title"
          loading="lazy"
        />
        
        <!-- Gradient Overlay -->
        <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60 transition-opacity duration-500 group-hover:opacity-80"></div>
        
        <!-- Hover Info Overlay -->
        <div class="absolute inset-0 flex flex-col justify-end p-3 opacity-0 transition-all duration-500 translate-y-4 group-hover:translate-y-0 group-hover:opacity-100">
          <div class="transform transition-all duration-500 group-hover:translate-y-0">
            <div class="mb-2 flex items-center gap-1">
              <svg class="h-3.5 w-3.5 text-[#800020]" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
              </svg>
              <span class="text-xs font-medium text-white/90">{{ show.seasonCount }} Seasons</span>
            </div>
            
            <div class="flex items-center gap-1 text-white/70">
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"/>
              </svg>
              <span class="text-xs">{{ show.episodeCount }} Episodes</span>
            </div>
          </div>
        </div>

        <!-- Year Badge -->
        <div class="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          {{ show.year }}
        </div>
      </div>
      
      <!-- Title Section -->
      <div class="relative p-3">
        <h3 class="line-clamp-2 text-sm font-semibold text-white transition-colors duration-300 group-hover:text-[#800020]">
          {{ show.title }}
        </h3>
        <!-- Genre Tags -->
        <div class="mt-2 flex flex-wrap gap-1">
          @for (genre of (show.genre || []).slice(0, 2); track genre) {
            <span class="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-white/50">{{ genre }}</span>
          }
        </div>
      </div>
    </a>
  `,
  styles: [`
    /* Smooth image loading */
    img {
      transition: transform 0.7s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
    }
    
    img[loading="lazy"] {
      opacity: 0;
    }
    
    img.loaded,
    img:not([loading="lazy"]) {
      opacity: 1;
    }
  `]
})
export class TvShowCardComponent {
  @Input({ required: true }) show!: TvShowSummary;

  private favorites = inject(TvShowFavoritesService);
  private refreshTick = signal(0);

  isFavorite = computed(() => {
    this.refreshTick();
    return this.favorites.isFavorite(this.show?.id || '');
  });

  toggleFavorite(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.show?.id) return;
    this.favorites.toggle(this.show.id);
    this.refreshTick.update((value) => value + 1);
  }
}
