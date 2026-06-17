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
import { AdPolicyService } from "../../../../core/services/ad-policy.service";
import { PwaService } from "../../../../core/services/pwa.service";

import { SymbolIconComponent } from "../../../../shared/components/symbol-icon/symbol-icon.component";
import { TvFocusGroupDirective } from "../../../../shared/directives/tv-focus-group.directive";

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
    SymbolIconComponent,
    TvFocusGroupDirective,
  ],
  template: `
    @if (useCinemaShell()) {
      <div
        appTvFocusGroup
        [tvAutoFocus]="true"
        class="min-h-screen bg-[#f6efe8] text-[#24181b] dark:bg-[#090609] dark:text-[#f6efe8]"
      >
        @if (showIntro) {
          <app-branded-intro
            (introFinished)="onIntroFinished()"
          ></app-branded-intro>
        }

        <div class="mx-auto max-w-[1500px] px-6 py-6 md:px-10 xl:px-14">
          <header
            class="mb-6 flex items-center justify-between gap-4 rounded-[2rem] border border-[#dcc5b8] bg-white/70 px-5 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04]"
          >
            <a
              [routerLink]="['/movies', movie()?.slug || slug()]"
              class="inline-flex items-center gap-3 rounded-2xl border border-[#dcc5b8] bg-white/80 px-4 py-3 text-sm font-medium text-[#24181b]/80 transition hover:bg-white hover:text-[#24181b] dark:border-white/10 dark:bg-black/20 dark:text-white/80 dark:hover:bg-white/[0.08] dark:hover:text-white"
            >
              <app-symbol-icon name="arrow_back" [size]="22"></app-symbol-icon>
              Back to Details
            </a>
            @if (movie(); as m) {
              <div class="min-w-0 text-right">
                <p
                  class="truncate text-[11px] uppercase tracking-[0.22em] text-[#d0a97a]"
                >
                  Movie Night
                </p>
                <h1
                  class="truncate text-2xl font-black text-[#24181b] dark:text-white"
                >
                  {{ m.title }}
                </h1>
              </div>
            }
          </header>

          @if (movie(); as m) {
            <div class="grid gap-6 xl:grid-cols-[1.2fr,0.8fr] xl:items-start">
              <div class="space-y-4">
                @if (m.youtubeId) {
                  <app-video-player
                    [youtubeId]="m.youtubeId"
                    [movieId]="m.id"
                    [movie]="m"
                    [config]="playerConfig"
                    (playerReady)="onPlayerReady()"
                  ></app-video-player>
                } @else {
                  @if (streamSource() === "embed") {
                    <app-embed-player
                      [movieId]="m.id"
                      [movieSlug]="m.slug"
                      [durationHintSeconds]="getDurationHintSeconds(m)"
                    ></app-embed-player>
                  } @else if (
                    streamSource() === "hosted" && resolvedStreamUrl()
                  ) {
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
                      <div
                        class="aspect-video rounded-[2rem] border border-[#dcc5b8] bg-white/70 backdrop-blur-sm flex items-center justify-center p-8 text-center dark:border-white/10 dark:bg-black/40"
                      >
                        <div class="max-w-md">
                          <h2
                            class="text-[#24181b] text-2xl font-black dark:text-white"
                          >
                            Stream not available
                          </h2>
                          <p
                            class="mt-3 text-sm text-[#6f5b54] dark:text-white/55"
                          >
                            This title is currently unavailable from active
                            stream providers. Please try another title shortly.
                          </p>
                        </div>
                      </div>
                    }
                  }
                }

                <app-effectivegate-banner></app-effectivegate-banner>

                <!-- SEO Content for Watch Page -->
                <div
                  class="mt-8 rounded-[2rem] border border-[#dcc5b8] bg-white/70 p-8 dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <h2
                    class="text-xl font-bold text-[#24181b] mb-4 dark:text-white"
                  >
                    About this Cinema Experience
                  </h2>
                  <p class="text-[#6f5b54] leading-relaxed dark:text-white/60">
                    You are currently watching <strong>{{ m.title }}</strong
                    >, a {{ m.year }} {{ m.genre.join("/") }} production.
                    NaijasPride offers high-quality streaming for this title
                    with adaptive bitrate support.
                    @if (m.overview || m.description) {
                      <span class="block mt-4">{{
                        m.overview || m.description
                      }}</span>
                    }
                  </p>
                  <div class="mt-6 flex flex-wrap gap-6 text-sm">
                    <div>
                      <span
                        class="block text-[#8a756e] uppercase text-[10px] tracking-wider mb-1 dark:text-white/30"
                        >Director</span
                      >
                      <span class="text-[#24181b] dark:text-white">{{
                        m.metadata?.director || "Unknown"
                      }}</span>
                    </div>
                    <div>
                      <span
                        class="block text-[#8a756e] uppercase text-[10px] tracking-wider mb-1 dark:text-white/30"
                        >Cast</span
                      >
                      <span class="text-[#24181b] dark:text-white">{{
                        (m.metadata?.cast || []).slice(0, 3).join(", ") || "N/A"
                      }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <aside class="space-y-4">
                <div
                  class="rounded-[2rem] border border-[#dcc5b8] bg-white/70 p-6 dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <p
                    class="text-[11px] uppercase tracking-[0.22em] text-[#d0a97a]"
                  >
                    Playback
                  </p>
                  <p
                    class="mt-3 text-lg font-semibold text-[#24181b] dark:text-white"
                  >
                    {{ playbackStatusText() }}
                  </p>
                  <div
                    class="mt-5 grid grid-cols-2 gap-3 text-sm text-[#6f5b54] dark:text-white/65"
                  >
                    <div
                      class="rounded-2xl border border-[#dcc5b8] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-black/20"
                    >
                      <span
                        class="block text-[11px] uppercase tracking-[0.18em] text-[#8a756e] dark:text-white/40"
                        >Mode</span
                      >
                      <span
                        class="mt-2 block font-medium text-[#24181b] dark:text-white"
                        >{{ streamModeLabel() }}</span
                      >
                    </div>
                    <div
                      class="rounded-2xl border border-[#dcc5b8] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-black/20"
                    >
                      <span
                        class="block text-[11px] uppercase tracking-[0.18em] text-[#8a756e] dark:text-white/40"
                        >Offline</span
                      >
                      <span
                        class="mt-2 block font-medium text-[#24181b] dark:text-white"
                        >{{ isOffline() ? "Available" : "No" }}</span
                      >
                    </div>
                  </div>
                </div>

                <div
                  class="rounded-[2rem] border border-[#dcc5b8] bg-white/70 p-6 dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <p
                    class="text-[11px] uppercase tracking-[0.22em] text-[#d0a97a]"
                  >
                    Controls
                  </p>
                  <div
                    class="mt-4 flex flex-wrap gap-3 text-sm text-[#6f5b54] dark:text-white/70"
                  >
                    <span
                      class="rounded-2xl border border-[#dcc5b8] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-black/20"
                      >Left/Right to skip</span
                    >
                    <span
                      class="rounded-2xl border border-[#dcc5b8] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-black/20"
                      >Space to play/pause</span
                    >
                    <span
                      class="rounded-2xl border border-[#dcc5b8] bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-black/20"
                      >F for fullscreen</span
                    >
                  </div>
                </div>

                @if (adPolicy.canShowAds()) {
                  <a
                    [href]="smartlinkUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex w-full items-center justify-center gap-3 rounded-[1.5rem] border border-[#d0a97a]/30 bg-[#800020]/12 px-5 py-4 text-sm font-semibold text-[#f2e6d7] transition hover:bg-[#800020]/22"
                  >
                    <app-symbol-icon
                      name="local_activity"
                      [size]="22"
                    ></app-symbol-icon>
                    Explore sponsor offers
                  </a>
                }
              </aside>
            </div>
          } @else {
            <div class="flex items-center justify-center h-64">
              <div
                class="animate-spin rounded-full h-12 w-12 border-b-2 border-[#800020]"
              ></div>
            </div>
          }
        </div>
      </div>
    } @else {
      <div
        class="min-h-screen bg-[#f8f0e9] text-[#24181b] dark:bg-cinema-900 dark:text-white flex flex-col"
      >
        <!-- Branded Intro -->
        @if (showIntro) {
          <app-branded-intro (introFinished)="onIntroFinished()">
          </app-branded-intro>
        }

        <header
          class="p-4 flex items-center gap-4 bg-white/80 backdrop-blur-md sticky top-0 z-50 dark:bg-black/50"
        >
          <a
            [routerLink]="['/movies', movie()?.slug || slug()]"
            class="text-[#9a857d] dark:text-gray-400 hover:text-[#24181b] dark:hover:text-white transition-colors"
          >
            ← Back to Details
          </a>
          @if (movie(); as m) {
            <h1 class="text-[#24181b] dark:text-white font-serif text-lg">
              {{ m.title }}
            </h1>
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
                @if (streamSource() === "embed") {
                  <app-embed-player
                    [movieId]="m.id"
                    [movieSlug]="m.slug"
                    [durationHintSeconds]="getDurationHintSeconds(m)"
                  ></app-embed-player>
                } @else if (
                  streamSource() === "hosted" && resolvedStreamUrl()
                ) {
                  @if (isOffline()) {
                    <div
                      class="mb-3 flex items-center gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-2 rounded"
                    >
                      <svg
                        class="w-3.5 h-3.5 flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clip-rule="evenodd"
                        />
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
                    <div
                      class="aspect-video rounded-xl border border-[#dcc5b8] bg-white/70 backdrop-blur-sm flex items-center justify-center p-8 text-center dark:border-white/10 dark:bg-black/40"
                    >
                      <div class="max-w-md">
                        <h2
                          class="text-[#24181b] font-serif text-xl dark:text-white"
                        >
                          Stream not available
                        </h2>
                        <p
                          class="text-[#9a857d] dark:text-gray-500 text-sm mt-2"
                        >
                          This title is currently unavailable from active stream
                          providers. Please try another title shortly.
                        </p>
                      </div>
                    </div>
                  }
                }
              }

              <app-effectivegate-banner></app-effectivegate-banner>

              @if (adPolicy.canShowAds()) {
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
                <p
                  class="text-[#9a857d] dark:text-gray-500 text-sm text-center sm:text-left"
                >
                  @if (m.youtubeId) {
                    Streaming via YouTube • Support the creators by subscribing
                    to their channel.
                  } @else if (streamSource() === "embed") {
                    Streaming via embed provider • Switch servers if playback
                    stalls.
                  } @else if (isOffline()) {
                    Playing from offline storage • No internet required.
                  } @else if (resolvedStreamUrl()) {
                    Streaming via NaijasPride • Enjoy the show.
                  } @else {
                    Temporarily unavailable.
                  }
                </p>

                <!-- Keyboard Shortcuts Hint -->
                <div
                  class="flex items-center gap-4 text-[#9a857d] dark:text-gray-600 text-xs"
                >
                  <span class="flex items-center gap-1">
                    <kbd class="bg-[#2a2a2a] dark:bg-gray-800 px-2 py-1 rounded"
                      >←</kbd
                    >
                    <kbd class="bg-[#2a2a2a] dark:bg-gray-800 px-2 py-1 rounded"
                      >→</kbd
                    >
                    Skip
                  </span>
                  <span class="flex items-center gap-1">
                    <kbd class="bg-[#2a2a2a] dark:bg-gray-800 px-2 py-1 rounded"
                      >Space</kbd
                    >
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
    }
  `,
})
export class WatchRoomComponent {
  readonly smartlinkUrl =
    "https://www.effectivegatecpm.com/qm7irj9i?key=106d46d6ef4f93102f2d54643357b11c";
  slug = input<string>("");
  private movieQuery = inject(MoviesQueryService);
  private offlineService = inject(OfflineStorageService);
  protected pwaService = inject(PwaService);
  auth = inject(AuthStateService);
  adPolicy = inject(AdPolicyService);
  query = this.movieQuery.getMovieDetailQuery(this.slug);

