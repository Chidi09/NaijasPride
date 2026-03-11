import { Component, DestroyRef, effect, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MoviesQueryService } from '../../services/movies-query.service';
import { MovieCardComponent } from '../../components/movie-card/movie-card.component';
import { FilterBarComponent } from '../../components/filter-bar/filter-bar.component';
import { PaginatorComponent } from '../../../../shared/components/paginator/paginator.component';
import { Genre, MovieSearchParams, Quality, MovieSummary } from '@naijaspride/types';
import { WatchApiService } from '../../../watch/services/watch-api.service';
import { AuthStateService } from '../../../../core/auth/auth-state.service';
import { HttpClient } from '@angular/common/http';

type MovieSectionKey = 'trending' | 'latest-2026' | 'latest-2025' | 'highest-rated' | 'award-winning';

const MOVIE_SECTION_LABELS: Record<MovieSectionKey, string> = {
  trending: 'Trending',
  'latest-2026': 'Latest Releases (2026)',
  'latest-2025': 'Latest Releases (2025)',
  'highest-rated': 'Highest Rated',
  'award-winning': 'Award Winning',
};

@Component({
  selector: 'app-movie-list',
  standalone: true,
  imports: [CommonModule, MovieCardComponent, FilterBarComponent, PaginatorComponent, RouterLink, RouterLinkActive],
  styles: [`
    :host { display: block; }

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
      0%, 100% {
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
      0%   { background-position: -800px 0; }
      100% { background-position:  800px 0; }
    }
    .skeleton {
      background: linear-gradient(90deg, #120a0d 25%, #1e1014 50%, #120a0d 75%);
      background-size: 1600px 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 10px;
    }
    :host-context(.light) .skeleton,
    :host-context(:not(.dark)) .skeleton {
      background: linear-gradient(90deg, #e8d8d0 25%, #f2e6df 50%, #e8d8d0 75%);
      background-size: 1600px 100%;
    }
  `],
  template: `
    <section class="relative min-h-screen overflow-hidden bg-[#0a0a0a]">
      <!-- Animated Background -->
      <div class="pointer-events-none fixed inset-0 z-0">
        <div class="absolute inset-0 bg-gradient-to-br from-[#800020]/5 via-transparent to-[#1a0a0a]/50"></div>
        <div class="absolute -left-1/4 -top-1/4 h-[600px] w-[600px] rounded-full bg-[#800020]/10 blur-[120px] animate-pulse-slow"></div>
        <div class="absolute -bottom-1/4 -right-1/4 h-[800px] w-[800px] rounded-full bg-[#4a0015]/20 blur-[150px] animate-pulse-slow-delayed"></div>
        <!-- Grid Pattern -->
        <div class="absolute inset-0 opacity-[0.02]" style="background-image: linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px); background-size: 60px 60px;"></div>
      </div>

      <!-- Hero Section -->
      <div class="relative z-10 border-b border-white/5">
        <div class="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-16">
          <div class="animate-fade-in-up">
            <div class="mb-4 inline-flex items-center gap-2 rounded-full border border-[#800020]/30 bg-[#800020]/10 px-4 py-1.5">
              <span class="h-2 w-2 animate-pulse rounded-full bg-[#800020]"></span>
              <span class="text-xs font-medium tracking-wider text-[#800020] uppercase">Cinema Collection</span>
            </div>
            <h1 class="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-4xl font-bold text-transparent md:text-5xl lg:text-6xl">
              Movies
            </h1>
            <p class="mt-4 max-w-2xl text-lg text-white/50">
              Discover the latest blockbusters, trending films, and cinematic masterpieces from around the world.
            </p>
          </div>
        </div>
      </div>

      <!-- Filters Section -->
      <div class="animate-fade-in-up animation-delay-200 relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-sm">
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
                <p class="mt-1 text-sm text-white/40">Handpicked collections updated daily</p>
              </div>
              <div class="hidden md:flex items-center gap-2">
                @for (key of sectionKeys; track key) {
                  <button
                    class="group relative overflow-hidden rounded-full border px-4 py-2 text-xs font-medium transition-all duration-300"
                    [class]="activeSection() === key 
                      ? 'border-[#800020] bg-[#800020] text-white shadow-lg shadow-[#800020]/25' 
                      : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30 hover:bg-white/10 hover:text-white'"
                    (click)="applySection(key)"
                  >
                    <span class="relative z-10">{{ sectionLabel(key) }}</span>
                    @if (activeSection() === key) {
                      <div class="absolute inset-0 bg-gradient-to-r from-[#800020] to-[#a00030]"></div>
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
                  [class]="activeSection() === key 
                    ? 'border-[#800020] bg-[#800020] text-white' 
                    : 'border-white/10 bg-white/5 text-white/60'"
                  (click)="applySection(key)"
                >
                  {{ sectionLabel(key) }}
                </button>
              }
            </div>

            <!-- Section Cards Grid -->
            <div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              @for (key of sectionKeys; track key) {
                <div class="animate-fade-in-up group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-1 transition-all duration-500 hover:border-[#800020]/30 hover:shadow-2xl hover:shadow-[#800020]/10">
                  <div class="relative overflow-hidden rounded-xl bg-black/40 p-4">
                    <!-- Section Header -->
                    <div class="mb-4 flex items-center justify-between">
                      <div class="flex items-center gap-3">
                        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#800020] to-[#600018] text-lg shadow-lg shadow-[#800020]/30">
                          @switch (key) {
                            @case ('trending') { 🔥 }
                            @case ('latest-2026') { 🆕 }
                            @case ('latest-2025') { 🎬 }
                            @case ('highest-rated') { ⭐ }
                            @case ('award-winning') { 🏆 }
                          }
                        </div>
                        <div>
                          <h3 class="text-base font-semibold text-white">{{ sectionLabel(key) }}</h3>
                          <p class="text-xs text-white/40">{{ sectionQuery(key).data()?.data?.length || 0 }} movies</p>
                        </div>
                      </div>
                      <button 
                        class="group/btn flex items-center gap-1 rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60 transition-all duration-300 hover:bg-[#800020] hover:text-white"
                        (click)="applySection(key)"
                      >
                        View all
                        <svg class="h-3 w-3 transition-transform duration-300 group-hover/btn:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                        </svg>
                      </button>
                    </div>

                    <!-- Mini Cards Grid -->
                    @if (sectionQuery(key).isLoading()) {
                      <div class="grid grid-cols-3 gap-2">
                        @for (i of [1,2,3,4,5,6]; track i) {
                          <div class="animate-pulse aspect-[2/3] rounded-lg bg-white/5"></div>
                        }
                      </div>
                    } @else {
                      <div class="grid grid-cols-3 gap-2">
                        @for (movie of (sectionQuery(key).data()?.data || []).slice(0, 6); track movie.id) {
                          <a 
                            [routerLink]="['/movies', movie.slug]"
                            class="group/card relative aspect-[2/3] overflow-hidden rounded-lg transition-all duration-300 hover:z-10 hover:scale-105 hover:shadow-xl"
                          >
                            <img 
                              [src]="movie.posterUrl || movie.thumbnailUrl || '/assets/images/poster-placeholder.svg'"
                              [alt]="movie.title"
                              class="h-full w-full object-cover transition duration-500 group-hover/card:scale-110"
                              loading="lazy"
                            />
                            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition duration-300 group-hover/card:opacity-100"></div>
                            <div class="absolute bottom-0 left-0 right-0 p-2 opacity-0 transition duration-300 group-hover/card:opacity-100">
                              <p class="line-clamp-2 text-[10px] font-medium text-white">{{ movie.title }}</p>
                            </div>
                          </a>
                        }
                      </div>
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
              <h2 class="flex items-center gap-3 text-2xl font-bold text-white">
                {{ fullListTitle() }}
                @if (query.isFetching()) {
                  <span class="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-[#800020] border-t-transparent"></span>
                }
              </h2>
              <p class="mt-1 text-sm text-white/40">
                {{ query.data()?.meta?.total || 0 }} movies found
              </p>
            </div>
          </div>

          @if (query.isPending()) {
            <!-- Skeleton Loading -->
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              @for (i of [1,2,3,4,5,6,7,8,9,10]; track i) {
                <div class="animate-pulse">
                  <div class="aspect-[2/3] rounded-xl bg-white/5"></div>
                  <div class="mt-3 h-4 w-3/4 rounded bg-white/5"></div>
                  <div class="mt-2 h-3 w-1/2 rounded bg-white/5"></div>
                </div>
              }
            </div>
          } @else if (query.isError()) {
            <!-- Error State -->
            <div class="flex flex-col items-center justify-center py-20 text-center">
              <div class="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10">
                <svg class="h-10 w-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
              </div>
              <h3 class="text-lg font-semibold text-white">Failed to load movies</h3>
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
            <div class="flex flex-col items-center justify-center py-20 text-center">
              <div class="mb-4 text-6xl">🎬</div>
              <h3 class="text-xl font-semibold text-white">No movies found</h3>
              <p class="mt-2 max-w-md text-sm text-white/40">Try adjusting your filters or search for something else.</p>
              <button 
                class="mt-6 rounded-full border border-white/10 bg-white/5 px-6 py-2 text-sm font-medium text-white transition-all hover:border-[#800020]/50 hover:bg-[#800020]/10"
                (click)="resetFilters()"
              >
                Clear Filters
              </button>
            </div>
          } @else {
            <!-- Results Grid -->
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              @for (movie of streamMovies(); track movie.id) {
                <app-movie-card [movie]="movie" [progress]="watchProgressByMovieId()[movie.id] ?? null" />
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
                  <svg class="h-5 w-5 transition-transform duration-300 group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                  </svg>
                </button>

                @for (value of pageButtons(); track value) {
                  <button
                    class="relative h-10 w-10 rounded-full text-sm font-medium transition-all duration-300"
                    [class]="value === searchParams().page 
                      ? 'bg-[#800020] text-white shadow-lg shadow-[#800020]/30' 
                      : 'border border-white/10 bg-white/5 text-white/60 hover:border-white/30 hover:bg-white/10 hover:text-white'"
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
                  <svg class="h-5 w-5 transition-transform duration-300 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
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
  `
})
export class MovieListComponent {
  sectionKeys: MovieSectionKey[] = ['trending', 'latest-2026', 'latest-2025', 'highest-rated', 'award-winning'];
  
