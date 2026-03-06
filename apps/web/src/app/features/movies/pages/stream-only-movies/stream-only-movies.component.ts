import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MovieCardYoutubeComponent } from '../../../movies/components/movie-card-youtube/movie-card-youtube.component';
import { MovieSummary } from '@naijaspride/types';
import { PaginatorComponent } from '../../../../shared/components/paginator/paginator.component';
import { WatchApiService } from '../../../watch/services/watch-api.service';

/**
 * Stream-only movies page (YouTube Nollywood movies)
 * Dedicated section for YouTube-imported movies
 */
@Component({
  selector: 'app-stream-only-movies',
  standalone: true,
  imports: [CommonModule, RouterLink, MovieCardYoutubeComponent, PaginatorComponent],
  template: `
    <div class="min-h-screen bg-[var(--bg-primary)] pb-20">
      <!-- Header -->
      <div class="bg-gradient-to-b from-[#f1e3d8] to-[#f8f0e9] dark:from-cinema-800 dark:to-cinema-900 py-12 px-6">
        <div class="max-w-7xl mx-auto">
          <div class="flex items-center gap-4 mb-4">
            <a 
              routerLink="/movies" 
              class="text-[#8a756e] hover:text-[#24181b] dark:text-gray-400 dark:hover:text-white text-sm flex items-center gap-2 transition-colors"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
              </svg>
              Back to All Movies
            </a>
          </div>
          
          <h1 class="text-3xl md:text-4xl font-serif text-[#24181b] dark:text-white mb-3">
            Nollywood YouTube Movies
          </h1>
          <p class="text-[#75635c] dark:text-gray-400 max-w-2xl">
            Watch the latest Nigerian movies streamed directly from YouTube. 
            All movies are free to watch with no downloads required.
          </p>
        </div>
      </div>

      <!-- Content -->
      <div class="max-w-7xl mx-auto px-6 py-8">
        <!-- Loading State -->
        @if (isLoading()) {
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            @for (i of [1,2,3,4,5,6,7,8]; track i) {
              <div class="animate-pulse">
                <div class="aspect-video bg-[#e5d2c6] dark:bg-cinema-800 rounded-lg"></div>
                <div class="mt-2 h-4 bg-[#e5d2c6] dark:bg-cinema-800 rounded w-3/4"></div>
                <div class="mt-1 h-3 bg-[#e5d2c6] dark:bg-cinema-800 rounded w-1/2"></div>
              </div>
            }
          </div>
        }

        <!-- Movies Grid -->
        @if (!isLoading() && movies().length > 0) {
          <div class="mb-8">
            <div class="flex items-center justify-between mb-6">
                <h2 class="text-xl font-semibold text-[#24181b] dark:text-white">
                  Latest Additions
                <span class="text-[#8a756e] dark:text-gray-500 text-sm ml-2">({{ totalMovies() }} movies)</span>
                </h2>
              
              <!-- Sort Options -->
              <select 
                (change)="changeSort($event)"
                class="bg-white dark:bg-cinema-800 text-[#24181b] dark:text-white text-sm rounded px-3 py-2 border border-[#d8c2b8] dark:border-cinema-700 focus:border-[#800020] focus:outline-none"
              >
                <option value="latest">Latest Added</option>
                <option value="popular">Most Viewed</option>
                <option value="newest">Release Year</option>
              </select>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              @for (movie of movies(); track movie.id) {
                <app-movie-card-youtube [movie]="movie" [progress]="watchProgressByMovieId()[movie.id] ?? null" />
              }
            </div>

            @if (totalPages() > 1) {
              <div class="mt-8">
                <app-paginator
                  [currentPage]="currentPage()"
                  [totalPages]="totalPages()"
                  (pageChange)="onPageChange($event)"
                />
              </div>
            }
          </div>
        }

        <!-- Empty State -->
        @if (!isLoading() && movies().length === 0) {
          <div class="text-center py-20">
            <div class="text-6xl mb-4">🎬</div>
            <h3 class="text-xl text-[#24181b] dark:text-white mb-2">No YouTube movies yet</h3>
            <p class="text-[#75635c] dark:text-gray-400 mb-6">
              New stream-ready titles are being prepared. Explore the full library while this shelf updates.
            </p>
            <a
              routerLink="/movies"
              class="inline-block bg-[#800020] hover:bg-[#660019] text-white px-6 py-3 rounded font-semibold transition-colors"
            >
              Browse All Movies
            </a>
          </div>
        }
      </div>
    </div>
  `
})
export class StreamOnlyMoviesComponent implements OnInit {
  private http = inject(HttpClient);
  private watchApi = inject(WatchApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  
  movies = signal<MovieSummary[]>([]);
  isLoading = signal(true);
  sortBy = signal('latest');
  currentPage = signal(1);
  totalPages = signal(1);
  totalMovies = signal(0);
  watchProgressByMovieId = signal<Record<string, number>>({});
  readonly pageSize = 50;

  ngOnInit() {
    this.loadWatchProgress();

    // URL -> state sync (fixes pagination back-button issues)
    this.route.queryParamMap.subscribe((params) => {
      const page = Math.max(1, Number(params.get('page') || 1) || 1);
      const sortBy = (params.get('sortBy') || 'latest').trim();

      this.currentPage.set(page);
      this.sortBy.set(sortBy);
      this.loadMovies();
    });
  }

  loadMovies() {
    this.isLoading.set(true);
    
    // Fetch stream-only movies
    this.http.get<{ 
      success: boolean;
      data: MovieSummary[];
      meta?: { page: number; total: number; totalPages: number };
    }>('/api/v1/movies', {
      params: {
        isStreamOnly: 'true',
        sortBy: this.sortBy(),
        page: String(this.currentPage()),
        limit: String(this.pageSize),
      }
    }).subscribe({
      next: (response) => {
        this.movies.set(response.data || []);
        this.totalMovies.set(response.meta?.total || response.data?.length || 0);
        this.totalPages.set(response.meta?.totalPages || 1);
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading stream-only movies:', error);
        this.isLoading.set(false);
      }
    });
  }

  changeSort(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.sortBy.set(select.value);
    this.currentPage.set(1);
    this.syncUrl();
    this.loadMovies();
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
    this.syncUrl();
    this.loadMovies();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private syncUrl() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        page: this.currentPage(),
        sortBy: this.sortBy(),
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
          progressMap[item.movie.id] = Math.max(0, Math.min(100, item.progressPercentage));
        }
        this.watchProgressByMovieId.set(progressMap);
      },
      error: () => {
        this.watchProgressByMovieId.set({});
      },
    });
  }
}
