import { Component, EventEmitter, HostListener, Input, OnDestroy, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { Genre, Quality, MovieSearchParams, MovieSummary } from '@naijaspride/types';
import { MoviesApiService } from '../../services/movies-api.service';

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="sticky top-20 z-30 mb-6 border-b border-[#d8c2b8]/60 bg-[#f9efe8]/95 py-3 backdrop-blur-sm transition-all dark:border-white/5 dark:bg-cinema-900/95">
      <div class="flex flex-wrap items-center gap-3">
        <div class="relative min-w-[240px] flex-1 md:max-w-md" data-movie-search>
          <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <svg class="h-4 w-4 text-[#8a756e] dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>

          <input
            type="text"
            [ngModel]="activeFilters.q || ''"
            (ngModelChange)="onQueryChange($event)"
            (focus)="onSearchFocus()"
            (keydown)="onSearchKeydown($event)"
            aria-label="Search movies"
            placeholder="Search by movie title..."
            class="h-11 w-full rounded-xl border border-[#d8c2b8] bg-white pl-10 pr-4 text-sm text-[#2a1c1f] outline-none transition placeholder-[#8f7a72] focus:border-cinema-500 focus:ring-2 focus:ring-cinema-500/20 dark:border-white/10 dark:bg-cinema-800 dark:text-white dark:placeholder-gray-600"
          />

          @if (showSuggestions()) {
            <div class="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-xl border border-[#d8c2b8] bg-white shadow-xl dark:border-white/10 dark:bg-cinema-850">
              @if (isSuggestionLoading) {
                <div class="px-3 py-2 text-xs text-[#7e6a63] dark:text-gray-400">Searching...</div>
              }

              @for (movie of suggestions; track movie.id; let i = $index) {
                <button
                  type="button"
                  class="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors"
                  [class.bg-[#f5e7df]]="i === highlightedIndex"
                  [class.dark:bg-cinema-700]="i === highlightedIndex"
                  (mouseenter)="highlightedIndex = i"
                  (click)="openSuggestion(movie, $event)"
                >
                  @if (suggestionImage(movie); as imageUrl) {
                    <img
                      [src]="imageUrl"
                      [alt]="movie.title"
                      referrerpolicy="no-referrer"
                      class="h-12 w-9 shrink-0 rounded object-cover"
                    />
                  } @else {
                    <div class="flex h-12 w-9 shrink-0 items-center justify-center rounded bg-[#e5d2c6] text-sm dark:bg-cinema-700">🎬</div>
                  }

                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-[#2a1c1f] dark:text-white">{{ movie.title }}</p>
                    <p class="text-xs text-[#7e6a63] dark:text-gray-400">{{ movie.year }}{{ movie.genre?.[0] ? ' • ' + movie.genre[0] : '' }}</p>
                  </div>
                </button>
              }

              @if (!isSuggestionLoading && suggestions.length === 0) {
                <div class="px-3 py-2 text-xs text-[#7e6a63] dark:text-gray-400">No quick matches found.</div>
              }
            </div>
          }
        </div>

        <div class="hidden h-6 w-px bg-[#d8c2b8] md:block dark:bg-white/10"></div>

        <select
          [ngModel]="activeFilters.genre?.[0] || ''"
          (ngModelChange)="updateFilter('genre', $event ? [$event] : undefined)"
          aria-label="Filter by genre"
          class="cursor-pointer appearance-none rounded-lg border border-[#d8c2b8] bg-white px-4 py-2 text-sm text-[#5f4d47] transition-colors hover:border-[#b99f92] focus:border-cinema-500 focus:outline-none focus:ring-2 focus:ring-cinema-500/30 dark:border-white/10 dark:bg-cinema-800 dark:text-gray-300 dark:hover:border-white/20"
        >
          <option value="">All Genres</option>
          @for (g of genres; track g) {
            <option [value]="g">{{ g }}</option>
          }
        </select>

        <select
          [ngModel]="activeFilters.year || ''"
          (ngModelChange)="updateFilter('year', $event ? +$event : undefined)"
          aria-label="Filter by year"
          class="cursor-pointer appearance-none rounded-lg border border-[#d8c2b8] bg-white px-4 py-2 text-sm text-[#5f4d47] transition-colors hover:border-[#b99f92] focus:border-cinema-500 focus:outline-none focus:ring-2 focus:ring-cinema-500/30 dark:border-white/10 dark:bg-cinema-800 dark:text-gray-300 dark:hover:border-white/20"
        >
          <option value="">All Years</option>
          @for (y of years; track y) {
            <option [value]="y">{{ y }}</option>
          }
        </select>

        <select
          [ngModel]="activeFilters.quality || ''"
          (ngModelChange)="updateFilter('quality', $event || undefined)"
          aria-label="Filter by quality"
          class="cursor-pointer appearance-none rounded-lg border border-[#d8c2b8] bg-white px-4 py-2 text-sm text-[#5f4d47] transition-colors hover:border-[#b99f92] focus:border-cinema-500 focus:outline-none focus:ring-2 focus:ring-cinema-500/30 dark:border-white/10 dark:bg-cinema-800 dark:text-gray-300 dark:hover:border-white/20"
        >
          <option value="">All Qualities</option>
          @for (q of qualities; track q) {
            <option [value]="q">{{ q }}</option>
          }
        </select>

        <div class="grow"></div>

        <select
          [ngModel]="activeFilters.sortBy || 'latest'"
          (ngModelChange)="updateFilter('sortBy', $event)"
          aria-label="Sort movies"
          class="cursor-pointer appearance-none rounded-lg border border-[#d8c2b8] bg-white px-4 py-2 text-sm text-[#6f5b54] transition-colors hover:border-[#b99f92] focus:border-cinema-500 focus:outline-none focus:ring-2 focus:ring-cinema-500/30 dark:border-white/10 dark:bg-cinema-800 dark:text-gray-400 dark:hover:border-white/20"
        >
          <option value="latest">Latest</option>
          <option value="popular">Popular</option>
          <option value="rating">Top Rated</option>
          <option value="title">A-Z</option>
        </select>
      </div>

      @if (hasActiveFilters()) {
        <div class="mt-3 flex flex-wrap gap-2 border-t border-dashed border-[#d8c2b8] pt-2 dark:border-white/10">
          <span class="mr-1 self-center text-xs font-bold uppercase tracking-wider text-[#8a756e] dark:text-gray-500">Active:</span>

          @if (activeFilters.genre) {
            <button (click)="updateFilter('genre', undefined)" class="inline-flex items-center gap-1 rounded-sm bg-cinema-500/20 px-2 py-1 text-xs text-[#4f0f21] transition-colors hover:bg-cinema-500/30 dark:text-cinema-100" aria-label="Remove genre filter">
              {{ activeFilters.genre[0] }} ✕
            </button>
          }
          @if (activeFilters.year) {
            <button (click)="updateFilter('year', undefined)" class="inline-flex items-center gap-1 rounded-sm bg-cinema-500/20 px-2 py-1 text-xs text-[#4f0f21] transition-colors hover:bg-cinema-500/30 dark:text-cinema-100" aria-label="Remove year filter">
              {{ activeFilters.year }} ✕
            </button>
          }
          @if (activeFilters.quality) {
            <button (click)="updateFilter('quality', undefined)" class="inline-flex items-center gap-1 rounded-sm bg-cinema-500/20 px-2 py-1 text-xs text-[#4f0f21] transition-colors hover:bg-cinema-500/30 dark:text-cinema-100" aria-label="Remove quality filter">
              {{ activeFilters.quality }} ✕
            </button>
          }

          <button (click)="resetAll()" class="ml-auto text-xs font-medium text-cinema-500 transition-colors hover:text-[#4f0f21] dark:hover:text-cinema-100" aria-label="Clear all active filters">
            Clear All
          </button>
        </div>
      }
    </div>
  `,
})
export class FilterBarComponent implements OnDestroy {
  @Input({ required: true }) activeFilters!: MovieSearchParams;
  @Output() filterChange = new EventEmitter<Partial<MovieSearchParams>>();

  private moviesApi = inject(MoviesApiService);
  private router = inject(Router);

  private queryDebounce?: ReturnType<typeof setTimeout>;
  private suggestionDebounce?: ReturnType<typeof setTimeout>;
  private suggestionSub?: Subscription;
  private latestSuggestionToken = 0;

  suggestions: MovieSummary[] = [];
  highlightedIndex = -1;
  isSuggestionLoading = false;
  private searchFocused = false;

  genres = Object.values(Genre);
  qualities = Object.values(Quality);

  currentYear = new Date().getFullYear();
  years = Array.from({ length: 20 }, (_, i) => this.currentYear - i);

  updateFilter(key: keyof MovieSearchParams, value: unknown) {
    this.filterChange.emit({ [key]: value });
  }

  onQueryChange(nextValue: string) {
    if (this.queryDebounce) {
      clearTimeout(this.queryDebounce);
    }

    this.queryDebounce = setTimeout(() => {
      const normalized = (nextValue || '').trim();
      this.updateFilter('q', normalized || undefined);
    }, 250);

    this.scheduleSuggestions(nextValue || '');
  }

  onSearchFocus() {
    this.searchFocused = true;
    const current = (this.activeFilters?.q || '').trim();
    if (current.length >= 2 && this.suggestions.length === 0) {
      this.fetchSuggestions(current);
    }
  }

  onSearchKeydown(event: KeyboardEvent) {
    if (!this.showSuggestions()) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.highlightedIndex = Math.min(this.highlightedIndex + 1, this.suggestions.length - 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.highlightedIndex = Math.max(this.highlightedIndex - 1, 0);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeSuggestions();
      return;
    }

    if (event.key === 'Enter' && this.highlightedIndex >= 0 && this.highlightedIndex < this.suggestions.length) {
      event.preventDefault();
      this.openSuggestion(this.suggestions[this.highlightedIndex], event);
    }
  }

  openSuggestion(movie: MovieSummary, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.closeSuggestions();
    this.router.navigate(['/movies', movie.slug || movie.id]);
  }

  suggestionImage(movie: MovieSummary): string | null {
    return movie.thumbnailUrl || movie.posterUrl || movie.coverUrl || movie.backdropUrl || null;
  }

  showSuggestions(): boolean {
    const query = (this.activeFilters?.q || '').trim();
    if (!this.searchFocused || query.length < 2) {
      return false;
    }
    return this.isSuggestionLoading || this.suggestions.length > 0;
  }

  resetAll() {
    this.filterChange.emit({
      q: undefined,
      genre: undefined,
      year: undefined,
      quality: undefined,
      sortBy: 'latest',
    });
    this.closeSuggestions();
  }

  hasActiveFilters(): boolean {
    const { genre, year, quality, q } = this.activeFilters;
    return !!(genre?.length || year || quality || q);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-movie-search]')) {
      return;
    }
    this.closeSuggestions();
  }

  ngOnDestroy(): void {
    if (this.queryDebounce) {
      clearTimeout(this.queryDebounce);
    }
    if (this.suggestionDebounce) {
      clearTimeout(this.suggestionDebounce);
    }
    this.cancelSuggestionRequest();
  }

  private scheduleSuggestions(rawQuery: string) {
    if (this.suggestionDebounce) {
      clearTimeout(this.suggestionDebounce);
    }

    const query = rawQuery.trim();
    if (query.length < 2) {
      this.cancelSuggestionRequest();
      this.isSuggestionLoading = false;
      this.suggestions = [];
      this.highlightedIndex = -1;
      return;
    }

    this.suggestionDebounce = setTimeout(() => {
      this.fetchSuggestions(query);
    }, 180);
  }

  private fetchSuggestions(query: string) {
    this.cancelSuggestionRequest();
    this.isSuggestionLoading = true;
    this.highlightedIndex = -1;
    const token = ++this.latestSuggestionToken;

    this.suggestionSub = this.moviesApi.getMovieSuggestions(query, 6).subscribe({
      next: (response) => {
        if (token !== this.latestSuggestionToken) {
          return;
        }
        this.suggestions = (response.data || []).slice(0, 6);
        this.isSuggestionLoading = false;
      },
      error: () => {
        if (token !== this.latestSuggestionToken) {
          return;
        }
        this.suggestions = [];
        this.isSuggestionLoading = false;
      },
    });
  }

  private cancelSuggestionRequest() {
    if (this.suggestionSub) {
      this.suggestionSub.unsubscribe();
      this.suggestionSub = undefined;
    }
  }

  private closeSuggestions() {
    this.searchFocused = false;
    this.highlightedIndex = -1;
    this.isSuggestionLoading = false;
    this.suggestions = [];
  }
}
