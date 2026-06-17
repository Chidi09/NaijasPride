import { Component, inject, signal, OnInit, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { HttpClient, HttpParams } from "@angular/common/http";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MovieCardYoutubeComponent } from "../../../movies/components/movie-card-youtube/movie-card-youtube.component";
import { MovieSummary } from "@naijaspride/types";
import { PaginatorComponent } from "../../../../shared/components/paginator/paginator.component";
import { WatchApiService } from "../../../watch/services/watch-api.service";

type StreamGenre = "Nollywood" | "Bollywood" | "Hollywood";

/**
 * Stream-only movies page (YouTube Nollywood movies)
 * Dedicated section for YouTube-imported movies with cinematic design
 */
@Component({
  selector: "app-stream-only-movies",
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MovieCardYoutubeComponent,
    PaginatorComponent,
  ],
  styles: [
    `
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
    `,
  ],
  template: `
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

      <!-- Hero Section -->
      <div class="relative z-10 border-b border-white/5">
        <div class="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-16">
          <div class="animate-fade-in-up">
            <!-- Back Link -->
            <a
              routerLink="/movies"
              class="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60 transition-all duration-300 hover:border-[#800020]/50 hover:bg-[#800020]/10 hover:text-white"
            >
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to All Movies
            </a>

            <div
              class="mt-4 mb-4 inline-flex items-center gap-2 rounded-full border border-[#800020]/30 bg-[#800020]/10 px-4 py-1.5"
            >
              <span
                class="h-2 w-2 animate-pulse rounded-full bg-[#800020]"
              ></span>
              <span
                class="text-xs font-medium tracking-wider text-[#800020] uppercase"
                >YouTube Collection</span
              >
            </div>

            <h1
              class="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-4xl font-bold text-transparent md:text-5xl lg:text-6xl"
            >
              {{ genreLabel() }} YouTube Movies
            </h1>
            <p class="mt-4 max-w-2xl text-lg text-white/50">
              {{ genreDescription() }}
              All movies are free to watch with no downloads required.
            </p>

            <div class="mt-6 flex flex-wrap gap-2">
              @for (entry of genreOptions; track entry) {
                <button
                  type="button"
                  class="rounded-full border px-4 py-2 text-xs font-medium transition-all duration-300"
                  [class]="
                    genre() === entry
                      ? 'border-[#800020] bg-[#800020] text-white shadow-lg shadow-[#800020]/20'
                      : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30 hover:bg-white/10 hover:text-white'
                  "
                  (click)="changeGenre(entry)"
                >
                  {{ entry }}
                </button>
              }
            </div>
          </div>
        </div>
      </div>

      <!-- Filters Section -->
      <div
        class="animate-fade-in-up animation-delay-200 relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-sm"
      >
        <div class="mx-auto max-w-7xl px-4 py-4 md:px-6">
          <div
            class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <!-- Stats -->
            <div class="flex items-center gap-4">
              <div
                class="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2"
              >
                <svg
                  class="h-4 w-4 text-[#800020]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span class="text-sm text-white/70"
                  ><span class="font-semibold text-white">{{
                    totalMovies()
                  }}</span>
                  movies available</span
                >
              </div>
            </div>

            <!-- Sort Options -->
            <div class="flex items-center gap-3">
              <span class="text-sm text-white/40">Sort by:</span>
              <div class="relative">
                <select
                  [value]="sortBy()"
                  (change)="changeSort($event)"
                  class="appearance-none rounded-full border border-white/10 bg-white/5 px-4 py-2 pr-10 text-sm text-white transition-all duration-300 hover:border-[#800020]/50 hover:bg-white/10 focus:border-[#800020] focus:outline-none"
                >
                  <option value="latest" class="bg-[#0a0a0a]">
                    🆕 Latest Added
                  </option>
                  <option value="popular" class="bg-[#0a0a0a]">
                    Most Viewed
                  </option>
                  <option value="newest" class="bg-[#0a0a0a]">
                    Release Year
                  </option>
                </select>
                <svg
                  class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Content -->
      <div class="relative z-10 mx-auto max-w-7xl px-4 py-10 md:px-6">
        <!-- Loading State -->
        @if (isLoading()) {
          <div
            class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            @for (i of [1, 2, 3, 4, 5, 6, 7, 8]; track i) {
              <div
                class="animate-pulse rounded-xl overflow-hidden border border-white/5 bg-[#111]"
              >
                <div class="aspect-video bg-[#151515]"></div>
                <div class="px-3 py-2.5 space-y-1.5">
                  <div class="h-3 w-3/4 rounded bg-white/10"></div>
                  <div class="h-2.5 w-1/4 rounded bg-white/5"></div>
                </div>
              </div>
            }
          </div>
        }

        <!-- Movies Grid -->
        @if (!isLoading() && movies().length > 0) {
          <div class="mb-8">
            <div class="mb-6 flex items-center justify-between">
              <h2 class="text-xl font-semibold text-white">
                {{ sectionTitle() }}
                <span class="ml-2 text-sm text-white/40"
                  >({{ movies().length }} showing)</span
                >
              </h2>
            </div>

            <div
              class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              @for (movie of movies(); track movie.id) {
                <app-movie-card-youtube
                  [movie]="movie"
                  [progress]="watchProgressByMovieId()[movie.id] ?? null"
                />
              }
            </div>

            @if (totalPages() > 1) {
              <div class="mt-10 flex items-center justify-center gap-2">
                <button
                  class="group flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-all duration-300 hover:border-[#800020]/50 hover:bg-[#800020]/10 disabled:cursor-not-allowed disabled:opacity-30"
                  [disabled]="currentPage() <= 1"
                  (click)="onPageChange(currentPage() - 1)"
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

                @for (pageNum of pageButtons(); track pageNum) {
                  <button
                    class="relative h-10 w-10 rounded-full text-sm font-medium transition-all duration-300"
                    [class]="
                      pageNum === currentPage()
                        ? 'bg-[#800020] text-white shadow-lg shadow-[#800020]/30'
                        : 'border border-white/10 bg-white/5 text-white/60 hover:border-white/30 hover:bg-white/10 hover:text-white'
                    "
                    (click)="onPageChange(pageNum)"
                  >
                    {{ pageNum }}
                  </button>
                }

                <button
                  class="group flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-all duration-300 hover:border-[#800020]/50 hover:bg-[#800020]/10 disabled:cursor-not-allowed disabled:opacity-30"
                  [disabled]="currentPage() >= totalPages()"
                  (click)="onPageChange(currentPage() + 1)"
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
          </div>
        }

        <!-- Empty State -->
        @if (!isLoading() && movies().length === 0) {
          <div
            class="flex flex-col items-center justify-center py-20 text-center"
          >
            <div
              class="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-white/5"
            >
              <span
                class="material-symbols-outlined text-4xl"
                aria-hidden="true"
                >movie</span
              >
            </div>
            <h3 class="text-xl font-semibold text-white">
              No YouTube movies yet
            </h3>
            <p class="mt-2 max-w-md text-sm text-white/40">
              New stream-ready titles are being prepared. Explore the full
              library while this shelf updates.
            </p>
            <a
              routerLink="/movies"
              class="mt-6 inline-flex items-center gap-2 rounded-full bg-[#800020] px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:bg-[#a00030] hover:shadow-lg hover:shadow-[#800020]/25"
            >
              Browse All Movies
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
            </a>
          </div>
        }
      </div>

      <!-- Footer Spacing -->
      <div class="h-20"></div>
    </section>
  `,
})
export class StreamOnlyMoviesComponent implements OnInit {
  private http = inject(HttpClient);
  private watchApi = inject(WatchApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  movies = signal<MovieSummary[]>([]);
  isLoading = signal(true);
  sortBy = signal("latest");
  genre = signal<StreamGenre>("Nollywood");
  currentPage = signal(1);
  totalPages = signal(1);
  totalMovies = signal(0);
  watchProgressByMovieId = signal<Record<string, number>>({});
  readonly pageSize = 50;
  readonly genreOptions: StreamGenre[] = [
    "Nollywood",
    "Bollywood",
    "Hollywood",
  ];

  genreLabel = computed(() => this.genre());

  genreDescription = computed(() => {
    if (this.genre() === "Bollywood") {
      return "Watch trending Indian movies streamed directly from YouTube.";
    }
    if (this.genre() === "Hollywood") {
      return "Watch trending global movies streamed directly from YouTube.";
    }
    return "Watch the latest Nigerian movies streamed directly from YouTube.";
  });

  sectionTitle = computed(() => {
    switch (this.sortBy()) {
      case "popular":
        return "Most Viewed";
      case "newest":
        return "By Release Year";
      default:
        return "Latest Additions";
    }
  });

  pageButtons = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const start = Math.max(1, current - 2);
    const end = Math.min(total, start + 4);
    const values: number[] = [];
    for (let value = start; value <= end; value++) values.push(value);
    return values;
  });

  ngOnInit() {
    this.loadWatchProgress();

    // URL -> state sync (fixes pagination back-button issues)
    this.route.queryParamMap.subscribe((params) => {
      const page = Math.max(1, Number(params.get("page") || 1) || 1);
      const sortBy = (params.get("sortBy") || "latest").trim();
      const genreParam = (
        params.get("genre") || "Nollywood"
      ).trim() as StreamGenre;
      const genre = this.genreOptions.includes(genreParam)
        ? genreParam
        : "Nollywood";

      this.currentPage.set(page);
      this.sortBy.set(sortBy);
      this.genre.set(genre);
      this.loadMovies();
    });
  }

  loadMovies() {
    this.isLoading.set(true);

    // Fetch stream-only movies by selected region
    const params = new HttpParams()
      .set("isStreamOnly", "true")
      .set("youtubeOnly", "true")
      .set("sortBy", this.sortBy())
      .set("page", String(this.currentPage()))
      .set("limit", String(this.pageSize))
      .append("genre", this.genre());
    this.http
      .get<{
        success: boolean;
        data: MovieSummary[];
        meta?: { page: number; total: number; totalPages: number };
      }>("/api/v1/movies", { params })
      .subscribe({
        next: (response) => {
          this.movies.set(response.data || []);
          this.totalMovies.set(
            response.meta?.total || response.data?.length || 0,
          );
          this.totalPages.set(response.meta?.totalPages || 1);
          this.isLoading.set(false);
        },
        error: (error) => {
          this.isLoading.set(false);
        },
      });
  }

  changeSort(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.sortBy.set(select.value);
    this.currentPage.set(1);
    this.syncUrl();
    this.loadMovies();
  }

  changeGenre(nextGenre: StreamGenre) {
    if (nextGenre === this.genre()) return;
    this.genre.set(nextGenre);
    this.currentPage.set(1);
    this.syncUrl();
    this.loadMovies();
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
    this.syncUrl();
    this.loadMovies();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  private syncUrl() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        page: this.currentPage(),
        sortBy: this.sortBy(),
        genre: this.genre(),
      },
      replaceUrl: true,
    });
  }

  private loadWatchProgress() {
    this.watchApi.getWatchHistory({ page: 1, limit: 200 }).subscribe({
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
        this.watchProgressByMovieId.set({});
      },
    });
  }
}
