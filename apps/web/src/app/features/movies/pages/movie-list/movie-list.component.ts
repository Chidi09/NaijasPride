import {
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  computed,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  ActivatedRoute,
  Router,
  RouterLink,
  RouterLinkActive,
} from "@angular/router";
import { MoviesQueryService } from "../../services/movies-query.service";
import { MovieCardComponent } from "../../components/movie-card/movie-card.component";
import { FilterBarComponent } from "../../components/filter-bar/filter-bar.component";
import { PaginatorComponent } from "../../../../shared/components/paginator/paginator.component";
import {
  Genre,
  MovieSearchParams,
  Quality,
  MovieSummary,
} from "@naijaspride/types";
import { WatchApiService } from "../../../watch/services/watch-api.service";
import { AuthStateService } from "../../../../core/auth/auth-state.service";
import { HttpClient } from "@angular/common/http";
import { PwaService } from "../../../../core/services/pwa.service";
import { SymbolIconComponent } from "../../../../shared/components/symbol-icon/symbol-icon.component";
import { TvFocusGroupDirective } from "../../../../shared/directives/tv-focus-group.directive";

type MovieSectionKey =
  | "trending"
  | "latest-2026"
  | "latest-2025"
  | "highest-rated"
  | "award-winning";

const MOVIE_SECTION_LABELS: Record<MovieSectionKey, string> = {
  trending: "Trending",
  "latest-2026": "Latest Releases (2026)",
  "latest-2025": "Latest Releases (2025)",
  "highest-rated": "Highest Rated",
  "award-winning": "Award Winning",
};

