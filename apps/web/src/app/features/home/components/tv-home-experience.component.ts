import { CommonModule } from "@angular/common";
import { Component, computed, input } from "@angular/core";
import { RouterLink } from "@angular/router";
import { MovieSummary } from "@naijaspride/types";
import { SymbolIconComponent } from "../../../shared/components/symbol-icon/symbol-icon.component";
import { TvFocusGroupDirective } from "../../../shared/directives/tv-focus-group.directive";

import { WatchHistoryItem } from "../../watch/services/watch-api.service";

type AnimeCard = {
  id: number;
  title?: {
    english?: string | null;
    romaji?: string | null;
    native?: string | null;
  };
  coverImage?: { extraLarge?: string | null; large?: string | null };
  bannerImage?: string | null;
  genres?: string[];
  averageScore?: number | null;
};

@Component({
  selector: "app-tv-home-experience",
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    SymbolIconComponent,
    TvFocusGroupDirective,
  ],
  template: `
    <div
      appTvFocusGroup
      [tvAutoFocus]="true"
      class="tv-stage flex h-screen w-full overflow-hidden bg-[#080608] text-[#f6efe8]"
    >
      <aside
        class="hidden w-24 flex-col border-r border-white/10 bg-black/30 px-3 py-6 backdrop-blur-xl lg:flex xl:w-64 xl:px-5"
      >
        <div
          class="mb-8 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3"
        >
          <img
            src="assets/images/logo.svg"
            alt="NaijasPride"
            class="h-10 w-10 rounded-xl object-contain"
          />
          <div class="hidden xl:block min-w-0">
            <p
              class="truncate text-sm font-semibold tracking-[0.24em] text-[#d0a97a] uppercase"
            >
              NaijasPride
            </p>
            <p class="text-xs text-white/45">Culture on the big screen</p>
          </div>
        </div>

        <nav class="flex flex-col gap-3">
          @for (item of navItems; track item.label) {
            <a
              [routerLink]="item.link"
              class="group flex items-center gap-3 rounded-2xl px-3 py-3 text-white/60 transition hover:bg-white/[0.06] hover:text-white"
              [ngClass]="item.active ? 'bg-[#800020]/25 text-white' : ''"
            >
              <span
                class="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]"
              >
                <app-symbol-icon
                  [name]="item.icon"
                  [size]="24"
                ></app-symbol-icon>
              </span>
              <span class="hidden xl:block text-base font-medium">{{
                item.label
              }}</span>
            </a>
          }
        </nav>

        <div
          class="mt-auto rounded-[2rem] border border-[#800020]/30 bg-[#800020]/10 p-4"
        >
          <p class="text-[11px] uppercase tracking-[0.24em] text-[#d0a97a]">
            Profile
          </p>
          <div class="mt-3 flex items-center gap-3">
            <div
              class="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d0a97a]/15 text-[#d0a97a]"
            >
              <app-symbol-icon name="person" [size]="26"></app-symbol-icon>
            </div>
            <div class="hidden xl:block min-w-0">
              <p class="truncate text-sm font-semibold text-white">
                {{ userName() }}
              </p>
              <p class="truncate text-xs text-white/50">
                {{ membershipLabel() }}
              </p>
            </div>
          </div>
        </div>
      </aside>

      <main class="flex-1 overflow-y-auto">
        <section
          class="relative min-h-[66vh] overflow-hidden border-b border-white/10"
        >
          <div
            class="absolute inset-0 bg-cover bg-center"
            [style.background-image]="heroBackground()"
          ></div>
          <div
            class="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(208,169,122,0.18),transparent_25%),linear-gradient(90deg,rgba(8,6,8,0.96)_0%,rgba(8,6,8,0.74)_42%,rgba(8,6,8,0.16)_100%)]"
          ></div>
          <div
            class="relative z-10 flex min-h-[66vh] flex-col justify-center px-8 py-10 md:px-12 xl:px-20"
          >
            <div
              class="mb-4 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.24em] text-white/60"
            >
              <span
                class="rounded-full border border-[#d0a97a]/40 bg-[#d0a97a]/10 px-3 py-1 text-[#ecd8b7]"
                >Featured Tonight</span
              >
              @if (heroMetaPrimary(); as meta) {
                <span>{{ meta }}</span>
              }
            </div>

            <h1
              class="max-w-4xl text-4xl font-black leading-[0.95] text-white md:text-6xl xl:text-7xl"
            >
              {{ heroTitle() }}
            </h1>
            <p
              class="mt-5 max-w-2xl text-sm leading-7 text-white/70 md:text-base"
            >
              {{ heroDescription() }}
            </p>

            <div class="mt-8 flex flex-wrap items-center gap-4">
              <a
                [routerLink]="heroPrimaryLink()"
                class="inline-flex items-center gap-3 rounded-2xl bg-[#800020] px-7 py-4 text-base font-semibold text-white shadow-[0_18px_48px_rgba(128,0,32,0.35)] transition hover:bg-[#95002a]"
              >
                <app-symbol-icon
                  name="play_arrow"
                  [size]="30"
                  [fill]="true"
                ></app-symbol-icon>
                Play Now
              </a>
              <a
                [routerLink]="heroSecondaryLink()"
                class="inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.06] px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-md transition hover:bg-white/[0.1]"
              >
                <app-symbol-icon name="info" [size]="24"></app-symbol-icon>
                More Info
              </a>
            </div>
          </div>
        </section>

        <div class="space-y-10 px-8 py-8 md:px-12 xl:px-20 xl:py-10">
          <section>
            <div class="mb-5 flex items-center justify-between">
              <h2 class="text-2xl font-bold text-white">Continue Watching</h2>
              <a
                routerLink="/library"
                class="text-sm font-medium text-[#d0a97a] hover:text-[#ead9bf]"
                >Open Library</a
              >
            </div>
            <div class="flex gap-5 overflow-x-auto pb-2">
              @for (item of continueWatching(); track item.id) {
                <a
                  [routerLink]="['/movies', item.movie.slug || item.movie.id]"
                  class="group block w-72 flex-shrink-0"
                >
                  <div
                    class="relative aspect-video overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/[0.04]"
                  >
                    <img
                      [src]="
                        item.movie.thumbnailUrl || item.movie.posterUrl || ''
                      "
                      [alt]="item.movie.title"
                      class="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      referrerpolicy="no-referrer"
                    />
                    <div
                      class="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent"
                    ></div>
                    <div class="absolute inset-x-0 bottom-0 h-1.5 bg-white/10">
                      <div
                        class="h-full bg-[#d0a97a]"
                        [style.width.%]="item.progressPercentage"
                      ></div>
                    </div>
                    <div
                      class="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3"
                    >
                      <div class="min-w-0">
                        <p class="truncate text-lg font-semibold text-white">
                          {{ item.movie.title }}
                        </p>
                        <p
                          class="text-xs uppercase tracking-[0.2em] text-white/55"
                        >
                          {{ item.progressPercentage | number: "1.0-0" }}%
                          watched
                        </p>
                      </div>
                      <span
                        class="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#800020]/85 text-white shadow-lg"
                      >
                        <app-symbol-icon
                          name="play_arrow"
                          [size]="28"
                          [fill]="true"
                        ></app-symbol-icon>
                      </span>
                    </div>
                  </div>
                </a>
              }
            </div>
          </section>

          <section>
            <div class="mb-5 flex items-center justify-between">
              <h2 class="text-2xl font-bold text-white">Trending Movies</h2>
              <a
                routerLink="/movies"
                class="text-sm font-medium text-[#d0a97a] hover:text-[#ead9bf]"
                >Browse Movies</a
              >
            </div>
            <div class="flex gap-5 overflow-x-auto pb-2">
              @for (movie of downloadMovies(); track movie.id) {
                <a
                  [routerLink]="['/movies', movie.slug || movie.id]"
                  class="group block w-52 flex-shrink-0"
                >
                  <div
                    class="relative aspect-[2/3] overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/[0.04]"
                  >
                    <img
                      [src]="
                        movie.posterUrl ||
                        movie.thumbnailUrl ||
                        movie.coverUrl ||
                        ''
                      "
                      [alt]="movie.title"
                      class="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      referrerpolicy="no-referrer"
                    />
                    <div
                      class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-transparent"
                    ></div>
                    <div class="absolute bottom-4 left-4 right-4">
                      <p class="truncate text-base font-semibold text-white">
                        {{ movie.title }}
                      </p>
                      <p
                        class="text-xs uppercase tracking-[0.2em] text-white/55"
                      >
                        {{ movie.year || "Featured" }}
                      </p>
                    </div>
                  </div>
                </a>
              }
            </div>
          </section>

          <div class="grid gap-10 xl:grid-cols-[1.15fr,0.85fr]">
            <section>
              <div class="mb-5 flex items-center justify-between">
                <h2 class="text-2xl font-bold text-white">Trending Anime</h2>
                <a
                  routerLink="/anime"
                  class="text-sm font-medium text-[#d0a97a] hover:text-[#ead9bf]"
                  >Open Anime</a
                >
              </div>
              <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
                @for (entry of trendingAnime().slice(0, 4); track entry.id) {
                  <a
                    [routerLink]="['/anime', entry.id]"
                    class="group block overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]"
                  >
                    <div class="aspect-[3/4] overflow-hidden bg-black/30">
                      <img
                        [src]="
                          entry.coverImage?.extraLarge ||
                          entry.coverImage?.large ||
                          ''
                        "
                        [alt]="animeTitle(entry)"
                        class="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        referrerpolicy="no-referrer"
                      />
                    </div>
                    <div class="space-y-1 p-4">
                      <p class="truncate text-sm font-semibold text-white">
                        {{ animeTitle(entry) }}
                      </p>
                      <p
                        class="truncate text-[11px] uppercase tracking-[0.18em] text-white/50"
                      >
                        {{
                          (entry.genres || []).slice(0, 2).join(" / ") ||
                            "Anime"
                        }}
                      </p>
                    </div>
                  </a>
                }
              </div>
            </section>

            <section>
              <div class="mb-5 flex items-center justify-between">
                <h2 class="text-2xl font-bold text-white">Music Videos</h2>
                <a
                  routerLink="/music"
                  class="text-sm font-medium text-[#d0a97a] hover:text-[#ead9bf]"
                  >Open Music</a
                >
              </div>
              <div class="space-y-3">
                @for (item of streamMovies().slice(0, 4); track item.id) {
                  <a
                    [routerLink]="['/movies', item.slug || item.id]"
                    class="group flex items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-3 transition hover:bg-white/[0.06]"
                  >
                    <div
                      class="relative aspect-video w-40 overflow-hidden rounded-2xl bg-black/30"
                    >
                      <img
                        [src]="item.thumbnailUrl || item.posterUrl || ''"
                        [alt]="item.title"
                        class="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        referrerpolicy="no-referrer"
                      />
                      <div
                        class="absolute inset-0 flex items-center justify-center bg-black/20"
                      >
                        <span
                          class="flex h-12 w-12 items-center justify-center rounded-2xl bg-black/50 text-white backdrop-blur-sm"
                        >
                          <app-symbol-icon
                            name="play_arrow"
                            [size]="28"
                            [fill]="true"
                          ></app-symbol-icon>
                        </span>
                      </div>
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-base font-semibold text-white">
                        {{ item.title }}
                      </p>
                      <p
                        class="truncate text-xs uppercase tracking-[0.18em] text-white/50"
                      >
                        {{ item.year || "Stream now" }}
                      </p>
                    </div>
                  </a>
                }
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  `,
})
export class TvHomeExperienceComponent {
  userName = input("Guest");
  membershipLabel = input("Member");
  continueWatching = input<WatchHistoryItem[]>([]);
  downloadMovies = input<MovieSummary[]>([]);
  trendingAnime = input<AnimeCard[]>([]);
  streamMovies = input<MovieSummary[]>([]);

