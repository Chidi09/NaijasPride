import { Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { TvShowsQueryService } from '../../services/tv-shows-query.service';

@Component({
  selector: 'app-tv-show-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
      @if (query.isLoading()) {
        <div class="py-16 text-center text-white/70">Loading show...</div>
      } @else if (query.isError() || !show()) {
        <div class="py-16 text-center text-red-300">TV show not found.</div>
      } @else {
        <div class="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          <div class="p-6">
            <a routerLink="/tv-shows" class="text-sm text-white/60 hover:text-white">← Back to TV Shows</a>
            <h1 class="mt-2 text-3xl font-bold text-white">{{ show()!.title }}</h1>
            <p class="mt-2 text-white/70">{{ show()!.overview || 'No overview available.' }}</p>
          </div>

          <div class="border-t border-white/10 p-6">
            <h2 class="mb-3 text-lg font-semibold text-white">Seasons</h2>
            <div class="mb-4 flex flex-wrap gap-2">
              @for (season of show()!.seasons; track season.id) {
                <button
                  type="button"
                  class="rounded-full px-3 py-1 text-xs font-medium"
                  [class]="selectedSeasonNumber() === season.seasonNumber ? 'bg-[#800020] text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'"
                  (click)="selectedSeasonNumber.set(season.seasonNumber)"
                >
                  Season {{ season.seasonNumber }}
                </button>
              }
            </div>

            @if (selectedSeason(); as season) {
              <div class="space-y-2">
                @for (episode of season.episodes; track episode.id) {
                  <button
                    type="button"
                    class="flex w-full items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-left hover:border-white/30"
                    (click)="watchEpisode(season.seasonNumber, episode.episodeNumber)"
                  >
                    <span class="text-sm text-white">E{{ episode.episodeNumber }} - {{ episode.title }}</span>
                    <span class="text-xs text-white/50">Watch</span>
                  </button>
                }
              </div>
            }
          </div>
        </div>
      }
    </section>
  `,
})
export class TvShowDetailComponent {
  slug = input<string>('');
  private tvQuery = inject(TvShowsQueryService);
  private router = inject(Router);

  query = this.tvQuery.getShowDetailQuery(this.slug);
  show = computed(() => this.query.data()?.data || null);
  selectedSeasonNumber = signal(1);

  selectedSeason = computed(() => {
    const row = this.show();
    if (!row || row.seasons.length === 0) return null;
    return row.seasons.find((season) => season.seasonNumber === this.selectedSeasonNumber()) || row.seasons[0];
  });

  watchEpisode(seasonNumber: number, episodeNumber: number): void {
    const slug = this.slug();
    void this.router.navigate(['/tv-shows', slug, 'watch'], {
      queryParams: {
        season: seasonNumber,
        episode: episodeNumber,
      },
    });
  }
}