@Component({
  selector: "app-movie-list",
  standalone: true,
  imports: [
    CommonModule,
    MovieCardComponent,
    FilterBarComponent,
    PaginatorComponent,
    RouterLink,
    RouterLinkActive,
    SymbolIconComponent,
    TvFocusGroupDirective,
  ],
  styles: [
    `
      :host {
        display: block;
      }

      @keyframes fade-in-up {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes scale-in {
        from {
          opacity: 0;
          transform: scale(0.95);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      @keyframes pulse-slow {
        0%,
        100% {
          opacity: 0.3;
          transform: scale(1);
        }
        50% {
          opacity: 0.5;
          transform: scale(1.05);
        }
      }

      .animate-fade-in-up {
        animation: fade-in-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        opacity: 0;
      }

      .animate-scale-in {
        animation: scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }

      .animate-pulse-slow {
        animation: pulse-slow 8s ease-in-out infinite;
      }

      .animate-pulse-slow-delayed {
        animation: pulse-slow 10s ease-in-out infinite;
        animation-delay: -4s;
      }

      .animation-delay-200 {
        animation-delay: 0.2s;
      }

      .animation-delay-300 {
        animation-delay: 0.3s;
      }

      .animation-delay-400 {
        animation-delay: 0.4s;
      }

      /* Scrollbar Styling */
      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }

      ::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 4px;
      }

      ::-webkit-scrollbar-thumb {
        background: rgba(128, 0, 32, 0.5);
        border-radius: 4px;
      }

      ::-webkit-scrollbar-thumb:hover {
        background: rgba(128, 0, 32, 0.7);
      }

      /* Skeleton */
      @keyframes shimmer {
        0% {
          background-position: -800px 0;
        }
        100% {
          background-position: 800px 0;
        }
      }
      .skeleton {
        background: linear-gradient(
          90deg,
          #120a0d 25%,
          #1e1014 50%,
          #120a0d 75%
        );
        background-size: 1600px 100%;
        animation: shimmer 1.5s infinite;
        border-radius: 10px;
      }
      :host-context(.light) .skeleton,
      :host-context(:not(.dark)) .skeleton {
        background: linear-gradient(
          90deg,
          #e8d8d0 25%,
          #f2e6df 50%,
          #e8d8d0 75%
        );
        background-size: 1600px 100%;
      }
    `,
  ],
  template: `
    @if (useLivingRoomShell()) {
      <section
        appTvFocusGroup
        [tvAutoFocus]="true"
        class="min-h-screen w-full overflow-hidden bg-[#090609] text-[#f6efe8]"
      >
        <main class="overflow-y-auto">
          <section
            class="relative min-h-[72vh] overflow-hidden border-b border-white/10"
          >
            <div
              class="absolute inset-0 bg-cover bg-center"
              [style.background-image]="movieHeroBackground()"
            ></div>
            <div
              class="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,6,9,0.96)_0%,rgba(9,6,9,0.72)_42%,rgba(9,6,9,0.16)_100%),linear-gradient(0deg,rgba(9,6,9,1)_0%,rgba(9,6,9,0.34)_46%,rgba(9,6,9,0)_100%)]"
            ></div>

            <div
              class="relative z-10 flex min-h-[72vh] max-w-5xl flex-col justify-center px-8 py-12 md:px-12 xl:px-20"
            >
              <div
                class="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.22em] text-white/55"
              >
                <span
                  class="rounded-full border border-[#d0a97a]/40 bg-[#d0a97a]/10 px-3 py-1 text-[#ecd8b7]"
                  >Cinema Collection</span
                >
                <span>{{ heroMovieMeta() }}</span>
              </div>
              <h1
                class="mt-5 text-5xl font-black leading-[0.95] text-white md:text-7xl"
              >
                Movies
              </h1>
              <p class="mt-5 max-w-2xl text-base leading-8 text-white/68">
                Discover the latest blockbusters, trending films, and cinematic
                masterpieces from around the world in the new living-room shell.
              </p>

              <div
                class="mt-8 flex max-w-3xl flex-col gap-3 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md"
              >
                <div class="flex flex-col gap-3 md:flex-row md:items-center">
                  <div
                    class="flex flex-1 items-center gap-3 rounded-2xl bg-black/20 px-4 py-3"
                  >
                    <app-symbol-icon
                      name="search"
                      [size]="22"
                    ></app-symbol-icon>
                    <input
                      [value]="searchParams().q || ''"
                      (input)="onHeroSearch($event)"
                      class="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                      placeholder="Search by movie title..."
                    />
                  </div>
                  <div class="flex gap-3">
                    <button
                      type="button"
                      (click)="resetFilters()"
                      class="rounded-2xl border border-white/15 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/[0.08]"
                    >
                      Reset
                    </button>
                  </div>
                </div>
                <div
                  class="overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-2"
                >
                  <app-filter-bar
                    [activeFilters]="searchParams()"
                    (filterChange)="onFilterChange($event)"
                  ></app-filter-bar>
                </div>
              </div>
            </div>
          </section>

          <div class="space-y-12 px-8 pb-16 pt-10 md:px-12 xl:px-20">
            @if (!hasActiveFilters()) {
              <section>
                <div class="mb-5 flex items-center justify-between">
                  <h2 class="text-2xl font-bold text-white">Curated For You</h2>
                  <div class="hidden md:flex gap-2">
                    @for (key of sectionKeys; track key) {
                      <button
                        type="button"
                        class="rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em]"
                        [class]="
                          activeSection() === key
                            ? 'bg-[#d0a97a] text-[#12090d]'
                            : 'bg-white/10 text-white/65 hover:bg-white/20'
                        "
                        (click)="applySection(key)"
                      >
                        {{ sectionLabel(key) }}
                      </button>
                    }
                  </div>
                </div>

                @for (key of sectionKeys; track key) {
                  <div class="mb-10">
                    <div class="mb-4 flex items-center justify-between">
                      <div>
                        <h3 class="text-lg font-semibold text-white">
                          {{ sectionLabel(key) }}
                        </h3>
                        <p
                          class="text-xs uppercase tracking-[0.18em] text-white/45"
                        >
                          {{ sectionQuery(key).data()?.data?.length || 0 }}
                          movies
                        </p>
                      </div>
                      <button
                        type="button"
                        (click)="applySection(key)"
                        class="text-sm font-medium text-[#d0a97a] hover:text-[#ead9bf]"
                      >
                        View all
                      </button>
                    </div>
                    <div class="flex gap-5 overflow-x-auto pb-2">
                      @for (
                        movie of (sectionQuery(key).data()?.data || []).slice(
                          0,
                          10
                        );
                        track movie.id
                      ) {
                        <a
                          [routerLink]="['/movies', movie.slug]"
                          class="group block w-48 flex-shrink-0"
                        >
                          <div
                            class="relative aspect-[2/3] overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/[0.04]"
                          >
                            <img
                              [src]="
                                movie.posterUrl ||
                                movie.thumbnailUrl ||
                                '/assets/images/poster-placeholder.svg'
                              "
                              [alt]="movie.title"
                              class="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                              loading="lazy"
                            />
                          </div>
                          <p
                            class="mt-3 line-clamp-2 text-sm font-semibold text-white"
                          >
                            {{ movie.title }}
                          </p>
                          <p class="text-xs text-white/50">
                            {{ movie.year || "Feature" }} •
                            {{ movie.genre?.[0] || "Movie" }}
                          </p>
                        </a>
                      }
                    </div>
                  </div>
                }
              </section>
            }

            <section id="movies-full-list" class="scroll-mt-24">
              <div class="mb-6 flex items-center justify-between">
                <div>
                  <h2 class="text-2xl font-bold text-white">
                    {{ fullListTitle() }}
                  </h2>
                  <p class="mt-1 text-sm text-white/45">
                    {{ query.data()?.meta?.total || 0 }} movies found
                  </p>
                </div>
              </div>

              @if (query.isPending()) {
                <div
                  class="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5"
                >
                  @for (i of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; track i) {
                    <div class="animate-pulse">
                      <div
                        class="aspect-[2/3] rounded-[1.6rem] bg-white/5"
                      ></div>
                    </div>
                  }
                </div>
              } @else {
                <div
                  class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                >
                  @for (movie of streamMovies(); track movie.id) {
                    <app-movie-card
                      [movie]="movie"
                      [progress]="watchProgressByMovieId()[movie.id] ?? null"
                    />
                  }
                </div>
              }
            </section>
          </div>
        </main>
      </section>
    } @else {
      <section class="relative min-h-screen overflow-hidden bg-[#0a0a0a]">
        <!-- Animated Background -->
        <div class="pointer-events-none fixed inset-0 z-0">
          <div
            class="absolute inset-0 bg-gradient-to-br from-[#800020]/5 via-transparent to-[#1a0a0a]/50"
          ></div>
          <div
            class="absolute -left-1/4 -top-1/4 h-[600px] w-[600px] rounded-full bg-[#800020]/10 blur-[120px] animate-pulse-slow"
          ></div>
          <div
            class="absolute -bottom-1/4 -right-1/4 h-[800px] w-[800px] rounded-full bg-[#4a0015]/20 blur-[150px] animate-pulse-slow-delayed"
          ></div>
          <!-- Grid Pattern -->
          <div
            class="absolute inset-0 opacity-[0.02]"
            style="background-image: linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px); background-size: 60px 60px;"
          ></div>
        </div>

        <!-- Auto-play Hero -->
        <div
          class="relative z-10 overflow-hidden border-b border-white/5"
          style="min-height:68vh"
        >
          <!-- YouTube background iframe -->
          @if (heroYoutubeUrl()) {
            <iframe
              [src]="heroYoutubeUrl()!"
              class="hero-yt-iframe absolute inset-0 w-[300%] h-[300%] -left-[100%] -top-[100%] pointer-events-none border-0"
              allow="autoplay; encrypted-media"
              [attr.allowfullscreen]="false"
            ></iframe>
          } @else if (
            heroFeature()?.backdropUrl || heroFeature()?.thumbnailUrl
          ) {
            <div
              class="absolute inset-0 bg-cover bg-center scale-105 transition-all duration-1000"
              [style.background-image]="
                'url(' +
                (heroFeature()!.backdropUrl || heroFeature()!.thumbnailUrl) +
                ')'
              "
            ></div>
          }

          <!-- Gradient overlays -->
          <div
            class="absolute inset-0 pointer-events-none"
            style="background:linear-gradient(90deg,rgba(10,10,10,0.97) 0%,rgba(10,10,10,0.65) 55%,rgba(10,10,10,0.15) 100%),linear-gradient(0deg,rgba(10,10,10,1) 0%,rgba(10,10,10,0.4) 40%,rgba(10,10,10,0) 100%)"
          ></div>

          <!-- Content -->
          <div
            class="relative z-10 flex min-h-[68vh] flex-col justify-end max-w-7xl mx-auto px-4 md:px-6 pb-12 pt-24"
          >
            @if (heroFeature(); as m) {
              <div class="max-w-2xl animate-fade-in-up">
                <div class="flex items-center gap-2.5 mb-3">
                  <p
                    class="text-[11px] uppercase tracking-[0.28em] text-[#800020] font-semibold"
                  >
                    Featured
                  </p>
                  @if (m.youtubeId) {
                    <span
                      class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"
                    ></span>
                    <span
                      class="text-[11px] text-white/35 uppercase tracking-wider"
                      >Now Playing</span
                    >
                  }
                </div>
                <h1
                  class="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-none mb-3"
                >
                  {{ m.title }}
                </h1>
                <p class="text-white/50 text-sm mb-6">
                  {{ m.year }}
                  @if (m.genre?.[0]) {
                    <span class="mx-1.5 text-white/20">·</span> {{ m.genre[0] }}
                  }
                  @if (m.durationMinutes) {
                    <span class="mx-1.5 text-white/20">·</span>
                    {{ m.durationMinutes }} min
                  }
                </p>
                <div class="flex flex-wrap items-center gap-3">
                  @if (m.youtubeId || m.canStream) {
                    <a
                      [routerLink]="['/watch', m.slug || m.id]"
                      class="flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-bold text-sm hover:bg-gray-100 active:scale-95 transition"
                    >
                      <svg
                        class="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Watch
                    </a>
                  }
                  <a
                    [routerLink]="['/movies', m.slug || m.id]"
                    class="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/15 text-white font-bold text-sm hover:bg-white/25 active:scale-95 transition backdrop-blur-sm"
                  >
                    <svg
                      class="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Details
                  </a>
                  @if (m.youtubeId) {
                    <button
                      type="button"
                      (click)="toggleHeroMute()"
                      class="p-2.5 rounded-full border border-white/20 text-white hover:bg-white/10 active:scale-95 transition"
                      [attr.aria-label]="heroMuted() ? 'Unmute' : 'Mute'"
                    >
                      @if (heroMuted()) {
                        <svg
                          class="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                          />
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                          />
                        </svg>
                      } @else {
                        <svg
                          class="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-9.536a5 5 0 000 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                          />
                        </svg>
                      }
                    </button>
                  }
                </div>
              </div>
            } @else {
              <div class="max-w-xl animate-fade-in-up">
                <p
                  class="text-[11px] uppercase tracking-[0.28em] text-[#800020] font-semibold mb-2"
                >
                  Cinema Collection
                </p>
                <h1
                  class="text-4xl font-bold text-white md:text-5xl lg:text-6xl tracking-tight"
                >
                  Movies
                </h1>
                <p class="mt-3 text-base text-white/50">
                  Blockbusters, award-winners, and hidden gems.
                </p>
              </div>
            }
          </div>
        </div>

        <!-- Filters Section -->
        <div
          class="animate-fade-in-up animation-delay-200 relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-sm"
        >
          <div class="mx-auto max-w-7xl px-4 py-4 md:px-6">
            <app-filter-bar
              [activeFilters]="searchParams()"
              (filterChange)="onFilterChange($event)"
            />
          </div>
        </div>

        <!-- Content -->
        <div class="relative z-10 mx-auto max-w-7xl px-4 py-10 md:px-6">
          <!-- Curated Sections (only show when no search/filters active) -->
          @if (!hasActiveFilters()) {
            <div class="mb-16">
              <div class="mb-8 flex items-center justify-between">
                <div>
                  <h2 class="text-2xl font-bold text-white">Curated For You</h2>
                  <p class="mt-1 text-sm text-white/40">
                    Handpicked collections updated daily
                  </p>
                </div>
                <div class="hidden md:flex items-center gap-2">
                  @for (key of sectionKeys; track key) {
                    <button
                      class="group relative overflow-hidden rounded-full border px-4 py-2 text-xs font-medium transition-all duration-300"
                      [class]="
                        activeSection() === key
                          ? 'border-[#800020] bg-[#800020] text-white shadow-lg shadow-[#800020]/25'
                          : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30 hover:bg-white/10 hover:text-white'
                      "
                      (click)="applySection(key)"
                    >
                      <span class="relative z-10">{{ sectionLabel(key) }}</span>
                      @if (activeSection() === key) {
                        <div
                          class="absolute inset-0 bg-gradient-to-r from-[#800020] to-[#a00030]"
                        ></div>
                      }
                    </button>
                  }
                </div>
              </div>

              <!-- Mobile Section Tabs -->
              <div class="mb-8 flex flex-wrap gap-2 md:hidden">
                @for (key of sectionKeys; track key) {
                  <button
                    class="rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-300"
                    [class]="
                      activeSection() === key
                        ? 'border-[#800020] bg-[#800020] text-white'
                        : 'border-white/10 bg-white/5 text-white/60'
                    "
                    (click)="applySection(key)"
                  >
                    {{ sectionLabel(key) }}
                  </button>
                }
              </div>

              <!-- Netflix-style horizontal scroll rows -->
              <div class="space-y-10">
                @for (key of sectionKeys; track key) {
                  <div>
                    <div class="mb-3 flex items-center justify-between">
                      <h3
                        class="flex items-center gap-2 text-lg font-bold text-white"
                      >
                        @switch (key) {
                          @case ("trending") {
                            <span
                              class="material-symbols-outlined"
                              aria-hidden="true"
                              >local_fire_department</span
                            >
                          }
                          @case ("latest-2026") {
                            <span
                              class="material-symbols-outlined"
                              aria-hidden="true"
                              >new_releases</span
                            >
                          }
                          @case ("latest-2025") {
                            <span
                              class="material-symbols-outlined"
                              aria-hidden="true"
                              >movie</span
                            >
                          }
                          @case ("highest-rated") {
                            <span
                              class="material-symbols-outlined"
                              aria-hidden="true"
                              >star</span
                            >
                          }
                          @case ("award-winning") {
                            <span
                              class="material-symbols-outlined"
                              aria-hidden="true"
                              >emoji_events</span
                            >
                          }
                        }
                        {{ sectionLabel(key) }}
                      </h3>
                      <button
                        class="flex items-center gap-1 text-sm font-medium text-white/50 transition hover:text-white"
                        (click)="applySection(key)"
                      >
                        See all
                        <svg
                          class="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </button>
                    </div>

                    <div
                      class="flex gap-3 overflow-x-auto pb-3"
                      style="scrollbar-width:none;-webkit-overflow-scrolling:touch"
                    >
                      @if (sectionQuery(key).isLoading()) {
                        @for (i of [1, 2, 3, 4, 5, 6, 7, 8]; track i) {
                          <div class="w-[140px] flex-shrink-0 animate-pulse">
                            <div
                              class="aspect-[2/3] rounded-xl bg-white/5"
                            ></div>
                            <div
                              class="mt-2 h-3 w-4/5 rounded bg-white/5"
                            ></div>
                          </div>
                        }
                      } @else {
                        @for (
                          movie of (sectionQuery(key).data()?.data || []).slice(
                            0,
                            10
                          );
                          track movie.id
                        ) {
                          <div class="w-[140px] flex-shrink-0">
                            <app-movie-card
                              [movie]="movie"
                              [progress]="
                                watchProgressByMovieId()[movie.id] ?? null
                              "
                            />
                          </div>
                        }
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Full Catalog Section -->
          <div id="movies-full-list" class="scroll-mt-24">
            <div class="mb-6 flex items-center justify-between">
              <div>
                <h2
                  class="flex items-center gap-3 text-2xl font-bold text-white"
                >
                  {{ fullListTitle() }}
                  @if (query.isFetching()) {
                    <span
                      class="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-[#800020] border-t-transparent"
                    ></span>
                  }
                </h2>
                <p class="mt-1 text-sm text-white/40">
                  {{ query.data()?.meta?.total || 0 }} movies found
                </p>
              </div>
            </div>

            @if (query.isPending()) {
              <!-- Skeleton Loading -->
              <div
                class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
              >
                @for (i of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; track i) {
                  <div class="animate-pulse">
                    <div class="aspect-[2/3] rounded-xl bg-white/5"></div>
                    <div class="mt-3 h-4 w-3/4 rounded bg-white/5"></div>
                    <div class="mt-2 h-3 w-1/2 rounded bg-white/5"></div>
                  </div>
                }
              </div>
            } @else if (query.isError()) {
              <!-- Error State -->
              <div
                class="flex flex-col items-center justify-center py-20 text-center"
              >
                <div
                  class="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10"
                >
                  <svg
                    class="h-10 w-10 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <h3 class="text-lg font-semibold text-white">
                  Failed to load movies
                </h3>
                <p class="mt-2 text-sm text-white/40">Please try again later</p>
                <button
                  class="mt-4 rounded-full bg-[#800020] px-6 py-2 text-sm font-medium text-white transition hover:bg-[#a00030]"
                  (click)="query.refetch()"
                >
                  Retry
                </button>
              </div>
            } @else if (streamMovies().length === 0) {
              <!-- Empty State -->
              <div
                class="flex flex-col items-center justify-center py-20 text-center"
              >
                <div class="mb-4">
                  <span
                    class="material-symbols-outlined text-6xl"
                    aria-hidden="true"
                    >movie</span
                  >
                </div>
                <h3 class="text-xl font-semibold text-white">
                  No movies found
                </h3>
                <p class="mt-2 max-w-md text-sm text-white/40">
                  Try adjusting your filters or search for something else.
                </p>
                <button
                  class="mt-6 rounded-full border border-white/10 bg-white/5 px-6 py-2 text-sm font-medium text-white transition-all hover:border-[#800020]/50 hover:bg-[#800020]/10"
                  (click)="resetFilters()"
                >
                  Clear Filters
                </button>
              </div>
            } @else {
              <!-- Results Grid -->
              <div
                class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
              >
                @for (movie of streamMovies(); track movie.id) {
                  <app-movie-card
                    [movie]="movie"
                    [progress]="watchProgressByMovieId()[movie.id] ?? null"
                  />
                }
              </div>

              <!-- Pagination -->
              @if ((query.data()?.meta?.totalPages || 0) > 1) {
                <div class="mt-10 flex items-center justify-center gap-2">
                  <button
                    class="group flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-all duration-300 hover:border-[#800020]/50 hover:bg-[#800020]/10 disabled:cursor-not-allowed disabled:opacity-30"
                    [disabled]="!meta()?.hasPrev"
                    (click)="goPrev()"
                  >
                    <svg
                      class="h-5 w-5 transition-transform duration-300 group-hover:-translate-x-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>

                  @for (value of pageButtons(); track value) {
                    <button
                      class="relative h-10 w-10 rounded-full text-sm font-medium transition-all duration-300"
                      [class]="
                        value === searchParams().page
                          ? 'bg-[#800020] text-white shadow-lg shadow-[#800020]/30'
                          : 'border border-white/10 bg-white/5 text-white/60 hover:border-white/30 hover:bg-white/10 hover:text-white'
                      "
                      (click)="goToPage(value)"
                    >
                      {{ value }}
                    </button>
                  }

                  <button
                    class="group flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-all duration-300 hover:border-[#800020]/50 hover:bg-[#800020]/10 disabled:cursor-not-allowed disabled:opacity-30"
                    [disabled]="!meta()?.hasNext"
                    (click)="goNext()"
                  >
                    <svg
                      class="h-5 w-5 transition-transform duration-300 group-hover:translate-x-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </div>
              }
            }
          </div>
        </div>

        <!-- Footer Spacing -->
        <div class="h-20"></div>
      </section>
    }
  `,
})
export class MovieListComponent {
  sectionKeys: MovieSectionKey[] = [
    "trending",
    "latest-2026",
    "latest-2025",
    "highest-rated",
    "award-winning",
  ];

