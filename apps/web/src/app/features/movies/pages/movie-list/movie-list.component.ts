import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { MoviesQueryService } from '../../services/movies-query.service';
import { MovieCardComponent } from '../../components/movie-card/movie-card.component';
import { MovieCardYoutubeComponent } from '../../components/movie-card-youtube/movie-card-youtube.component';
import { FilterBarComponent } from '../../components/filter-bar/filter-bar.component';
import { PaginatorComponent } from '../../../../shared/components/paginator/paginator.component';
import { Genre, MovieSearchParams } from '@naijaspride/types';
import { WatchApiService } from '../../../watch/services/watch-api.service';
import { AuthStateService } from '../../../../core/auth/auth-state.service';

@Component({
  selector: 'app-movie-list',
  standalone: true,
  imports: [CommonModule, MovieCardComponent, MovieCardYoutubeComponent, FilterBarComponent, PaginatorComponent, RouterLink, RouterLinkActive],
  template: `
    <div class="space-y-4 min-h-screen text-[var(--text-primary)]">
      <!-- Section Switcher -->
      <div class="flex items-center gap-4 mb-6">
        <a 
          routerLink="/movies" 
          routerLinkActive="bg-cinema-500 text-white" 
          [routerLinkActiveOptions]="{exact: true}"
          class="px-4 py-2 rounded-lg bg-[#efe1d7] text-[#5f4d47] hover:bg-[#e3d0c4] dark:bg-cinema-800 dark:text-gray-300 dark:hover:bg-cinema-700 transition-colors font-medium"
        >
          <span class="flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"/>
            </svg>
            All Movies
          </span>
        </a>
        <a 
          routerLink="/movies/stream" 
          routerLinkActive="bg-cinema-500 text-white"
          class="px-4 py-2 rounded-lg bg-[#efe1d7] text-[#5f4d47] hover:bg-[#e3d0c4] dark:bg-cinema-800 dark:text-gray-300 dark:hover:bg-cinema-700 transition-colors font-medium"
        >
          <span class="flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Stream Only
          </span>
        </a>
      </div>

      <app-filter-bar 
        [activeFilters]="searchParams()"
        (filterChange)="onFilterChange($event)"
      />

      @if (query.isPending()) {
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
          @for (i of [1,2,3,4,5,6,7,8,9,10]; track i) {
            <div class="bg-[#efe1d7] dark:bg-cinema-800 rounded-sm aspect-[2/3] animate-pulse"></div>
          }
        </div>
      }

      @if (query.isError()) {
        <div class="flex flex-col items-center justify-center py-20 text-center">
          <div class="bg-cinema-500/20 text-cinema-500 p-4 rounded-full mb-4">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
          </div>
          <h3 class="text-lg font-serif font-bold text-[#2a1c1f] dark:text-white">Oops! Something went wrong.</h3>
          <p class="text-[#7d6862] dark:text-gray-500 mb-4">{{ query.error()?.message }}</p>
          <button (click)="query.refetch()" class="px-6 py-2 bg-cinema-500 text-white text-sm tracking-widest uppercase hover:bg-cinema-400 transition-colors">
            Try Again
          </button>
        </div>
      }

      @if (query.isSuccess()) {
        @if (regularMovies().length > 0) {
          <section class="space-y-4">
            <h3 class="text-lg font-semibold text-[#24181b] dark:text-white">Download Movies</h3>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
              @for (movie of regularMovies(); track movie.id) {
                <app-movie-card
                  [movie]="movie"
                  [progress]="watchProgressByMovieId()[movie.id] ?? null"
                />
              }
            </div>
          </section>
        }

        @if (streamMovies().length > 0) {
          <section class="space-y-4 mt-8">
            <h3 class="text-lg font-semibold text-[#24181b] dark:text-white">Stream-Only Movies</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              @for (movie of streamMovies(); track movie.id) {
                <app-movie-card-youtube [movie]="movie" [progress]="watchProgressByMovieId()[movie.id] ?? null" />
              }
            </div>
          </section>
        }
        
        @if (query.data()?.data?.length === 0) {
          <div class="flex flex-col items-center justify-center py-24 text-[#8a756e] dark:text-gray-400">
            <span class="text-6xl mb-4">🎬</span>
            <p class="text-lg font-serif">No movies found matching your filters.</p>
            <button 
              (click)="onFilterChange({ q: undefined, genre: undefined, year: undefined, quality: undefined })"
              class="mt-4 text-cinema-500 font-medium hover:text-[#4f0f21] dark:hover:text-cinema-100 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        }
        
        <!-- Pagination -->
        @if (query.data()?.meta) {
          <app-paginator 
            [currentPage]="query.data()!.meta!.page"
            [totalPages]="query.data()!.meta!.totalPages"
            (pageChange)="onPageChange($event)"
          />
        }
      }
    </div>
  `
})
export class MovieListComponent {
  searchParams = signal<MovieSearchParams>({ 
    page: 1, 
    limit: 20,
    sortBy: 'latest'
  });

  private moviesService = inject(MoviesQueryService);
  private watchApi = inject(WatchApiService);
  private authState = inject(AuthStateService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  watchProgressByMovieId = signal<Record<string, number>>({});
  query = this.moviesService.getMoviesQuery(this.searchParams);

  constructor() {
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
      });

    effect(() => {
      const user = this.authState.currentUser();
      if (!user) {
        this.watchProgressByMovieId.set({});
        return;
      }
      this.loadWatchProgress();
    });
  }

  // Merge new filters into existing params
  onFilterChange(changes: Partial<MovieSearchParams>) {
    this.searchParams.update((current: MovieSearchParams) => ({
      ...current,
      ...changes,
      page: 1 // Always reset to page 1 when filtering
    }));
  }

  // Handle page changes
  onPageChange(page: number) {
    this.searchParams.update((current: MovieSearchParams) => ({
      ...current,
      page
    }));
    // Scroll to top of results
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  regularMovies() {
    return (this.query.data()?.data || []).filter((movie) => !movie.isStreamOnly);
  }

  streamMovies() {
    return (this.query.data()?.data || []).filter((movie) => movie.isStreamOnly);
  }
}
