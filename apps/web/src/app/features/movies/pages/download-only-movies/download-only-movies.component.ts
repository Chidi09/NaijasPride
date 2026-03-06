import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MovieSummary } from '@naijaspride/types';
import { MovieCardComponent } from '../../components/movie-card/movie-card.component';
import { PaginatorComponent } from '../../../../shared/components/paginator/paginator.component';
import { WatchApiService } from '../../../watch/services/watch-api.service';

@Component({
  selector: 'app-download-only-movies',
  standalone: true,
  imports: [CommonModule, RouterLink, MovieCardComponent, PaginatorComponent],
  template: `
    <div class="min-h-screen bg-[var(--bg-primary)] pb-24 text-[var(--text-primary)]">
      <div class="bg-gradient-to-b from-[#f3e5dc] to-[#f8f0e9] px-6 py-12 dark:from-cinema-800 dark:to-cinema-900">
        <div class="mx-auto max-w-7xl">
          <a
            routerLink="/movies"
            class="inline-flex items-center gap-2 text-sm text-[#8a756e] transition-colors hover:text-[#24181b] dark:text-gray-400 dark:hover:text-white"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            Back to Movies
          </a>

          <h1 class="mt-4 text-3xl font-semibold md:text-4xl">Download Library</h1>
          <p class="mt-2 max-w-2xl text-sm text-[#6f5e57] dark:text-gray-400">
            Download-ready titles from the ingestion pipeline.
          </p>
        </div>
      </div>

      <div class="mx-auto max-w-7xl px-6 py-8">
        @if (isLoading()) {
          <div class="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
            @for (i of [1,2,3,4,5,6,7,8,9,10,11,12]; track i) {
              <div class="aspect-[2/3] animate-pulse rounded-lg bg-[var(--bg-secondary)]"></div>
            }
          </div>
        }

        @if (!isLoading() && movies().length > 0) {
          <div class="mb-6 flex items-center justify-between">
            <p class="text-sm text-[var(--text-muted)]">{{ totalMovies() }} movies</p>

            <select
              (change)="changeSort($event)"
              class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm"
            >
              <option value="newest">Newest</option>
              <option value="popular">Most Downloaded</option>
              <option value="trending">Most Watched</option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
            @for (movie of movies(); track movie.id) {
              <app-movie-card [movie]="movie" [progress]="watchProgressByMovieId()[movie.id] ?? null" />
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
        }

        @if (!isLoading() && movies().length === 0) {
          <div class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8 text-center">
            <p class="text-lg font-medium">No download-ready titles found</p>
            <p class="mt-2 text-sm text-[var(--text-muted)]">Please check back shortly.</p>
          </div>
        }
      </div>
    </div>
  `,
})
export class DownloadOnlyMoviesComponent implements OnInit {
  private http = inject(HttpClient);
  private watchApi = inject(WatchApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  movies = signal<MovieSummary[]>([]);
  isLoading = signal(true);
  sortBy = signal<'newest' | 'popular' | 'trending'>('newest');
  currentPage = signal(1);
  totalPages = signal(1);
  totalMovies = signal(0);
  watchProgressByMovieId = signal<Record<string, number>>({});
  readonly pageSize = 24;

  ngOnInit(): void {
    this.loadWatchProgress();

    this.route.queryParamMap.subscribe((params) => {
      const page = Math.max(1, Number(params.get('page') || 1) || 1);
      const sortBy = (params.get('sortBy') || 'newest') as 'newest' | 'popular' | 'trending';

      this.currentPage.set(page);
      this.sortBy.set(sortBy);
      this.loadMovies();
    });
  }

  private loadMovies(): void {
    this.isLoading.set(true);

    this.http
      .get<{
        success: boolean;
        data: MovieSummary[];
        meta?: { page: number; total: number; totalPages: number };
      }>('/api/v1/movies', {
        params: {
          isStreamOnly: 'false',
          sortBy: this.sortBy(),
          page: String(this.currentPage()),
          limit: String(this.pageSize),
        },
      })
      .subscribe({
        next: (response) => {
          this.movies.set(response.data || []);
          this.totalMovies.set(response.meta?.total || response.data?.length || 0);
          this.totalPages.set(response.meta?.totalPages || 1);
          this.isLoading.set(false);
        },
        error: () => {
          this.movies.set([]);
          this.totalMovies.set(0);
          this.totalPages.set(1);
          this.isLoading.set(false);
        },
      });
  }

  changeSort(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.sortBy.set((select.value || 'newest') as 'newest' | 'popular' | 'trending');
    this.currentPage.set(1);
    this.syncUrl();
    this.loadMovies();
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
    this.syncUrl();
    this.loadMovies();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private syncUrl(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        page: this.currentPage(),
        sortBy: this.sortBy(),
      },
      replaceUrl: true,
    });
  }

  private loadWatchProgress(): void {
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