  searchParams = signal<MovieSearchParams>({
    page: 1,
    limit: 30,
    sortBy: "trending",
    youtubeOnly: false,
  });

  activeSection = signal<MovieSectionKey>("trending");

  private moviesService = inject(MoviesQueryService);
  private watchApi = inject(WatchApiService);
  private authState = inject(AuthStateService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private http = inject(HttpClient);
  protected pwaService = inject(PwaService);
  private sanitizer = inject(DomSanitizer);

  // Hero auto-play
  heroMuted = signal(true);
  private heroMovieIndex = signal(Math.floor(Math.random() * 5));

  private syncingFromUrl = false;

  watchProgressByMovieId = signal<Record<string, number>>({});
  query = this.moviesService.getMoviesQuery(this.searchParams);

  // Curated section queries
  trendingQuery = this.moviesService.getMoviesQuery(
    computed(() => ({ page: 1, limit: 9, sortBy: "trending" as const })),
  );
  latest2026Query = this.moviesService.getMoviesQuery(
    computed(() => ({
      page: 1,
      limit: 9,
      sortBy: "latest" as const,
      year: 2026,
    })),
  );
  latest2025Query = this.moviesService.getMoviesQuery(
    computed(() => ({
      page: 1,
      limit: 9,
      sortBy: "latest" as const,
      year: 2025,
    })),
  );
  highestRatedQuery = this.moviesService.getMoviesQuery(
    computed(() => ({ page: 1, limit: 9, sortBy: "popular" as const })),
  );
  awardWinningQuery = this.moviesService.getMoviesQuery(
    computed(() => ({
      page: 1,
      limit: 9,
      sortBy: "popular" as const,
      genre: [Genre.Drama],
    })),
  );

  meta = computed(() => this.query.data()?.meta);

  pageButtons = computed(() => {
    const total = this.meta()?.totalPages || 1;
    const current = this.searchParams().page || 1;
    const start = Math.max(1, current - 2);
    const end = Math.min(total, start + 4);
    const values: number[] = [];
    for (let value = start; value <= end; value++) values.push(value);
    return values;
  });

  fullListTitle = computed(() => {
    const label = this.sectionLabel(this.activeSection());
    return `${label} - Full Catalog`;
  });

  featuredMovie = computed(
    () => (this.trendingQuery.data()?.data || [])[0] || null,
  );

  heroFeature = computed((): MovieSummary | null => {
    const movies = this.trendingQuery.data()?.data || [];
    if (!movies.length) return null;
    const withYt = movies.filter((m) => m.youtubeId);
    const pool = withYt.length ? withYt : movies;
    return pool[this.heroMovieIndex() % pool.length] || null;
  });

  heroYoutubeUrl = computed((): SafeResourceUrl | null => {
    const id = this.heroFeature()?.youtubeId;
    if (!id) return null;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&loop=1&playlist=${id}&modestbranding=1&iv_load_policy=3&enablejsapi=1&origin=${origin}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  toggleHeroMute(): void {
    const iframe =
      typeof document !== "undefined"
        ? (document.querySelector(
            ".hero-yt-iframe",
          ) as HTMLIFrameElement | null)
        : null;
    if (iframe?.contentWindow) {
      const cmd = this.heroMuted()
        ? '{"event":"command","func":"unMute","args":[]}'
        : '{"event":"command","func":"mute","args":[]}';
      iframe.contentWindow.postMessage(cmd, "*");
    }
    this.heroMuted.update((v) => !v);
  }

  useLivingRoomShell(): boolean {
    if (this.pwaService.isTV()) return true;
    if (typeof window === "undefined") return false;
    return window.innerWidth >= 1200;
  }

  movieHeroBackground(): string {
    const movie = this.featuredMovie();
    const image =
      movie?.thumbnailUrl ||
      movie?.posterUrl ||
      "/assets/images/poster-placeholder.svg";
    return `url(${image})`;
  }

  heroMovieMeta(): string {
    const movie = this.featuredMovie();
    if (!movie) return "Premium cinema discovery";
    return `${movie.year || "Featured"} • ${movie.genre?.[0] || "Cinema"}`;
  }

  onHeroSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.onFilterChange({ q: value || undefined });
  }

  hasActiveFilters = computed(() => {
    const params = this.searchParams();
    return !!(
      params.q?.trim() ||
      params.genre?.length ||
      params.year ||
      params.quality
    );
  });

  constructor() {
    // URL -> state sync (fixes pagination back-button issues)
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const page = Math.max(1, Number(params.get("page") || 1) || 1);
        const limit = Math.min(
          50,
          Math.max(1, Number(params.get("limit") || 30) || 30),
        );
        const q = (params.get("q") || "").trim() || undefined;
        const year = params.get("year")
          ? Number(params.get("year"))
          : undefined;
        const sortBy = (params.get("sortBy") ||
          "trending") as MovieSearchParams["sortBy"];
        const genreParam = (params.get("genre") || "").trim();
        const qualityParam = (params.get("quality") || "").trim();

        const genre =
          genreParam && Object.values(Genre).includes(genreParam as Genre)
            ? ([genreParam as Genre] as Genre[])
            : undefined;

        const quality =
          qualityParam &&
          Object.values(Quality).includes(qualityParam as Quality)
            ? (qualityParam as Quality)
            : undefined;

        this.syncingFromUrl = true;
        this.searchParams.set({
          page,
          limit,
          sortBy,
          q,
          year: Number.isFinite(year as number) ? (year as number) : undefined,
          genre,
          quality,
          youtubeOnly: false,
        });

        // Set active section based on params
        if (sortBy === "trending") {
          this.activeSection.set("trending");
        } else if (sortBy === "latest" && year === 2026) {
          this.activeSection.set("latest-2026");
        } else if (sortBy === "latest" && year === 2025) {
          this.activeSection.set("latest-2025");
        } else if (sortBy === "popular" && !genre) {
          this.activeSection.set("highest-rated");
        } else if (sortBy === "popular" && genre?.includes(Genre.Drama)) {
          this.activeSection.set("award-winning");
        }

        this.syncingFromUrl = false;
      });

    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const slug = params.get("slug");
        if (!slug) {
          return;
        }

        this.searchParams.update((current) => ({
          ...current,
          genre: [this.mapCategorySlugToGenre(slug)],
          page: 1,
        }));

        // Keep URL in sync for sharable category pages.
        this.syncUrl({
          ...this.searchParams(),
          genre: [this.mapCategorySlugToGenre(slug)],
          page: 1,
        });
      });

    effect(
      () => {
        const user = this.authState.currentUser();
        if (!user) {
          this.watchProgressByMovieId.set({});
          return;
        }
        this.loadWatchProgress();
      },
      { allowSignalWrites: true },
    );
  }

  sectionLabel(key: MovieSectionKey): string {
    return MOVIE_SECTION_LABELS[key];
  }

  sectionQuery(key: MovieSectionKey) {
    if (key === "latest-2026") return this.latest2026Query;
    if (key === "latest-2025") return this.latest2025Query;
    if (key === "highest-rated") return this.highestRatedQuery;
    if (key === "award-winning") return this.awardWinningQuery;
    return this.trendingQuery;
  }

  applySection(section: MovieSectionKey): void {
    this.activeSection.set(section);

    if (section === "latest-2026") {
      this.searchParams.update((current) => ({
        ...current,
        sortBy: "latest",
        year: 2026,
        genre: undefined,
        page: 1,
      }));
    } else if (section === "latest-2025") {
      this.searchParams.update((current) => ({
        ...current,
        sortBy: "latest",
        year: 2025,
        genre: undefined,
        page: 1,
      }));
    } else if (section === "highest-rated") {
      this.searchParams.update((current) => ({
        ...current,
        sortBy: "popular",
        year: undefined,
        genre: undefined,
        page: 1,
      }));
    } else if (section === "award-winning") {
      this.searchParams.update((current) => ({
        ...current,
        sortBy: "popular",
        genre: [Genre.Drama],
        year: undefined,
        page: 1,
      }));
    } else {
      this.searchParams.update((current) => ({
        ...current,
        sortBy: "trending",
        genre: undefined,
        year: undefined,
        page: 1,
      }));
    }

    this.syncUrl(this.searchParams());
    this.scrollToFullList();
  }

  // Merge new filters into existing params
  onFilterChange(changes: Partial<MovieSearchParams>) {
    this.searchParams.update((current: MovieSearchParams) => {
      const next = {
        ...current,
        ...changes,
        page: 1, // Always reset to page 1 when filtering
      };
      this.syncUrl(next);
      return next;
    });
  }

  resetFilters(): void {
    this.searchParams.set({
      page: 1,
      limit: 30,
      sortBy: "trending",
      youtubeOnly: false,
    });
    this.activeSection.set("trending");
    this.syncUrl(this.searchParams());
  }

  goPrev(): void {
    if (!this.meta()?.hasPrev) return;
    this.searchParams.update((current) => ({
      ...current,
      page: Math.max(1, (current.page || 1) - 1),
    }));
    this.syncUrl(this.searchParams());
    this.scrollToFullList();
  }

  goNext(): void {
    if (!this.meta()?.hasNext) return;
    this.searchParams.update((current) => ({
      ...current,
      page: (current.page || 1) + 1,
    }));
    this.syncUrl(this.searchParams());
    this.scrollToFullList();
  }

  goToPage(value: number): void {
    if (value === this.searchParams().page) return;
    this.searchParams.update((current) => ({
      ...current,
      page: value,
    }));
    this.syncUrl(this.searchParams());
    this.scrollToFullList();
  }

  private syncUrl(params: MovieSearchParams) {
    if (this.syncingFromUrl) {
      return;
    }

    const queryParams: Record<string, string | number | boolean | undefined> = {
      page: params.page || 1,
      limit: params.limit || 30,
      sortBy: params.sortBy || "trending",
      q: params.q || undefined,
      year: params.year || undefined,
      genre: params.genre?.[0] || undefined,
      quality: params.quality || undefined,
      youtubeOnly: false,
    };

    // Remove empty keys to keep URL clean.
    for (const key of Object.keys(queryParams)) {
      if (
        queryParams[key] === undefined ||
        queryParams[key] === null ||
        queryParams[key] === ""
      ) {
        delete queryParams[key];
      }
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      replaceUrl: true,
    });
  }

  private loadWatchProgress() {
    this.watchApi
      .getWatchHistory({ page: 1, limit: 200 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const progressMap: Record<string, number> = {};
          for (const item of response.data || []) {
            if (!item.movie?.id || item.progressPercentage <= 0) {
              continue;
            }
            progressMap[item.movie.id] = Math.max(
              0,
              Math.min(100, item.progressPercentage),
            );
          }
          this.watchProgressByMovieId.set(progressMap);
        },
        error: () => {
          // Auth/network/server errors are handled centrally via the interceptor + toasts.
        },
      });
  }

  private mapCategorySlugToGenre(slug: string): Genre {
    const normalized = slug.trim().toLowerCase();
    const map: Record<string, Genre> = {
      nollywood: Genre.Nollywood,
      bollywood: Genre.Bollywood,
      hollywood: Genre.Hollywood,
    };

    return map[normalized] ?? Genre.Hollywood;
  }

  private scrollToFullList(): void {
    if (typeof document === "undefined") return;
    const target = document.getElementById("movies-full-list");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  streamMovies() {
    return (this.query.data()?.data || []).filter(
      (movie) => movie.canStream && !movie.youtubeId,
    );
  }
}
