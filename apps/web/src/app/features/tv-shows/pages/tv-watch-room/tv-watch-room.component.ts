import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TvShowsQueryService } from '../../services/tv-shows-query.service';
import { EmbedPlayerComponent } from '../../../../shared/components/embed-player/embed-player.component';

@Component({
  selector: 'app-tv-watch-room',
  standalone: true,
  imports: [CommonModule, RouterLink, EmbedPlayerComponent],
  template: `
    <div class="min-h-screen bg-[#0a0a0a] px-4 py-4 md:px-8">
      <a [routerLink]="['/tv-shows', slug()]" class="text-sm text-white/60 hover:text-white">← Back to Show</a>

      @if (query.isLoading()) {
        <div class="py-16 text-center text-white/70">Loading episode...</div>
      } @else if (!show() || !currentEpisode()) {
        <div class="py-16 text-center text-red-300">Episode not found.</div>
      } @else {
        <h1 class="mt-2 text-xl font-semibold text-white">{{ show()!.title }}</h1>
        <p class="mb-4 text-sm text-white/60">Season {{ seasonNumber() }}, Episode {{ episodeNumber() }} - {{ currentEpisode()!.title }}</p>

        <app-embed-player
          [contentType]="'tv'"
          [movieId]="show()!.id"
          [movieSlug]="show()!.slug"
          [seasonNumber]="seasonNumber()"
          [episodeNumber]="episodeNumber()"
          [episodeId]="currentEpisode()!.id"
        ></app-embed-player>
      }
    </div>
  `,
})
export class TvWatchRoomComponent {
  slug = input<string>('');
  private tvQuery = inject(TvShowsQueryService);
  private route = inject(ActivatedRoute);

  seasonNumber = signal(1);
  episodeNumber = signal(1);

  query = this.tvQuery.getShowDetailQuery(this.slug);
  show = computed(() => this.query.data()?.data || null);

  currentEpisode = computed(() => {
    const row = this.show();
    if (!row) return null;
    const season = row.seasons.find((entry) => entry.seasonNumber === this.seasonNumber());
    return season?.episodes.find((entry) => entry.episodeNumber === this.episodeNumber()) || null;
  });

  constructor() {
    effect(() => {
      const qp = this.route.snapshot.queryParamMap;
      const season = Number.parseInt(qp.get('season') || '1', 10);
      const episode = Number.parseInt(qp.get('episode') || '1', 10);
      this.seasonNumber.set(Number.isFinite(season) && season > 0 ? season : 1);
      this.episodeNumber.set(Number.isFinite(episode) && episode > 0 ? episode : 1);
    }, { allowSignalWrites: true });
  }
}