  showIntro = true;
  isOffline = signal(false);
  resolvedStreamUrl = signal<string | null>(null);
  streamSource = signal<"embed" | "hosted" | null>(null);

  playerConfig = {
    showSkipButtons: true,
    autoResume: true,
    saveProgress: true,
  };

  constructor() {
    effect(
      () => {
        const m = this.query.data()?.data;
        if (!m) return;
        this._resolveStreamUrl(m);
      },
      { allowSignalWrites: true },
    );
  }

  private async _resolveStreamUrl(movie: Movie) {
    this.resolvedStreamUrl.set(null);
    this.streamSource.set(null);
    this.isOffline.set(false);

    // 1. Offline cache (highest priority — works when offline)
    const preferred = ["4K", "1080p", "720p", "480p"];
    for (const q of preferred) {
      try {
        if (!this.offlineService.isAvailableOffline(movie.id, q)) continue;
        const offlineUrl = await this.offlineService.getOfflineUrl(movie.id, q);
        if (offlineUrl) {
          this.resolvedStreamUrl.set(offlineUrl);
          this.streamSource.set("hosted");
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
      this.streamSource.set("hosted");
      return;
    }

    // 3. Multi-provider embed (fallback when hosted stream is unavailable)
    // Works if the movie has an IMDB ID or TMDB ID
    if (movie.tmdbId || movie.imdbId) {
      this.streamSource.set("embed");
      return;
    }
  }

  movie() {
    return this.query.data()?.data;
  }

  useCinemaShell(): boolean {
    if (this.pwaService.isTV()) return true;
    if (typeof window === "undefined") return false;
    return this.pwaService.isAppMode() && window.innerWidth >= 1100;
  }

  streamModeLabel(): string {
    if (this.isOffline()) return "Offline copy";
    if (this.streamSource() === "embed") return "Embed provider";
    if (this.resolvedStreamUrl()) return "NaijasPride stream";
    return "Unavailable";
  }

  playbackStatusText(): string {
    const m = this.movie();
    if (!m) return "Preparing your screen...";
    if (m.youtubeId) return "Streaming via YouTube with big-screen controls.";
    if (this.isOffline()) return "Playing saved offline copy.";
    if (this.streamSource() === "embed")
      return "Streaming via embed provider. Switch servers if playback stalls.";
    if (this.resolvedStreamUrl()) return "Streaming directly from NaijasPride.";
    return "Temporarily unavailable.";
  }

  private isStreamableVideoUrl(url: string): boolean {
    const raw = (url || "").trim();
    if (!raw) return false;
    if (/^magnet:\?/i.test(raw)) return false;
    if (/\.torrent(\?|#|$)/i.test(raw)) return false;

    const withoutHash = raw.split("#")[0] || raw;
    try {
      const parsed = new URL(withoutHash, "http://localhost");
      const key = parsed.searchParams.get("key");
      const target = (key || parsed.pathname || "").toLowerCase();
      if (target.endsWith(".mp4") || target.endsWith(".m3u8")) return true;
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      const clean = (withoutHash.split("?")[0] || "").toLowerCase();
      if (clean.endsWith(".mp4") || clean.endsWith(".m3u8")) return true;
      return /^https?:\/\//i.test(raw);
    }
  }

  private isHlsManifestUrl(url: string): boolean {
    const raw = (url || "").trim();
    if (!raw) return false;

    const withoutHash = raw.split("#")[0] || raw;
    try {
      const parsed = new URL(withoutHash, "http://localhost");
      const key = parsed.searchParams.get("key");
      const target = (key || parsed.pathname || "").toLowerCase();
      return target.endsWith(".m3u8");
    } catch {
      const clean = (withoutHash.split("?")[0] || "").toLowerCase();
      return clean.endsWith(".m3u8");
    }
  }

  primaryStreamUrl(movie: Movie): string | null {
    const urls = movie?.fileUrls || {};

    // Prefer HLS when available.
    const hls = Object.values(urls).find(
      (value) =>
        typeof value === "string" &&
        value.trim() &&
        this.isHlsManifestUrl(value),
    );
    if (typeof hls === "string") return hls.trim();

    const preferred = ["4K", "1080p", "720p", "480p"];
    for (const key of preferred) {
      const url = urls[key];
      if (
        typeof url === "string" &&
        url.trim() &&
        this.isStreamableVideoUrl(url)
      )
        return url.trim();
    }

    const first = Object.values(urls).find(
      (value) =>
        typeof value === "string" &&
        value.trim() &&
        this.isStreamableVideoUrl(value),
    );
    return typeof first === "string" ? first.trim() : null;
  }

  onIntroFinished() {
    this.showIntro = false;
  }

  onPlayerReady() {
    // Player is ready
  }

  getDurationHintSeconds(movie: Movie): number {
    const minutes = Number(movie?.durationMinutes || 0);
    if (!Number.isFinite(minutes) || minutes <= 0) return 0;
    return Math.floor(minutes * 60);
  }
}
