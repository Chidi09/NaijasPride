import { Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { TvShowsQueryService } from '../../services/tv-shows-query.service';

@Component({
  selector: 'app-tv-show-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="mx-auto w-full max-w-7xl px-4 py-6 pb-28 md:px-6 md:pb-10">
      @if (query.isLoading()) {
        <div class="py-16 text-center text-white/70">Loading show...</div>
      } @else if (query.isError() || !show()) {
        <div class="py-16 text-center text-red-300">TV show not found.</div>
      } @else {
        <div class="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40">
          <div class="pointer-events-none absolute inset-0 bg-cover bg-center opacity-20" [style.backgroundImage]="heroBackground()"></div>
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent"></div>

          <div class="relative p-6 md:p-8">
            <button type="button" (click)="goBack()" class="text-sm text-white/60 hover:text-white">← Back</button>

            <div class="mt-4 grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr] md:items-end">
              <div class="overflow-hidden rounded-xl border border-white/10 bg-black/20">
                <img
                  [src]="showPoster()"
                  [alt]="show()!.title"
                  class="h-full w-full object-cover"
                  referrerpolicy="no-referrer"
                />
              </div>

              <div>
                <div class="mb-3 flex flex-wrap items-center gap-2 text-xs">
                  <span class="rounded-full bg-white/10 px-2 py-1 text-white/80">{{ show()!.year }}</span>
                  <span class="rounded-full bg-white/10 px-2 py-1 text-white/80">{{ show()!.seasons.length }} seasons</span>
                  <span class="rounded-full bg-white/10 px-2 py-1 text-white/80">{{ totalEpisodeCount() }} episodes</span>
                  @if ((show()!.viewCount ?? 0) > 0) {
                    <span class="rounded-full bg-white/10 px-2 py-1 text-white/80">{{ formatCount(show()!.viewCount ?? 0) }} views</span>
                  }
                  @for (tag of show()!.genre.slice(0, 3); track tag) {
                    <span class="rounded-full border border-white/20 px-2 py-1 text-white/80">{{ tag }}</span>
                  }
                </div>

                <h1 class="text-3xl font-bold text-white md:text-4xl">{{ show()!.title }}</h1>
                <p class="mt-3 max-w-3xl text-white/70">{{ show()!.overview || 'No overview available.' }}</p>

                <div class="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="rounded-full bg-[#800020] px-5 py-2 text-sm font-semibold text-white hover:bg-[#9d1930]"
                    (click)="watchFirstAvailableEpisode()"
                  >
                    ▶ Watch Now
                  </button>
                  @if (show()!.trailerUrl) {
                    <a [href]="show()!.trailerUrl" target="_blank" rel="noopener noreferrer" class="rounded-full border border-white/20 px-5 py-2 text-sm text-white/90 hover:bg-white/10">
                      Watch Trailer
                    </a>
                  }
                </div>
              </div>
            </div>
          </div>

          <div class="relative z-10 border-t border-white/10 p-6 md:p-8">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-lg font-semibold text-white">Seasons & Episodes</h2>
              <span class="text-xs text-white/55">Optimized episode browser</span>
            </div>
            <div class="mb-4 flex flex-wrap gap-2">
              @for (season of orderedSeasons(); track season.id) {
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
              <div class="space-y-3">
                @for (episode of orderedEpisodes(); track episode.id) {
                  <button
                    type="button"
                    class="flex w-full items-center justify-between rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-left transition hover:border-white/30 hover:bg-black/35"
                    (click)="watchEpisode(season.seasonNumber, episode.episodeNumber)"
                  >
                    <span class="min-w-0 text-sm text-white">
                      <span class="mr-2 text-white/60">E{{ episode.episodeNumber }}</span>
                      {{ episode.title || ('Episode ' + episode.episodeNumber) }}
                    </span>
                    <span class="text-xs text-white/60">Watch</span>
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
  private location = inject(Location);

  goBack(): void { this.location.back(); }

  query = this.tvQuery.getShowDetailQuery(this.slug);
  show = computed(() => this.query.data()?.data || null);
  selectedSeasonNumber = signal(1);

  orderedSeasons = computed(() => {
    const row = this.show();
    if (!row) return [];
    return [...row.seasons].sort((a, b) => a.seasonNumber - b.seasonNumber);
  });

  selectedSeason = computed(() => {
    const seasons = this.orderedSeasons();
    if (seasons.length === 0) return null;
    return seasons.find((season) => season.seasonNumber === this.selectedSeasonNumber()) || seasons[0];
  });

  orderedEpisodes = computed(() => {
    const season = this.selectedSeason();
    if (!season) return [];
    return [...season.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber);
  });

  totalEpisodeCount = computed(() => {
    const row = this.show();
    if (!row) return 0;
    return row.seasons.reduce((total, season) => total + season.episodes.length, 0);
  });

  showPoster = computed(() => {
    const row = this.show();
    return row?.posterUrl || row?.thumbnailUrl || '/assets/images/poster-placeholder.svg';
  });

  heroBackground = computed(() => {
    const row = this.show();
    const image = row?.backdropUrl || row?.posterUrl || row?.thumbnailUrl || '/assets/images/poster-placeholder.svg';
    return `url('${image}')`;
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

  formatCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }

  watchFirstAvailableEpisode(): void {
    const season = this.orderedSeasons()[0];
    const episode = season?.episodes?.slice().sort((a, b) => a.episodeNumber - b.episodeNumber)[0];
    if (!season || !episode) return;
    this.watchEpisode(season.seasonNumber, episode.episodeNumber);
  }
}