  searchParams = signal<MovieSearchParams>({ 
    page: 1, 
    limit: 30,
    sortBy: 'trending',
    youtubeOnly: false,
  });

  activeSection = signal<MovieSectionKey>('trending');

  private moviesService = inject(MoviesQueryService);
  private watchApi = inject(WatchApiService);
  private authState = inject(AuthStateService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private http = inject(HttpClient);

  private syncingFromUrl = false;

  watchProgressByMovieId = signal<Record<string, number>>({});
  query = this.moviesService.getMoviesQuery(this.searchParams);

  // Curated section queries
  trendingQuery = this.moviesService.getMoviesQuery(computed(() => ({ page: 1, limit: 9, sortBy: 'trending' as const })));
  latest2026Query = this.moviesService.getMoviesQuery(computed(() => ({ page: 1, limit: 9, sortBy: 'latest' as const, year: 2026 })));
  latest2025Query = this.moviesService.getMoviesQuery(computed(() => ({ page: 1, limit: 9, sortBy: 'latest' as const, year: 2025 })));
  highestRatedQuery = this.moviesService.getMoviesQuery(computed(() => ({ page: 1, limit: 9, sortBy: 'popular' as const })));
  awardWinningQuery = this.moviesService.getMoviesQuery(computed(() => ({ page: 1, limit: 9, sortBy: 'popular' as const, genre: [Genre.Drama] })));

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

  hasActiveFilters = computed(() => {
    const params = this.searchParams();
    return !!(params.q?.trim() || params.genre?.length || params.year || params.quality);
  });

  constructor() {
    // URL -> state sync (fixes pagination back-button issues)
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const page = Math.max(1, Number(params.get('page') || 1) || 1);
        const limit = Math.min(50, Math.max(1, Number(params.get('limit') || 30) || 30));
        const q = (params.get('q') || '').trim() || undefined;
        const year = params.get('year') ? Number(params.get('year')) : undefined;
        const sortBy = (params.get('sortBy') || 'trending') as MovieSearchParams['sortBy'];
        const genreParam = (params.get('genre') || '').trim();
        const qualityParam = (params.get('quality') || '').trim();

        const genre = genreParam && Object.values(Genre).includes(genreParam as Genre)
          ? ([genreParam as Genre] as Genre[])
          : undefined;

        const quality = qualityParam && Object.values(Quality).includes(qualityParam as Quality)
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
        if (sortBy === 'trending') {
          this.activeSection.set('trending');
        } else if (sortBy === 'latest' && year === 2026) {
          this.activeSection.set('latest-2026');
        } else if (sortBy === 'latest' && year === 2025) {
          this.activeSection.set('latest-2025');
        } else if (sortBy === 'popular' && !genre) {
          this.activeSection.set('highest-rated');
        } else if (sortBy === 'popular' && genre?.includes(Genre.Drama)) {
          this.activeSection.set('award-winning');
        }
        
        this.syncingFromUrl = false;
      });

    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const slug = params.get('slug');
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

