import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Genre, TvShowSearchParams, TvShowSummary } from '@naijaspride/types';
import { TvShowsQueryService } from '../../services/tv-shows-query.service';
import { TvShowCardComponent } from '../../components/tv-show-card/tv-show-card.component';

type TvSectionKey = 'trending' | 'latest-2026' | 'latest-2025' | 'highest-rated' | 'award-winning';

const TV_SECTION_LABELS: Record<TvSectionKey, string> = {
  trending: 'Trending',
  'latest-2026': 'Latest Releases (2026)',
  'latest-2025': 'Latest Releases (2025)',
  'highest-rated': 'Highest Rated',
  'award-winning': 'Award Winning',
};

@Component({
  selector: 'app-tv-shows-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TvShowCardComponent],
  template: `
    <section class="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
      <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">TV Shows</h1>
          <p class="text-sm text-white/60">TMDB-style browse with sections, filters, favorites, and pagination.</p>
        </div>

        <div class="relative w-full max-w-sm">
          <label>
            <span class="mb-1 block text-xs text-white/60">Search</span>
            <input
              type="text"
              class="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none ring-[#800020]/40 focus:ring"
              placeholder="Search shows..."
              [ngModel]="q()"
              (ngModelChange)="onSearchInput($event || '')"
              (focus)="searchFocused.set(true)"
              (blur)="onSearchBlur()"
            />
          </label>

          @if (showSuggestions()) {
            <div class="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-white/15 bg-[#111] p-1 shadow-lg">
              @if (suggestionLoading()) {
                <div class="px-2 py-2 text-xs text-white/70">Searching...</div>
              }

              @if (!suggestionLoading() && suggestions().length === 0) {
                <div class="px-2 py-2 text-xs text-white/70">No quick matches.</div>
              }

              @for (item of suggestions(); track item.id) {
                <a
                  class="flex items-center gap-2 rounded-md px-2 py-2 text-xs text-white/90 transition hover:bg-white/10"
                  [routerLink]="['/tv-shows', item.slug]"
                  (mousedown)="onSuggestionSelect()"
                >
                  <div class="h-8 w-6 overflow-hidden rounded bg-white/10">
                    @if (item.posterUrl || item.thumbnailUrl) {
                      <img [src]="item.posterUrl || item.thumbnailUrl || ''" [alt]="item.title" class="h-full w-full object-cover" referrerpolicy="no-referrer" />
                    }
                  </div>
                  <div class="min-w-0">
                    <p class="truncate">{{ item.title }}</p>
                    <p class="truncate text-[10px] text-white/60">{{ item.year }} • {{ item.seasonCount }} seasons</p>
                  </div>
                </a>
              }
            </div>
          }
        </div>
      </div>

      <div class="mb-5 grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-black/20 p-3 md:grid-cols-5">
        <label>
          <span class="mb-1 block text-[11px] text-white/60">Sort</span>
          <select class="w-full rounded-md border border-white/15 bg-black/40 px-2 py-2 text-sm text-white" [ngModel]="sortBy()" (ngModelChange)="onSortChange($event)">
            <option value="trending">Trending</option>
            <option value="latest">Latest</option>
            <option value="popular">Popular</option>
            <option value="title">Title (A-Z)</option>
          </select>
        </label>

        <label>
          <span class="mb-1 block text-[11px] text-white/60">Genre</span>
          <select class="w-full rounded-md border border-white/15 bg-black/40 px-2 py-2 text-sm text-white" [ngModel]="genre()" (ngModelChange)="onGenreChange($event)">
            <option value="">All genres</option>
            @for (entry of genreOptions; track entry) {
              <option [value]="entry">{{ entry }}</option>
            }
          </select>
        </label>

        <label>
          <span class="mb-1 block text-[11px] text-white/60">Year</span>
          <input type="number" class="w-full rounded-md border border-white/15 bg-black/40 px-2 py-2 text-sm text-white" [ngModel]="year()" (ngModelChange)="onYearChange($event)" placeholder="e.g. 2026" />
        </label>

        <label>
          <span class="mb-1 block text-[11px] text-white/60">Language</span>
          <input type="text" class="w-full rounded-md border border-white/15 bg-black/40 px-2 py-2 text-sm text-white" [ngModel]="language()" (ngModelChange)="onLanguageChange($event || '')" placeholder="e.g. EN" />
        </label>

        <button class="mt-[18px] rounded-md border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20" (click)="resetFilters()">
          Reset Filters
        </button>
      </div>

      <div class="mb-8">
        <p class="mb-2 text-xs uppercase tracking-[0.2em] text-white/50">Curated Sections</p>
        <div class="flex flex-wrap gap-2">
          @for (key of sectionKeys; track key) {
            <button
              class="rounded-full border px-3 py-1 text-xs transition"
              [ngClass]="activeSection() === key ? 'border-[#800020] bg-[#800020] text-white' : 'border-white/20 text-white/80'"
              (click)="applySection(key)"
            >
              {{ sectionLabel(key) }}
            </button>
          }
        </div>
      </div>

      <div class="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        @for (key of sectionKeys; track key) {
          <div class="rounded-xl border border-white/10 bg-black/20 p-3">
            <div class="mb-3 flex items-center justify-between">
              <h2 class="text-sm font-semibold text-white">{{ sectionLabel(key) }}</h2>
              <button class="text-xs text-[#d79] hover:underline" (click)="applySection(key)">View all</button>
            </div>
            @if (sectionQuery(key).isLoading()) {
              <div class="py-8 text-center text-xs text-white/60">Loading...</div>
            } @else {
              <div class="grid grid-cols-3 gap-2">
                @for (show of sectionQuery(key).data()?.data || []; track show.id) {
                  <app-tv-show-card [show]="show"></app-tv-show-card>
                }
              </div>
            }
          </div>
        }
      </div>

      <div id="tv-full-list" class="scroll-mt-24">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-white">{{ fullListTitle() }}</h2>
          @if (query.isFetching()) {
            <span class="text-xs text-white/60">Updating...</span>
          }
        </div>

        @if (query.isLoading()) {
          <div class="py-16 text-center text-white/70">Loading TV shows...</div>
        } @else if (query.isError()) {
          <div class="py-16 text-center text-red-300">Failed to load TV shows.</div>
        } @else {
          <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            @for (show of query.data()?.data || []; track show.id) {
              <app-tv-show-card [show]="show"></app-tv-show-card>
            }
          </div>

          <div class="mt-6 flex flex-wrap items-center justify-center gap-2">
            <button class="rounded-md border border-white/20 px-3 py-1.5 text-xs text-white disabled:opacity-40" [disabled]="!meta()?.hasPrev" (click)="goPrev()">Prev</button>
            @for (value of pageButtons(); track value) {
              <button
                class="rounded-md border px-3 py-1.5 text-xs"
                [ngClass]="value === page() ? 'border-[#800020] bg-[#800020] text-white' : 'border-white/20 text-white/85'"
                (click)="goToPage(value)"
              >
                {{ value }}
              </button>
            }
            <button class="rounded-md border border-white/20 px-3 py-1.5 text-xs text-white disabled:opacity-40" [disabled]="!meta()?.hasNext" (click)="goNext()">Next</button>
          </div>
        }
      </div>
    </section>
  `,
})
export class TvShowsListComponent implements OnInit {
  private tvQuery = inject(TvShowsQueryService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);

