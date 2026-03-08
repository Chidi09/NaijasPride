import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MoviesQueryService } from '../../services/movies-query.service';
import { MovieCardComponent } from '../../components/movie-card/movie-card.component';
import { MovieCardYoutubeComponent } from '../../components/movie-card-youtube/movie-card-youtube.component';
import { FilterBarComponent } from '../../components/filter-bar/filter-bar.component';
import { PaginatorComponent } from '../../../../shared/components/paginator/paginator.component';
import { Genre, MovieSearchParams, Quality } from '@naijaspride/types';
import { WatchApiService } from '../../../watch/services/watch-api.service';
import { AuthStateService } from '../../../../core/auth/auth-state.service';

@Component({
  selector: 'app-movie-list',
  standalone: true,
  imports: [CommonModule, MovieCardComponent, MovieCardYoutubeComponent, FilterBarComponent, PaginatorComponent, RouterLink, RouterLinkActive],
  styles: [`
    :host { display: block; }

    .page-wrap {
      min-height: 100vh;
      max-width: 1600px;
      margin: 0 auto;
      padding: 28px 20px 48px;
    }

    /* Page header */
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
    }
    .page-title {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--text-primary, #f9f9f2);
      margin: 0;
    }

    /* Section header */
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 18px;
    }
    .section-title {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--text-primary, #f9f9f2);
      margin: 0;
    }
    .view-all-link {
      font-size: 12px;
      font-weight: 600;
      color: #a88a78;
      background: rgba(128,0,32,0.1);
      border: 1px solid rgba(128,0,32,0.22);
      padding: 6px 14px;
      border-radius: 8px;
      text-decoration: none;
      transition: background 0.2s, color 0.2s, border-color 0.2s;
    }
    .view-all-link:hover {
      background: rgba(128,0,32,0.25);
      color: #f9f9f2;
      border-color: #800020;
    }

    /* Movie grids */
    .download-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 18px;
    }
    @media (min-width: 480px)  { .download-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (min-width: 768px)  { .download-grid { grid-template-columns: repeat(4, 1fr); } }
    @media (min-width: 1024px) { .download-grid { grid-template-columns: repeat(5, 1fr); } }
    @media (min-width: 1280px) { .download-grid { grid-template-columns: repeat(6, 1fr); } }

    .stream-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 18px;
    }
    @media (min-width: 480px)  { .stream-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (min-width: 1024px) { .stream-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (min-width: 1280px) { .stream-grid { grid-template-columns: repeat(4, 1fr); } }

    /* Section divider */
    .section-divider {
      height: 1px;
      background: linear-gradient(to right, transparent, rgba(95,19,39,0.5), transparent);
      margin: 40px 0;
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

    /* Empty state */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 20px;
      text-align: center;
      color: #a88a78;
    }
  `],
  template: `
    <div class="page-wrap">

      <!-- ── PAGE HEADER ── -->
      <div class="page-header">
        <h2 class="page-title">All Movies</h2>
      </div>

      <!-- ── FILTER BAR ── -->
      <app-filter-bar
        [activeFilters]="searchParams()"
        (filterChange)="onFilterChange($event)"
      />

      <!-- ── LOADING SKELETONS ── -->
      @if (query.isPending()) {
        <div style="margin-bottom:40px;">
          <div style="height:20px;width:160px;border-radius:6px;margin-bottom:16px;" class="skeleton"></div>
          <div class="download-grid">
            @for (i of [1,2,3,4,5,6,7,8,9,10,11,12]; track i) {
              <div class="skeleton" style="aspect-ratio:2/3;"></div>
            }
          </div>
        </div>
        <div>
          <div style="height:20px;width:190px;border-radius:6px;margin-bottom:16px;" class="skeleton"></div>
          <div class="stream-grid">
            @for (i of [1,2,3,4]; track i) {
              <div>
                <div class="skeleton" style="aspect-ratio:16/9;"></div>
                <div class="skeleton" style="height:12px;width:80%;margin-top:10px;border-radius:4px;"></div>
                <div class="skeleton" style="height:10px;width:50%;margin-top:6px;border-radius:4px;"></div>
              </div>
            }
          </div>
        </div>
      }

      <!-- ── ERROR STATE ── -->
      @if (query.isError()) {
        <div class="empty-state">
          <div style="width:56px;height:56px;border-radius:50%;background:rgba(128,0,32,0.15);display:flex;align-items:center;justify-content:center;margin-bottom:16px;">
            <svg style="width:28px;height:28px;color:#800020;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
          </div>
          <h3 style="font-size:18px;font-weight:700;margin:0 0 8px;color:var(--text-primary);">Something went wrong</h3>
          <p style="font-size:14px;margin:0 0 20px;color:#a88a78;">{{ query.error()?.message }}</p>
          <button (click)="query.refetch()"
            style="padding:10px 28px;background:#800020;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;transition:background 0.2s;"
            onmouseenter="this.style.background='#660019'" onmouseleave="this.style.background='#800020'">
            Try Again
          </button>
        </div>
      }

      <!-- ── RESULTS ── -->
      @if (query.isSuccess()) {

        <!-- DOWNLOAD MOVIES -->
        @if (regularMovies().length > 0) {
          <section style="margin-bottom:12px;">
            <div class="section-header">
              <h3 class="section-title">Download Movies</h3>
              <a routerLink="/movies/downloads" class="view-all-link">View All</a>
            </div>
            <div class="download-grid">
              @for (movie of regularMovies(); track movie.id) {
                <app-movie-card
                  [movie]="movie"
                  [progress]="watchProgressByMovieId()[movie.id] ?? null"
                />
              }
            </div>
          </section>
        }

        <!-- Divider between sections (only if both have content) -->
        @if (regularMovies().length > 0 && streamMovies().length > 0) {
          <div class="section-divider"></div>
        }

        <!-- STREAM-ONLY MOVIES -->
        @if (streamMovies().length > 0) {
          <section>
            <div class="section-header">
              <h3 class="section-title">Stream-Only Movies</h3>
              <a routerLink="/movies/stream" class="view-all-link">View All</a>
            </div>
            <div class="stream-grid">
              @for (movie of streamMovies(); track movie.id) {
                <app-movie-card-youtube [movie]="movie" [progress]="watchProgressByMovieId()[movie.id] ?? null" />
              }
            </div>
          </section>
        }

        <!-- EMPTY STATE -->
        @if (query.data()?.data?.length === 0) {
          <div class="empty-state">
            <span style="font-size:56px;margin-bottom:16px;">🎬</span>
            <p style="font-size:17px;font-weight:600;margin:0 0 16px;">No movies match your filters.</p>
            <button
              (click)="onFilterChange({ q: undefined, genre: undefined, year: undefined, quality: undefined })"
              style="padding:9px 24px;background:rgba(128,0,32,0.15);color:#800020;border:1px solid rgba(128,0,32,0.35);border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.2s;"
              onmouseenter="this.style.background='rgba(128,0,32,0.25)'" onmouseleave="this.style.background='rgba(128,0,32,0.15)'">
              Clear Filters
            </button>
          </div>
        }

        <!-- PAGINATION -->
        @if (query.data()?.meta && query.data()!.meta!.totalPages > 1) {
          <div style="margin-top:36px;">
            <app-paginator
              [currentPage]="query.data()!.meta!.page"
              [totalPages]="query.data()!.meta!.totalPages"
              (pageChange)="onPageChange($event)"
            />
          </div>
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
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  private syncingFromUrl = false;

  watchProgressByMovieId = signal<Record<string, number>>({});
  query = this.moviesService.getMoviesQuery(this.searchParams);

  constructor() {
    // URL -> state sync (fixes pagination back-button issues)
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const page = Math.max(1, Number(params.get('page') || 1) || 1);
        const limit = Math.min(50, Math.max(1, Number(params.get('limit') || 20) || 20));
        const q = (params.get('q') || '').trim() || undefined;
        const year = params.get('year') ? Number(params.get('year')) : undefined;
        const sortBy = (params.get('sortBy') || 'latest') as MovieSearchParams['sortBy'];
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
        });
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

  // Handle page changes
  onPageChange(page: number) {
    this.searchParams.update((current: MovieSearchParams) => {
      const next = { ...current, page };
      this.syncUrl(next);
      return next;
    });
    // Scroll to top of results
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private syncUrl(params: MovieSearchParams) {
    if (this.syncingFromUrl) {
      return;
    }

    const queryParams: Record<string, any> = {
      page: params.page || 1,
      limit: params.limit || 20,
      sortBy: params.sortBy || 'latest',
      q: params.q || undefined,
      year: params.year || undefined,
      genre: params.genre?.[0] || undefined,
      quality: params.quality || undefined,
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

  regularMovies() {
    return (this.query.data()?.data || []).filter((movie) => !movie.isStreamOnly);
  }

  streamMovies() {
    return (this.query.data()?.data || []).filter((movie) => movie.isStreamOnly);
  }
}