    effect(() => {
      const user = this.authState.currentUser();
      if (!user) {
        this.watchProgressByMovieId.set({});
        return;
      }
      this.loadWatchProgress();
    }, { allowSignalWrites: true });
  }

  sectionLabel(key: MovieSectionKey): string {
    return MOVIE_SECTION_LABELS[key];
  }

  sectionQuery(key: MovieSectionKey) {
    if (key === 'latest-2026') return this.latest2026Query;
    if (key === 'latest-2025') return this.latest2025Query;
    if (key === 'highest-rated') return this.highestRatedQuery;
    if (key === 'award-winning') return this.awardWinningQuery;
    return this.trendingQuery;
  }

  applySection(section: MovieSectionKey): void {
    this.activeSection.set(section);
    
    if (section === 'latest-2026') {
      this.searchParams.update(current => ({
        ...current,
        sortBy: 'latest',
        year: 2026,
        genre: undefined,
        page: 1
      }));
    } else if (section === 'latest-2025') {
      this.searchParams.update(current => ({
        ...current,
        sortBy: 'latest',
        year: 2025,
        genre: undefined,
        page: 1
      }));
    } else if (section === 'highest-rated') {
      this.searchParams.update(current => ({
        ...current,
        sortBy: 'popular',
        year: undefined,
        genre: undefined,
        page: 1
      }));
    } else if (section === 'award-winning') {
      this.searchParams.update(current => ({
        ...current,
        sortBy: 'popular',
        genre: [Genre.Drama],
        year: undefined,
        page: 1
      }));
    } else {
      this.searchParams.update(current => ({
        ...current,
        sortBy: 'trending',
        genre: undefined,
        year: undefined,
        page: 1
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
        page: 1 // Always reset to page 1 when filtering
      };
      this.syncUrl(next);
      return next;
    });
  }

  resetFilters(): void {
    this.searchParams.set({
      page: 1,
      limit: 30,
      sortBy: 'trending',
      youtubeOnly: false,
    });
    this.activeSection.set('trending');
    this.syncUrl(this.searchParams());
  }

  goPrev(): void {
    if (!this.meta()?.hasPrev) return;
    this.searchParams.update(current => ({
      ...current,
      page: Math.max(1, (current.page || 1) - 1)
    }));
    this.syncUrl(this.searchParams());
    this.scrollToFullList();
  }

  goNext(): void {
    if (!this.meta()?.hasNext) return;
    this.searchParams.update(current => ({
      ...current,
      page: (current.page || 1) + 1
    }));
    this.syncUrl(this.searchParams());
    this.scrollToFullList();
  }

  goToPage(value: number): void {
    if (value === this.searchParams().page) return;
    this.searchParams.update(current => ({
      ...current,
      page: value
    }));
    this.syncUrl(this.searchParams());
    this.scrollToFullList();
  }

  private syncUrl(params: MovieSearchParams) {
    if (this.syncingFromUrl) {
      return;
    }

    const queryParams: Record<string, any> = {
      page: params.page || 1,
      limit: params.limit || 30,
      sortBy: params.sortBy || 'trending',
      q: params.q || undefined,
      year: params.year || undefined,
      genre: params.genre?.[0] || undefined,
      quality: params.quality || undefined,
      youtubeOnly: false,
    };

    // Remove empty keys to keep URL clean.
    for (const key of Object.keys(queryParams)) {
      if (queryParams[key] === undefined || queryParams[key] === null || queryParams[key] === '') {
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
              Math.min(100, item.progressPercentage)
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
    if (typeof document === 'undefined') return;
    const target = document.getElementById('movies-full-list');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  streamMovies() {
    return (this.query.data()?.data || []).filter((movie) => movie.canStream && !movie.youtubeId);
  }
}