  sectionKeys: TvSectionKey[] = ['trending', 'latest-2026', 'latest-2025', 'highest-rated', 'award-winning'];
  genreOptions = Object.values(Genre);

  q = signal('');
  sortBy = signal<'latest' | 'popular' | 'title' | 'trending'>('trending');
  genre = signal<Genre | ''>('');
  year = signal<number | ''>('');
  language = signal('');
  page = signal(1);
  activeSection = signal<TvSectionKey>('trending');

  suggestions = signal<TvShowSummary[]>([]);
  suggestionLoading = signal(false);
  searchFocused = signal(false);
  private suggestionTimer: ReturnType<typeof setTimeout> | null = null;
  private suggestionToken = 0;

  showSuggestions = computed(() => {
    return this.searchFocused() && this.q().trim().length >= 2 && (this.suggestionLoading() || this.suggestions().length > 0);
  });

  private fullParams = computed<TvShowSearchParams>(() => {
    const selectedYear = this.year();
    const selectedGenre = this.genre();
    return {
      q: this.q().trim() || undefined,
      page: this.page(),
      limit: 30,
      sortBy: this.sortBy(),
      year: typeof selectedYear === 'number' ? selectedYear : undefined,
      genre: selectedGenre ? [selectedGenre as Genre] : undefined,
      language: this.language().trim() || undefined,
    };
  });

