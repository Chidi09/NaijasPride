import { Component, inject, input, signal, effect } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MoviesQueryService } from "../../services/movies-query.service";
import { VideoPlayerComponent } from "../../../../shared/components/video-player/video-player.component";
import { BrandedIntroComponent } from "../../../../shared/components/branded-intro/branded-intro.component";
import { EffectivegateBannerComponent } from "../../../../shared/components/effectivegate-banner/effectivegate-banner.component";
import { EmbedPlayerComponent } from "../../../../shared/components/embed-player/embed-player.component";
import { RouterLink } from "@angular/router";
import { Movie } from "@naijaspride/types";
import { OfflineStorageService } from "../../../../core/services/offline-storage.service";
import { AuthStateService } from "../../../../core/auth/auth-state.service";

@Component({
  selector: "app-watch-room",
  standalone: true,
  imports: [
    CommonModule,
    VideoPlayerComponent,
    BrandedIntroComponent,
    EffectivegateBannerComponent,
    EmbedPlayerComponent,
    RouterLink,
  ],
  template: `
    <div class="min-h-screen bg-[#0a0a0a] dark:bg-cinema-900 flex flex-col">
      <!-- Branded Intro -->
      @if (showIntro) {
        <app-branded-intro (introFinished)="onIntroFinished()">
        </app-branded-intro>
      }

      <header
        class="p-4 flex items-center gap-4 bg-black/50 backdrop-blur-md sticky top-0 z-50"
      >
        <a
          [routerLink]="['/movies', movie()?.slug || slug()]"
          class="text-[#9a857d] dark:text-gray-400 hover:text-[#24181b] dark:hover:text-white transition-colors"
        >
          ← Back to Details
        </a>
        @if (movie(); as m) {
          <h1 class="text-[#24181b] dark:text-white font-serif text-lg">{{ m.title }}</h1>
        }
      </header>

        <div class="flex-grow flex items-center justify-center p-4 md:p-10">
        <div class="w-full max-w-6xl">
          @if (movie(); as m) {
            @if (m.youtubeId) {
              <app-video-player
                [youtubeId]="m.youtubeId"
                [movieId]="m.id"
                [movie]="m"
                [config]="playerConfig"
                (playerReady)="onPlayerReady()"
              >
              </app-video-player>
            } @else {
              @if (streamSource() === 'embed') {
                <app-embed-player
                  [movieId]="m.id"
                  [movieSlug]="m.slug"
                ></app-embed-player>
              } @else if (streamSource() === 'hosted' && resolvedStreamUrl()) {
                @if (isOffline()) {
                  <div class="mb-3 flex items-center gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-2 rounded">
                    <svg class="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                    </svg>
                    Playing saved offline copy
                  </div>
                }
                <app-video-player
                  [videoUrl]="resolvedStreamUrl()!"
                  [movieId]="m.id"
                  [movie]="m"
                  [config]="playerConfig"
                  (playerReady)="onPlayerReady()"
                ></app-video-player>
              } @else {
                @if (primaryStreamUrl(m); as directUrl) {
                  <app-video-player
                    [videoUrl]="directUrl"
                    [movieId]="m.id"
                    [movie]="m"
                    [config]="playerConfig"
                    (playerReady)="onPlayerReady()"
                  ></app-video-player>
                } @else {
                  <div class="aspect-video rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm flex items-center justify-center p-8 text-center">
                    <div class="max-w-md">
                      <h2 class="text-white font-serif text-xl">Stream not available</h2>
                      <p class="text-[#9a857d] dark:text-gray-500 text-sm mt-2">
                        This title is currently unavailable from active stream providers. Please try another title shortly.
                      </p>
                    </div>
                  </div>
                }
              }
            }

            <app-effectivegate-banner></app-effectivegate-banner>

            @if (!auth.currentUser()?.isPremium) {
              <div class="mb-4 flex justify-center">
                <a
                  [href]="smartlinkUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-2 rounded-full border border-[#9a857d]/40 px-4 py-2 text-xs font-semibold text-[#9a857d] transition-colors hover:border-[#9a857d] hover:text-white"
                >
                  Explore sponsor offers
                </a>
              </div>
            }

            <div
              class="mt-2 flex flex-col sm:flex-row items-center justify-between gap-4"
            >
              <p class="text-[#9a857d] dark:text-gray-500 text-sm text-center sm:text-left">
                @if (m.youtubeId) {
                  Streaming via YouTube • Support the creators by subscribing to their channel.
                } @else if (streamSource() === 'embed') {
                  Streaming via embed provider • Switch servers if playback stalls.
                } @else if (isOffline()) {
                  Playing from offline storage • No internet required.
                } @else if (resolvedStreamUrl()) {
                  Streaming via NaijasPride • Enjoy the show.
                } @else {
                  Temporarily unavailable.
                }
              </p>

              <!-- Keyboard Shortcuts Hint -->
              <div class="flex items-center gap-4 text-[#9a857d] dark:text-gray-600 text-xs">
                <span class="flex items-center gap-1">
                  <kbd class="bg-[#2a2a2a] dark:bg-gray-800 px-2 py-1 rounded">←</kbd>
                  <kbd class="bg-[#2a2a2a] dark:bg-gray-800 px-2 py-1 rounded">→</kbd>
                  Skip
                </span>
                <span class="flex items-center gap-1">
                  <kbd class="bg-[#2a2a2a] dark:bg-gray-800 px-2 py-1 rounded">Space</kbd>
                  Play/Pause
                </span>
              </div>
            </div>
          } @else {
            <div class="flex items-center justify-center h-64">
              <div
                class="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"
              ></div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class WatchRoomComponent {
  readonly smartlinkUrl = 'https://www.effectivegatecpm.com/qm7irj9i?key=106d46d6ef4f93102f2d54643357b11c';
  slug = input<string>('');
  private movieQuery = inject(MoviesQueryService);
  private offlineService = inject(OfflineStorageService);
  auth = inject(AuthStateService);
  query = this.movieQuery.getMovieDetailQuery(this.slug);

  showIntro = true;
  isOffline = signal(false);
  resolvedStreamUrl = signal<string | null>(null);
  streamSource = signal<'embed' | 'hosted' | null>(null);

  playerConfig = {
    showSkipButtons: true,
    autoResume: true,
    saveProgress: true,
  };

  constructor() {
    effect(() => {
      const m = this.query.data()?.data;
      if (!m) return;
      this._resolveStreamUrl(m);
    }, { allowSignalWrites: true });
  }

  private async _resolveStreamUrl(movie: Movie) {
    this.resolvedStreamUrl.set(null);
    this.streamSource.set(null);
    this.isOffline.set(false);

    // 1. Offline cache (highest priority — works when offline)
    const preferred = ['4K', '1080p', '720p', '480p'];
    for (const q of preferred) {
      try {
        if (!this.offlineService.isAvailableOffline(movie.id, q)) continue;
        const offlineUrl = await this.offlineService.getOfflineUrl(movie.id, q);
        if (offlineUrl) {
          this.resolvedStreamUrl.set(offlineUrl);
          this.streamSource.set('hosted');
          this.isOffline.set(true);
          return;
        }
      } catch {
        // continue to next priority
      }
    }

    // 2. Self-hosted HLS/MP4
    const hostedUrl = this.primaryStreamUrl(movie);
    if (hostedUrl) {
      this.resolvedStreamUrl.set(hostedUrl);
      this.streamSource.set('hosted');
      return;
    }

    // 3. Multi-provider embed (fallback when hosted stream is unavailable)
    // Works if the movie has an IMDB ID or TMDB ID
    if (movie.tmdbId || movie.imdbId) {
      this.streamSource.set('embed');
      return;
    }
  }

  movie() {
    return this.query.data()?.data;
  }

  private isStreamableVideoUrl(url: string): boolean {
    const raw = (url || '').trim();
    if (!raw) return false;
    if (/^magnet:\?/i.test(raw)) return false;
    if (/\.torrent(\?|#|$)/i.test(raw)) return false;

    const withoutHash = raw.split('#')[0] || raw;
    try {
      const parsed = new URL(withoutHash, 'http://localhost');
      const key = parsed.searchParams.get('key');
      const target = (key || parsed.pathname || '').toLowerCase();
      if (target.endsWith('.mp4') || target.endsWith('.m3u8')) return true;
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      const clean = (withoutHash.split('?')[0] || '').toLowerCase();
      if (clean.endsWith('.mp4') || clean.endsWith('.m3u8')) return true;
      return /^https?:\/\//i.test(raw);
    }
  }

  private isHlsManifestUrl(url: string): boolean {
    const raw = (url || '').trim();
    if (!raw) return false;

    const withoutHash = raw.split('#')[0] || raw;
    try {
      const parsed = new URL(withoutHash, 'http://localhost');
      const key = parsed.searchParams.get('key');
      const target = (key || parsed.pathname || '').toLowerCase();
      return target.endsWith('.m3u8');
    } catch {
      const clean = (withoutHash.split('?')[0] || '').toLowerCase();
      return clean.endsWith('.m3u8');
    }
  }

  primaryStreamUrl(movie: Movie): string | null {
    const urls = movie?.fileUrls || {};

    // Prefer HLS when available.
    const hls = Object.values(urls).find(
      (value) => typeof value === 'string' && value.trim() && this.isHlsManifestUrl(value)
    );
    if (typeof hls === 'string') return hls.trim();

    const preferred = ['4K', '1080p', '720p', '480p'];
    for (const key of preferred) {
      const url = urls[key];
      if (typeof url === 'string' && url.trim() && this.isStreamableVideoUrl(url)) return url.trim();
    }

    const first = Object.values(urls).find(
      (value) => typeof value === 'string' && value.trim() && this.isStreamableVideoUrl(value)
    );
    return typeof first === 'string' ? first.trim() : null;
  }

  onIntroFinished() {
    this.showIntro = false;
  }

  onPlayerReady() {
    // Player is ready
  }
}
