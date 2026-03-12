import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TvShowsQueryService } from '../../services/tv-shows-query.service';
import { EmbedPlayerComponent } from '../../../../shared/components/embed-player/embed-player.component';
import { PwaService } from '../../../../core/services/pwa.service';
import { SymbolIconComponent } from '../../../../shared/components/symbol-icon/symbol-icon.component';
import { TvFocusGroupDirective } from '../../../../shared/directives/tv-focus-group.directive';

@Component({
  selector: 'app-tv-watch-room',
  standalone: true,
  imports: [CommonModule, RouterLink, EmbedPlayerComponent, SymbolIconComponent, TvFocusGroupDirective],
  template: `
    @if (useCinemaShell()) {
      <div appTvFocusGroup [tvAutoFocus]="true" class="min-h-screen bg-[#090609] px-6 py-6 text-[#f6efe8] md:px-10 xl:px-14">
        <a [routerLink]="['/tv-shows', slug()]" class="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white/80 transition hover:bg-white/[0.08] hover:text-white">
          <app-symbol-icon name="arrow_back" [size]="22"></app-symbol-icon>
          Back to Show
        </a>

        @if (query.isLoading()) {
          <div class="py-16 text-center text-white/70">Loading episode...</div>
        } @else if (!show() || !currentEpisode()) {
          <div class="py-16 text-center text-red-300">Episode not found.</div>
        } @else {
          <div class="mt-6 grid gap-6 xl:grid-cols-[1.2fr,0.8fr] xl:items-start">
            <div class="space-y-4">
              <div class="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
                <p class="text-[11px] uppercase tracking-[0.22em] text-[#d0a97a]">Now Watching</p>
                <h1 class="mt-3 text-3xl font-black text-white">{{ show()!.title }}</h1>
                <p class="mt-2 text-sm text-white/55">Season {{ seasonNumber() }}, Episode {{ episodeNumber() }} - {{ currentEpisode()!.title }}</p>
              </div>

              <app-embed-player
                [contentType]="'tv'"
                [movieId]="show()!.id"
                [movieSlug]="show()!.slug"
                [seasonNumber]="seasonNumber()"
                [episodeNumber]="episodeNumber()"
                [episodeId]="currentEpisode()!.id"
                [durationHintSeconds]="getDurationHintSeconds()"
                (playbackEnded)="onPlaybackEnded()"
              ></app-embed-player>
            </div>

            <aside class="space-y-4">
              <div class="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
                <p class="text-[11px] uppercase tracking-[0.22em] text-[#d0a97a]">Playback</p>
                <p class="mt-3 text-lg font-semibold text-white">Auto-next is {{ autoNext() ? 'on' : 'off' }} for this series.</p>
                <label class="mt-5 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/90">
                  <input type="checkbox" class="h-4 w-4" [checked]="autoNext()" (change)="toggleAutoNext($event)" />
                  Auto next episode
                </label>
              </div>

              <div class="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
                <p class="text-[11px] uppercase tracking-[0.22em] text-[#d0a97a]">Episode Actions</p>
                <div class="mt-4 flex flex-col gap-3">
                  @if (nextEpisodeTarget(); as next) {
                    <button
                      type="button"
                      class="inline-flex items-center justify-center gap-3 rounded-[1.5rem] bg-[#800020] px-5 py-4 text-sm font-semibold text-white transition hover:bg-[#95002a]"
                      (click)="goToEpisode(next.seasonNumber, next.episodeNumber)"
                    >
                      <app-symbol-icon name="skip_next" [size]="24"></app-symbol-icon>
                      Next: S{{ next.seasonNumber }}E{{ next.episodeNumber }}
                    </button>
                  }
                  <a [routerLink]="['/tv-shows', slug()]" class="inline-flex items-center justify-center gap-3 rounded-[1.5rem] border border-white/10 bg-black/20 px-5 py-4 text-sm font-semibold text-white/80 transition hover:bg-white/[0.08] hover:text-white">
                    <app-symbol-icon name="list" [size]="24"></app-symbol-icon>
                    Episode List
                  </a>
                </div>
              </div>
            </aside>
          </div>
        }
      </div>
    } @else {
    <div class="min-h-screen bg-[#0a0a0a] px-4 py-4 md:px-8">
      <a [routerLink]="['/tv-shows', slug()]" class="text-sm text-white/60 hover:text-white">← Back to Show</a>

      @if (query.isLoading()) {
        <div class="py-16 text-center text-white/70">Loading episode...</div>
      } @else if (!show() || !currentEpisode()) {
        <div class="py-16 text-center text-red-300">Episode not found.</div>
      } @else {
        <div class="mt-2 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 class="text-xl font-semibold text-white">{{ show()!.title }}</h1>
            <p class="text-sm text-white/60">Season {{ seasonNumber() }}, Episode {{ episodeNumber() }} - {{ currentEpisode()!.title }}</p>
          </div>
          <label class="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-white/90">
            <input type="checkbox" class="h-3.5 w-3.5" [checked]="autoNext()" (change)="toggleAutoNext($event)" />
            Auto next episode
          </label>
        </div>

        <app-embed-player
          [contentType]="'tv'"
          [movieId]="show()!.id"
          [movieSlug]="show()!.slug"
          [seasonNumber]="seasonNumber()"
          [episodeNumber]="episodeNumber()"
          [episodeId]="currentEpisode()!.id"
          [durationHintSeconds]="getDurationHintSeconds()"
          (playbackEnded)="onPlaybackEnded()"
        ></app-embed-player>

        <div class="mt-4 flex flex-wrap gap-2">
          @if (nextEpisodeTarget(); as next) {
            <button
              type="button"
              class="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs text-white hover:bg-white/20"
              (click)="goToEpisode(next.seasonNumber, next.episodeNumber)"
            >
              Next: S{{ next.seasonNumber }}E{{ next.episodeNumber }}
            </button>
          }
          <a [routerLink]="['/tv-shows', slug()]" class="rounded-full border border-white/20 px-4 py-2 text-xs text-white/80 hover:text-white">Episode List</a>
        </div>
      }
    </div>
    }
  `,
})
export class TvWatchRoomComponent {
  slug = input<string>('');
  private tvQuery = inject(TvShowsQueryService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  protected pwaService = inject(PwaService);

  seasonNumber = signal(1);
  episodeNumber = signal(1);
  autoNext = signal(true);

  private queryParams = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  query = this.tvQuery.getShowDetailQuery(this.slug);
  show = computed(() => this.query.data()?.data || null);

  currentEpisode = computed(() => {
    const row = this.show();
    if (!row) return null;
    const season = row.seasons.find((entry) => entry.seasonNumber === this.seasonNumber());
    return season?.episodes.find((entry) => entry.episodeNumber === this.episodeNumber()) || null;
  });

  nextEpisodeTarget = computed(() => {
    const row = this.show();
    const current = this.currentEpisode();
    if (!row || !current) return null;

    const orderedSeasons = [...row.seasons].sort((a, b) => a.seasonNumber - b.seasonNumber);
    const seasonIndex = orderedSeasons.findIndex((entry) => entry.seasonNumber === this.seasonNumber());
    if (seasonIndex < 0) return null;

    const currentSeason = orderedSeasons[seasonIndex];
    const orderedEpisodes = [...currentSeason.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber);
    const episodeIndex = orderedEpisodes.findIndex((entry) => entry.id === current.id);

    if (episodeIndex >= 0 && episodeIndex < orderedEpisodes.length - 1) {
      return {
        seasonNumber: currentSeason.seasonNumber,
        episodeNumber: orderedEpisodes[episodeIndex + 1].episodeNumber,
      };
    }

    if (seasonIndex < orderedSeasons.length - 1) {
      const nextSeason = orderedSeasons[seasonIndex + 1];
      const firstEpisode = [...nextSeason.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber)[0];
      if (!firstEpisode) return null;
      return {
        seasonNumber: nextSeason.seasonNumber,
        episodeNumber: firstEpisode.episodeNumber,
      };
    }

    return null;
  });

  constructor() {
    effect(() => {
      const qp = this.queryParams();
      const season = Number.parseInt(qp.get('season') || '1', 10);
      const episode = Number.parseInt(qp.get('episode') || '1', 10);
      const auto = qp.get('autoNext');
      this.seasonNumber.set(Number.isFinite(season) && season > 0 ? season : 1);
      this.episodeNumber.set(Number.isFinite(episode) && episode > 0 ? episode : 1);
      this.autoNext.set(auto !== 'false');
    }, { allowSignalWrites: true });
  }

  getDurationHintSeconds(): number {
    const minutes = this.currentEpisode()?.durationMinutes;
    const parsed = Number(minutes || 0);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.floor(parsed * 60);
  }

  toggleAutoNext(event: Event): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? true;
    this.autoNext.set(checked);
    this.updateQueryParams(this.seasonNumber(), this.episodeNumber(), checked);
  }

  onPlaybackEnded(): void {
    if (!this.autoNext()) return;
    const next = this.nextEpisodeTarget();
    if (!next) return;
    this.goToEpisode(next.seasonNumber, next.episodeNumber);
  }

  goToEpisode(seasonNumber: number, episodeNumber: number): void {
    this.seasonNumber.set(seasonNumber);
    this.episodeNumber.set(episodeNumber);
    this.updateQueryParams(seasonNumber, episodeNumber, this.autoNext());
  }

  useCinemaShell(): boolean {
    if (this.pwaService.isTV()) return true;
    if (typeof window === 'undefined') return false;
    return this.pwaService.isAppMode() && window.innerWidth >= 1100;
  }

  private updateQueryParams(seasonNumber: number, episodeNumber: number, autoNext: boolean): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        season: seasonNumber,
        episode: episodeNumber,
        autoNext: autoNext ? null : 'false',
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
