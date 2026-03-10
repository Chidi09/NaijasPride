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
      class="group relative block overflow-hidden rounded-xl border border-white/10 bg-black/30 transition hover:border-white/30"
      [routerLink]="['/tv-shows', show.slug]"
    >
      <button
        type="button"
        class="absolute right-2 top-2 z-10 rounded-full bg-black/70 p-2 text-white transition hover:bg-black"
        (click)="toggleFavorite($event)"
        [attr.aria-label]="isFavorite() ? 'Remove from favorites' : 'Add to favorites'"
      >
        @if (isFavorite()) {
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5A4.5 4.5 0 016.5 4c1.74 0 3.41.81 4.5 2.09A6 6 0 0115 4a4.5 4.5 0 014.5 4.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        } @else {
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
        }
      </button>

      <div class="aspect-[2/3] overflow-hidden bg-zinc-900">
        <img
          class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          [src]="show.posterUrl || show.thumbnailUrl || '/assets/images/poster-placeholder.svg'"
          [alt]="show.title"
          loading="lazy"
        />
      </div>
      <div class="p-3">
        <h3 class="line-clamp-2 text-sm font-semibold text-white">{{ show.title }}</h3>
        <p class="mt-1 text-xs text-white/60">{{ show.year }} • {{ show.seasonCount }} seasons • {{ show.episodeCount }} episodes</p>
      </div>
    </a>
  `,
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