  query = this.tvQuery.getShowsQuery(this.fullParams);

  trendingQuery = this.tvQuery.getShowsQuery(computed(() => ({ page: 1, limit: 9, sortBy: 'trending' as const })));
  latest2026Query = this.tvQuery.getShowsQuery(computed(() => ({ page: 1, limit: 9, sortBy: 'latest' as const, year: 2026 })));
  latest2025Query = this.tvQuery.getShowsQuery(computed(() => ({ page: 1, limit: 9, sortBy: 'latest' as const, year: 2025 })));
  highestRatedQuery = this.tvQuery.getShowsQuery(computed(() => ({ page: 1, limit: 9, sortBy: 'popular' as const })));
  awardWinningQuery = this.tvQuery.getShowsQuery(computed(() => ({ page: 1, limit: 9, sortBy: 'popular' as const, genre: [Genre.Drama] })));

  meta = computed(() => this.query.data()?.meta);
  pageButtons = computed(() => {
    const total = this.meta()?.totalPages || 1;
    const current = this.page();
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

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const section = params.get('section') as TvSectionKey | null;
    const q = (params.get('q') || '').trim();
    const pageRaw = Number.parseInt(params.get('page') || '1', 10);

    if (section && this.sectionKeys.includes(section)) {
      this.applySection(section, false);
    }

    if (q) this.q.set(q);
    if (Number.isFinite(pageRaw) && pageRaw > 0) this.page.set(pageRaw);

    const sortBy = params.get('sortBy');
    if (sortBy === 'latest' || sortBy === 'popular' || sortBy === 'title' || sortBy === 'trending') {
      this.sortBy.set(sortBy);
    }

    const yearRaw = Number.parseInt(params.get('year') || '', 10);
    if (Number.isFinite(yearRaw) && yearRaw >= 1900) this.year.set(yearRaw);

    const genreRaw = params.get('genre');
    if (genreRaw && this.genreOptions.includes(genreRaw as Genre)) {
      this.genre.set(genreRaw as Genre);
    }

    const language = (params.get('language') || '').trim();
    if (language) this.language.set(language);
  }

  sectionLabel(key: TvSectionKey): string {
    return TV_SECTION_LABELS[key];
  }

  sectionQuery(key: TvSectionKey) {
    if (key === 'latest-2026') return this.latest2026Query;
    if (key === 'latest-2025') return this.latest2025Query;
    if (key === 'highest-rated') return this.highestRatedQuery;
    if (key === 'award-winning') return this.awardWinningQuery;
    return this.trendingQuery;
  }

  applySection(section: TvSectionKey, writeUrl = true): void {
    this.activeSection.set(section);
    this.page.set(1);

    if (section === 'latest-2026') {
      this.sortBy.set('latest');
      this.year.set(2026);
      this.genre.set('');
    } else if (section === 'latest-2025') {
      this.sortBy.set('latest');
      this.year.set(2025);
      this.genre.set('');
    } else if (section === 'highest-rated') {
      this.sortBy.set('popular');
      this.year.set('');
      this.genre.set('');
    } else if (section === 'award-winning') {
      this.sortBy.set('popular');
      this.genre.set(Genre.Drama);
      this.year.set('');
    } else {
      this.sortBy.set('trending');
      this.genre.set('');
      this.year.set('');
    }

    if (writeUrl) {
      this.syncQueryParams();
      this.scrollToFullList();
    }
  }

  onSearchInput(value: string): void {
    this.q.set(value);
    this.page.set(1);
    this.syncQueryParams();

    const q = value.trim();
    if (this.suggestionTimer) clearTimeout(this.suggestionTimer);
    if (q.length < 2) {
      this.suggestions.set([]);
      this.suggestionLoading.set(false);
      return;
    }

    this.suggestionLoading.set(true);
    this.suggestionTimer = setTimeout(() => this.fetchSuggestions(q), 240);
  }

  onSearchBlur(): void {
    setTimeout(() => {
      this.searchFocused.set(false);
    }, 120);
  }

  onSuggestionSelect(): void {
    this.searchFocused.set(false);
    this.suggestions.set([]);
    this.suggestionLoading.set(false);
  }

  onSortChange(value: 'latest' | 'popular' | 'title' | 'trending'): void {
    this.sortBy.set(value);
    this.page.set(1);
    this.syncQueryParams();
  }

  onGenreChange(value: Genre | ''): void {
    this.genre.set(value);
    this.page.set(1);
    this.syncQueryParams();
  }

  onYearChange(value: string | number): void {
    const parsed = Number.parseInt(String(value || ''), 10);
    this.year.set(Number.isFinite(parsed) && parsed >= 1900 ? parsed : '');
    this.page.set(1);
    this.syncQueryParams();
  }

  onLanguageChange(value: string): void {
    this.language.set(value);
    this.page.set(1);
    this.syncQueryParams();
  }

  resetFilters(): void {
    this.q.set('');
    this.sortBy.set('trending');
    this.genre.set('');
    this.year.set('');
    this.language.set('');
    this.page.set(1);
    this.activeSection.set('trending');
    this.syncQueryParams();
  }

  goPrev(): void {
    if (!this.meta()?.hasPrev) return;
    this.page.update((value) => Math.max(1, value - 1));
    this.syncQueryParams();
    this.scrollToFullList();
  }

  goNext(): void {
    if (!this.meta()?.hasNext) return;
    this.page.update((value) => value + 1);
    this.syncQueryParams();
    this.scrollToFullList();
  }

  goToPage(value: number): void {
    if (value === this.page()) return;
    this.page.set(value);
    this.syncQueryParams();
    this.scrollToFullList();
  }

  private fetchSuggestions(q: string): void {
    const token = ++this.suggestionToken;
    this.http
      .get<{ success: boolean; data: TvShowSummary[] }>('/api/v1/tv-shows', {
        params: {
          q,
          page: '1',
          limit: '8',
          sortBy: 'trending',
        },
      })
      .subscribe({
        next: (response) => {
          if (token !== this.suggestionToken) return;
          this.suggestions.set(response.data || []);
          this.suggestionLoading.set(false);
        },
        error: () => {
          if (token !== this.suggestionToken) return;
          this.suggestions.set([]);
          this.suggestionLoading.set(false);
        },
      });
  }

  private syncQueryParams(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        section: this.activeSection(),
        q: this.q().trim() || null,
        page: this.page(),
        sortBy: this.sortBy(),
        genre: this.genre() || null,
        year: typeof this.year() === 'number' ? this.year() : null,
        language: this.language().trim() || null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private scrollToFullList(): void {
    if (typeof document === 'undefined') return;
    const target = document.getElementById('tv-full-list');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
