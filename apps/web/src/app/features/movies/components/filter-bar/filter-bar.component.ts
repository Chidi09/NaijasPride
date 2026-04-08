import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  inject,
  signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { Subscription } from "rxjs";
import {
  Genre,
  Quality,
  MovieSearchParams,
  MovieSummary,
} from "@naijaspride/types";
import { MoviesApiService } from "../../services/movies-api.service";
import { CrossIconComponent } from "../../../../shared/components/icons/cross-icon.component";

@Component({
  selector: "app-filter-bar",
  standalone: true,
  imports: [CommonModule, FormsModule, CrossIconComponent],
  styles: [
    `
      :host {
        display: block;
      }

      .filter-bar {
        background: var(--bg-secondary, #121212);
        border: 1px solid rgba(128, 0, 32, 0.18);
        border-radius: 14px;
        padding: 14px 16px;
        margin-bottom: 24px;
      }

      .dark .filter-bar {
        background: #12080d;
        border-color: rgba(128, 0, 32, 0.22);
      }

      .search-wrap {
        position: relative;
        flex: 1;
        min-width: 0;
      }

      .search-input {
        width: 100%;
        height: 40px;
        border-radius: 10px;
        border: 1px solid rgba(128, 0, 32, 0.25);
        background: rgba(0, 0, 0, 0.3);
        color: #f9f9f2;
        padding: 0 14px 0 38px;
        font-size: 13px;
        outline: none;
        transition:
          border-color 0.2s,
          box-shadow 0.2s;
      }
      .search-input::placeholder {
        color: #6b5055;
      }
      .search-input:focus {
        border-color: #800020;
        box-shadow: 0 0 0 3px rgba(128, 0, 32, 0.15);
      }

      /* Light mode overrides */
      :host-context(.light) .search-input,
      :host-context(:not(.dark)) .search-input {
        background: #fff;
        color: #1d1416;
        border-color: #d8c2b8;
      }
      :host-context(.light) .search-input::placeholder,
      :host-context(:not(.dark)) .search-input::placeholder {
        color: #9a857d;
      }

      .filter-select {
        height: 40px;
        border-radius: 10px;
        border: 1px solid rgba(128, 0, 32, 0.25);
        background: rgba(0, 0, 0, 0.3);
        color: #f9f9f2;
        padding: 0 30px 0 12px;
        font-size: 13px;
        outline: none;
        appearance: none;
        cursor: pointer;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a88a78' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 10px center;
        transition: border-color 0.2s;
        white-space: nowrap;
      }
      .filter-select:focus {
        border-color: #800020;
      }
      .filter-select:hover {
        border-color: rgba(128, 0, 32, 0.5);
      }

      :host-context(.light) .filter-select,
      :host-context(:not(.dark)) .filter-select {
        background-color: #fff;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a756e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
        color: #2a1c1f;
        border-color: #d8c2b8;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 10px;
        border-radius: 99px;
        font-size: 11px;
        font-weight: 600;
        background: rgba(128, 0, 32, 0.2);
        color: #e8a0b0;
        border: 1px solid rgba(128, 0, 32, 0.35);
        cursor: pointer;
        transition: background 0.15s;
      }
      .chip:hover {
        background: rgba(128, 0, 32, 0.35);
      }

      :host-context(.light) .chip,
      :host-context(:not(.dark)) .chip {
        background: rgba(128, 0, 32, 0.1);
        color: #4f0f21;
        border-color: rgba(128, 0, 32, 0.3);
      }

      .filters-toggle-btn {
        height: 40px;
        padding: 0 14px;
        border-radius: 10px;
        border: 1px solid rgba(128, 0, 32, 0.3);
        background: rgba(128, 0, 32, 0.1);
        color: #e8a0b0;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
        transition:
          background 0.2s,
          border-color 0.2s;
        white-space: nowrap;
      }
      .filters-toggle-btn:hover {
        background: rgba(128, 0, 32, 0.2);
      }
      .filters-toggle-btn.active {
        background: rgba(128, 0, 32, 0.25);
        border-color: #800020;
        color: #f9f9f2;
      }

      :host-context(.light) .filters-toggle-btn,
      :host-context(:not(.dark)) .filters-toggle-btn {
        background: rgba(128, 0, 32, 0.08);
        color: #4f0f21;
        border-color: rgba(128, 0, 32, 0.25);
      }

      .sort-select {
        height: 40px;
        border-radius: 10px;
        border: 1px solid rgba(128, 0, 32, 0.25);
        background: rgba(0, 0, 0, 0.3);
        color: #f9f9f2;
        padding: 0 30px 0 12px;
        font-size: 13px;
        outline: none;
        appearance: none;
        cursor: pointer;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a88a78' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 10px center;
        transition: border-color 0.2s;
        flex-shrink: 0;
      }
      .sort-select:focus {
        border-color: #800020;
      }

      :host-context(.light) .sort-select,
      :host-context(:not(.dark)) .sort-select {
        background-color: #fff;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a756e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
        color: #2a1c1f;
        border-color: #d8c2b8;
      }

      .suggestions-drop {
        position: absolute;
        left: 0;
        right: 0;
        top: calc(100% + 6px);
        z-index: 60;
        border-radius: 12px;
        border: 1px solid rgba(128, 0, 32, 0.3);
        background: #1a0a10;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
        overflow: hidden;
      }
      :host-context(.light) .suggestions-drop,
      :host-context(:not(.dark)) .suggestions-drop {
        background: #fff;
        border-color: #d8c2b8;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
      }

      .suggestion-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        cursor: pointer;
        transition: background 0.12s;
      }
      .suggestion-row:hover,
      .suggestion-row.highlighted {
        background: rgba(128, 0, 32, 0.18);
      }
      :host-context(.light) .suggestion-row:hover,
      :host-context(.light) .suggestion-row.highlighted,
      :host-context(:not(.dark)) .suggestion-row:hover,
      :host-context(:not(.dark)) .suggestion-row.highlighted {
        background: #f5e7df;
      }

      /* Expand/collapse for filter panel on mobile */
      .filter-panel {
        display: grid;
        grid-template-rows: 1fr;
        overflow: hidden;
        transition: grid-template-rows 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .filter-panel.collapsed {
        grid-template-rows: 0fr;
      }
      .filter-panel-inner {
        min-height: 0;
      }
    `,
  ],
  template: `
    <div class="filter-bar">
      <!-- ── TOP ROW: search + filters toggle + sort ── -->
      <div
        style="display:flex; align-items:center; gap:10px; flex-wrap:nowrap;"
      >
        <!-- Search -->
        <div class="search-wrap" data-movie-search>
          <svg
            style="position:absolute;left:11px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:#6b5055;pointer-events:none;"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            class="search-input"
            [ngModel]="activeFilters.q || ''"
            (ngModelChange)="onQueryChange($event)"
            (focus)="onSearchFocus()"
            (keydown)="onSearchKeydown($event)"
            aria-label="Search movies"
            placeholder="Search by movie title..."
          />

          @if (showSuggestions()) {
            <div class="suggestions-drop">
              @if (isSuggestionLoading) {
                <div style="padding:10px 12px;font-size:12px;color:#6b5055;">
                  Searching...
                </div>
              }
              @for (movie of suggestions; track movie.id; let i = $index) {
                <button
                  type="button"
                  class="suggestion-row"
                  [class.highlighted]="i === highlightedIndex"
                  (mouseenter)="highlightedIndex = i"
                  (click)="openSuggestion(movie, $event)"
                  style="width:100%;border:none;text-align:left;"
                >
                  @if (suggestionImage(movie); as imageUrl) {
                    <img
                      [src]="imageUrl"
                      [alt]="movie.title"
                      referrerpolicy="no-referrer"
                      style="width:36px;height:48px;border-radius:6px;object-fit:cover;flex-shrink:0;"
                    />
                  } @else {
                    <div
                      style="width:36px;height:48px;border-radius:6px;background:rgba(128,0,32,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;"
                    >
                      <span
                        class="material-symbols-outlined"
                        aria-hidden="true"
                        style="font-size:16px;line-height:1;"
                        >movie</span
                      >
                    </div>
                  }
                  <div style="min-width:0;">
                    <p
                      style="margin:0;font-size:13px;font-weight:600;color:#f9f9f2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
                    >
                      {{ movie.title }}
                    </p>
                    <p style="margin:2px 0 0;font-size:11px;color:#a88a78;">
                      {{ movie.year
                      }}{{ movie.genre?.[0] ? " • " + movie.genre[0] : "" }}
                    </p>
                  </div>
                </button>
              }
              @if (!isSuggestionLoading && suggestions.length === 0) {
                <div style="padding:10px 12px;font-size:12px;color:#6b5055;">
                  No quick matches found.
                </div>
              }
            </div>
          }
        </div>

        <!-- Filters toggle button (mobile) — hidden on md+ -->
        <button
          type="button"
          class="filters-toggle-btn md-hide"
          [class.active]="filtersOpen()"
          (click)="filtersOpen.set(!filtersOpen())"
          aria-label="Toggle filters"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="8" y1="12" x2="16" y2="12" />
            <line x1="10" y1="18" x2="14" y2="18" />
          </svg>
          Filters
          @if (hasActiveFilters()) {
            <span
              style="width:7px;height:7px;border-radius:50%;background:#800020;flex-shrink:0;"
            ></span>
          }
        </button>

        <!-- Desktop filter selects (inline, hidden on mobile) -->
        <div class="desktop-filters">
          <select
            class="filter-select"
            [ngModel]="activeFilters.genre?.[0] || ''"
            (ngModelChange)="
              updateFilter('genre', $event ? [$event] : undefined)
            "
            aria-label="Filter by genre"
          >
            <option value="">All Genres</option>
            @for (g of genres; track g) {
              <option [value]="g">{{ g }}</option>
            }
          </select>

          <select
            class="filter-select"
            [ngModel]="activeFilters.year || ''"
            (ngModelChange)="updateFilter('year', $event ? +$event : undefined)"
            aria-label="Filter by year"
          >
            <option value="">All Years</option>
            @for (y of years; track y) {
              <option [value]="y">{{ y }}</option>
            }
          </select>

          <select
            class="filter-select"
            [ngModel]="activeFilters.quality || ''"
            (ngModelChange)="updateFilter('quality', $event || undefined)"
            aria-label="Filter by quality"
          >
            <option value="">All Qualities</option>
            @for (q of qualities; track q) {
              <option [value]="q">{{ q }}</option>
            }
          </select>
        </div>

        <!-- Spacer -->
        <div style="flex:1; min-width:0;"></div>

        <!-- Sort -->
        <select
          class="sort-select"
          [ngModel]="activeFilters.sortBy || 'latest'"
          (ngModelChange)="updateFilter('sortBy', $event)"
          aria-label="Sort movies"
        >
          <option value="latest">Latest</option>
          <option value="popular">Popular</option>
          <option value="rating">Top Rated</option>
          <option value="title">A–Z</option>
        </select>
      </div>

      <!-- ── MOBILE COLLAPSIBLE FILTER PANEL ── -->
      <div
        class="filter-panel mobile-filter-panel"
        [class.collapsed]="!filtersOpen()"
      >
        <div class="filter-panel-inner">
          <div
            style="display:flex;flex-wrap:wrap;gap:8px;padding-top:12px;border-top:1px solid rgba(128,0,32,0.15);margin-top:12px;"
          >
            <select
              class="filter-select"
              style="flex:1;min-width:130px;"
              [ngModel]="activeFilters.genre?.[0] || ''"
              (ngModelChange)="
                updateFilter('genre', $event ? [$event] : undefined)
              "
              aria-label="Filter by genre"
            >
              <option value="">All Genres</option>
              @for (g of genres; track g) {
                <option [value]="g">{{ g }}</option>
              }
            </select>

            <select
              class="filter-select"
              style="flex:1;min-width:110px;"
              [ngModel]="activeFilters.year || ''"
              (ngModelChange)="
                updateFilter('year', $event ? +$event : undefined)
              "
              aria-label="Filter by year"
            >
              <option value="">All Years</option>
              @for (y of years; track y) {
                <option [value]="y">{{ y }}</option>
              }
            </select>

            <select
              class="filter-select"
              style="flex:1;min-width:120px;"
              [ngModel]="activeFilters.quality || ''"
              (ngModelChange)="updateFilter('quality', $event || undefined)"
              aria-label="Filter by quality"
            >
              <option value="">All Qualities</option>
              @for (q of qualities; track q) {
                <option [value]="q">{{ q }}</option>
              }
            </select>
          </div>
        </div>
      </div>

      <!-- ── ACTIVE FILTER CHIPS ── -->
      @if (hasActiveFilters()) {
        <div
          style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding-top:10px;border-top:1px dashed rgba(128,0,32,0.2);margin-top:10px;"
        >
          <span
            style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6b5055;margin-right:2px;"
            >Active:</span
          >

          @if (activeFilters.q) {
            <button
              class="chip"
              (click)="updateFilter('q', undefined)"
              aria-label="Remove search filter"
            >
              "{{ activeFilters.q }}"
              <app-cross-icon [size]="12" fillColor="currentColor" />
            </button>
          }
          @if (activeFilters.genre) {
            <button
              class="chip"
              (click)="updateFilter('genre', undefined)"
              aria-label="Remove genre filter"
            >
              {{ activeFilters.genre[0] }}
              <app-cross-icon [size]="12" fillColor="currentColor" />
            </button>
          }
          @if (activeFilters.year) {
            <button
              class="chip"
              (click)="updateFilter('year', undefined)"
              aria-label="Remove year filter"
            >
              {{ activeFilters.year }}
              <app-cross-icon [size]="12" fillColor="currentColor" />
            </button>
          }
          @if (activeFilters.quality) {
            <button
              class="chip"
              (click)="updateFilter('quality', undefined)"
              aria-label="Remove quality filter"
            >
              {{ activeFilters.quality }}
              <app-cross-icon [size]="12" fillColor="currentColor" />
            </button>
          }
          @if (activeFilters.genre) {
            <button
              class="chip"
              (click)="updateFilter('genre', undefined)"
              aria-label="Remove genre filter"
            >
              {{ activeFilters.genre[0] }}
              <app-cross-icon [size]="12" fillColor="currentColor" />
            </button>
          }
          @if (activeFilters.year) {
            <button
              class="chip"
              (click)="updateFilter('year', undefined)"
              aria-label="Remove year filter"
            >
              {{ activeFilters.year }}
              <app-cross-icon [size]="12" fillColor="currentColor" />
            </button>
          }
          @if (activeFilters.quality) {
            <button
              class="chip"
              (click)="updateFilter('quality', undefined)"
              aria-label="Remove quality filter"
            >
              {{ activeFilters.quality }}
              <app-cross-icon [size]="12" fillColor="currentColor" />
            </button>
          }

          <button
            (click)="resetAll()"
            style="margin-left:auto;font-size:11px;font-weight:600;color:#800020;background:none;border:none;cursor:pointer;padding:2px 4px;"
            aria-label="Clear all active filters"
          >
            Clear All
          </button>
        </div>
      }
    </div>

    <style>
      /* Responsive: show toggle on mobile, hide desktop filters; reverse on md+ */
      .md-hide {
        display: flex;
      }
      .desktop-filters {
        display: none;
      }
      .mobile-filter-panel {
        display: grid;
      }

      @media (min-width: 768px) {
        .md-hide {
          display: none !important;
        }
        .desktop-filters {
          display: flex;
          gap: 8px;
        }
        .mobile-filter-panel {
          display: none !important;
        }
      }
    </style>
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

  filtersOpen = signal(false);

  genres = Object.values(Genre);
  qualities = Object.values(Quality);

  currentYear = new Date().getFullYear();
  years = Array.from({ length: 20 }, (_, i) => this.currentYear - i);

  updateFilter(key: keyof MovieSearchParams, value: unknown) {
    this.filterChange.emit({ [key]: value });
  }

  onQueryChange(nextValue: string) {
    if (this.queryDebounce) clearTimeout(this.queryDebounce);
    this.queryDebounce = setTimeout(() => {
      const normalized = (nextValue || "").trim();
      this.updateFilter("q", normalized || undefined);
    }, 250);
    this.scheduleSuggestions(nextValue || "");
  }

  onSearchFocus() {
    this.searchFocused = true;
    const current = (this.activeFilters?.q || "").trim();
    if (current.length >= 2 && this.suggestions.length === 0) {
      this.fetchSuggestions(current);
    }
  }

  onSearchKeydown(event: KeyboardEvent) {
    if (!this.showSuggestions()) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.highlightedIndex = Math.min(
        this.highlightedIndex + 1,
        this.suggestions.length - 1,
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.highlightedIndex = Math.max(this.highlightedIndex - 1, 0);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.closeSuggestions();
      return;
    }
    if (
      event.key === "Enter" &&
      this.highlightedIndex >= 0 &&
      this.highlightedIndex < this.suggestions.length
    ) {
      event.preventDefault();
      this.openSuggestion(this.suggestions[this.highlightedIndex], event);
    }
  }

  openSuggestion(movie: MovieSummary, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.closeSuggestions();
    this.router.navigate(["/movies", movie.slug || movie.id]);
  }

  suggestionImage(movie: MovieSummary): string | null {
    return (
      movie.thumbnailUrl ||
      movie.posterUrl ||
      movie.coverUrl ||
      movie.backdropUrl ||
      null
    );
  }

  showSuggestions(): boolean {
    const query = (this.activeFilters?.q || "").trim();
    if (!this.searchFocused || query.length < 2) return false;
    return this.isSuggestionLoading || this.suggestions.length > 0;
  }

  resetAll() {
    this.filterChange.emit({
      q: undefined,
      genre: undefined,
      year: undefined,
      quality: undefined,
      sortBy: "latest",
    });
    this.closeSuggestions();
  }

  hasActiveFilters(): boolean {
    const { genre, year, quality, q } = this.activeFilters;
    return !!(genre?.length || year || quality || q);
  }

  @HostListener("document:click", ["$event"])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-movie-search]")) return;
    this.closeSuggestions();
  }

  ngOnDestroy(): void {
    if (this.queryDebounce) clearTimeout(this.queryDebounce);
    if (this.suggestionDebounce) clearTimeout(this.suggestionDebounce);
    this.cancelSuggestionRequest();
  }

  private scheduleSuggestions(rawQuery: string) {
    if (this.suggestionDebounce) clearTimeout(this.suggestionDebounce);
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

    this.suggestionSub = this.moviesApi
      .getMovieSuggestions(query, 6)
      .subscribe({
        next: (response) => {
          if (token !== this.latestSuggestionToken) return;
          this.suggestions = (response.data || []).slice(0, 6);
          this.isSuggestionLoading = false;
        },
        error: () => {
          if (token !== this.latestSuggestionToken) return;
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