  navItems = [
    { label: "Home", link: "/home", icon: "home", active: true },
    { label: "Movies", link: "/movies", icon: "movie", active: false },
    { label: "TV Shows", link: "/tv-shows", icon: "tv", active: false },
    {
      label: "Anime",
      link: "/anime",
      icon: "auto_awesome_motion",
      active: false,
    },
    { label: "My List", link: "/library", icon: "bookmarks", active: false },
    { label: "Search", link: "/search", icon: "search", active: false },
  ];

  featuredMovie = computed(
    () => this.downloadMovies()[0] || this.continueWatching()[0]?.movie || null,
  );

  heroTitle = computed(
    () => this.featuredMovie()?.title || "Your culture capital, now TV-first.",
  );
  heroDescription = computed(() => {
    const movie = this.featuredMovie() as
      | (MovieSummary & { description?: string | null })
      | null;
    return (
      movie?.description ||
      "A premium big-screen experience built around NaijasPride originals, cinema favorites, anime discoveries, and music moments curated for the living room."
    );
  });
  heroBackground = computed(() => {
    const movie = this.featuredMovie() as
      | (MovieSummary & { backdropUrl?: string | null })
      | null;
    const image =
      movie?.backdropUrl || movie?.posterUrl || movie?.thumbnailUrl || "";
    return image
      ? `url(${image})`
      : "linear-gradient(135deg, #2b0a16 0%, #10090d 55%, #040304 100%)";
  });
  heroMetaPrimary = computed(() => {
    const movie = this.featuredMovie();
    return (
      [movie?.year].filter(Boolean).join(" • ") || "Premium big-screen mode"
    );
  });
  heroPrimaryLink = computed(() => {
    const movie = this.featuredMovie();
    return movie ? ["/movies", movie.slug || movie.id] : ["/movies"];
  });
  heroSecondaryLink = computed(() => {
    const movie = this.featuredMovie();
    return movie ? ["/movies", movie.slug || movie.id] : ["/library"];
  });

  animeTitle(entry: AnimeCard): string {
    return (
      entry.title?.english ||
      entry.title?.romaji ||
      entry.title?.native ||
      "Anime"
    );
  }
}
