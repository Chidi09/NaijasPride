import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, Injector, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';

type MangaSummary = {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  status: string | null;
  year: number | null;
  originalLanguage: string | null;
  tags: string[];
  latestChapter: string | null;
};

type MangaFavorite = {
  id: string;
  mangaId: string;
  title: string;
  coverUrl: string | null;
  status: string | null;
  addedAt: string;
};

type ReadingHistory = {
  id: string;
  mangaId: string;
  chapterId: string;
  pageIndex: number;
  totalPages: number;
  isCompleted: boolean;
  lastReadAt: string;
};

type MangaTag = {
  id: string;
  name: string;
  group: string | null;
};

type MangaDiscoverPayload = {
  trending: MangaSummary[];
  recentlyUpdated: MangaSummary[];
  newTitles: MangaSummary[];
};

type MangaSource = {
  id: string;
  displayName: string;
  capabilities: {
    supportsFilters: boolean;
    supportsLanguages: boolean;
    supportsSimilar: boolean;
    supportsDiscover: boolean;
    supportsTags: boolean;
    supportsExternalRedirect: boolean;
    needsAntiBot: boolean;
  };
};

type MangaSourceHealth = {
  sourceId: string;
  displayName: string;
  ok: boolean;
  latencyMs: number;
  message?: string;
  circuitState: 'closed' | 'open' | 'half_open';
  degradationReasons: string[];
};

@Component({
  selector: 'app-manga-library',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTabsModule,
  ],
  template: `
    <div class="container mx-auto px-4 py-10 books-theme">
      <!-- Header -->
      <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <h1 class="text-3xl md:text-4xl font-serif text-[var(--text-primary)]">Manga Library</h1>
          <p class="mt-1 text-sm text-[var(--text-muted)]">Manga, Manhwa and Manhua from multiple sources.</p>
        </div>
        <div class="flex gap-2">
          <a mat-stroked-button color="primary" routerLink="/books/comics">Comics</a>
          <a mat-stroked-button color="primary" routerLink="/books">Back to Hub</a>
        </div>
      </div>

      <!-- Search card — same structure as Comics -->
      <mat-card class="mb-6 p-4" style="background: var(--bg-card); border: 1px solid var(--border-color);">

        <!-- Row 1: pill search + actions -->
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
          <mat-form-field
            appearance="fill"
            floatLabel="never"
            subscriptSizing="dynamic"
            class="np-search-field w-full"
          >
            <span matPrefix class="np-search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="7"></circle>
                <path d="M21 21l-4.3-4.3"></path>
              </svg>
            </span>
            <input
              matInput
              [ngModel]="query()"
              (ngModelChange)="query.set($event)"
              (keyup.enter)="search()"
              aria-label="Search manga"
              placeholder="Search manga, manhwa, manhua…"
            />
          </mat-form-field>
          <button mat-flat-button color="primary" (click)="search()" [disabled]="isLoading()">
            {{ isLoading() ? 'Searching…' : 'Search' }}
          </button>
          <button mat-stroked-button color="primary" type="button" (click)="showFilters.set(!showFilters())">
            {{ showFilters() ? 'Hide filters' : 'Filters' }}
            @if (hasActiveFilters()) { <span class="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--cinema-500)] text-[10px] text-white">!</span> }
          </button>
          @if (hasActiveFilters()) {
            <button mat-stroked-button type="button" (click)="clearFilters()">Clear</button>
          }
        </div>

        <!-- Row 2: source chips -->
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <span class="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Source</span>
          <mat-chip-listbox aria-label="Manga sources">
            @for (source of sources(); track source.id) {
              <mat-chip-option
                [selected]="selectedSource() === source.id"
                [disabled]="isSwitchingSource()"
                (click)="setSource(source.id)"
              >{{ source.displayName }}</mat-chip-option>
            }
          </mat-chip-listbox>
        </div>

        <!-- Row 3: filters (collapsible, no accordion wrapper) -->
        @if (showFilters()) {
          <div class="mt-4 border-t border-[var(--border-color)] pt-4">
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <mat-form-field appearance="fill" floatLabel="never" subscriptSizing="dynamic" class="np-search-field">
                <mat-select [ngModel]="sort()" (ngModelChange)="sort.set($event)" aria-label="Sort">
                  <mat-option value="relevance">Relevance</mat-option>
                  <mat-option value="followedCount">Popularity</mat-option>
                  <mat-option value="latestUploadedChapter">Latest Updates</mat-option>
                  <mat-option value="createdAt">Newest Titles</mat-option>
                  <mat-option value="year">Year</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="fill" floatLabel="never" subscriptSizing="dynamic" class="np-search-field">
                <mat-select [ngModel]="originalLanguage()" (ngModelChange)="originalLanguage.set($event)" aria-label="Language">
                  <mat-option value="">Any language</mat-option>
                  <mat-option value="ja">Japanese (Manga)</mat-option>
                  <mat-option value="ko">Korean (Manhwa)</mat-option>
                  <mat-option value="zh">Chinese (Manhua)</mat-option>
                  <mat-option value="en">English</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="fill" floatLabel="never" subscriptSizing="dynamic" class="np-search-field">
                <mat-select [ngModel]="status()" (ngModelChange)="status.set($event)" aria-label="Status">
                  <mat-option value="">Any status</mat-option>
                  <mat-option value="ongoing">Ongoing</mat-option>
                  <mat-option value="completed">Completed</mat-option>
                  <mat-option value="hiatus">Hiatus</mat-option>
                  <mat-option value="cancelled">Cancelled</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="fill" floatLabel="never" subscriptSizing="dynamic" class="np-search-field">
                <mat-select [ngModel]="demographic()" (ngModelChange)="demographic.set($event)" aria-label="Demographic">
                  <mat-option value="">Any demographic</mat-option>
                  <mat-option value="shounen">Shounen</mat-option>
                  <mat-option value="shoujo">Shoujo</mat-option>
                  <mat-option value="seinen">Seinen</mat-option>
                  <mat-option value="josei">Josei</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="fill" floatLabel="never" subscriptSizing="dynamic" class="np-search-field">
                <mat-select [ngModel]="contentRating()" (ngModelChange)="contentRating.set($event)" aria-label="Content rating">
                  <mat-option value="">Any rating</mat-option>
                  <mat-option value="safe">Safe</mat-option>
                  <mat-option value="suggestive">Suggestive</mat-option>
                  <mat-option value="erotica">Erotica</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="fill" floatLabel="never" subscriptSizing="dynamic" class="np-search-field">
                <input matInput type="number" [ngModel]="year()" (ngModelChange)="year.set($event || null)" placeholder="Year (e.g. 2023)" aria-label="Year" />
              </mat-form-field>
            </div>

            @if (groupedTags().length) {
              <div class="mt-3">
                <p class="mb-2 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Tags</p>
                <div class="max-h-52 overflow-auto rounded-xl border border-[var(--border-color)] p-3" style="background: var(--bg-secondary)">
                  @for (group of groupedTags(); track group.group) {
                    <div class="mb-3">
                      <p class="mb-1 text-[11px] uppercase tracking-wide text-[var(--accent)]">{{ group.group }}</p>
                      <mat-chip-listbox>
                        @for (tag of group.items; track tag.id) {
                          <mat-chip-option [selected]="selectedTagIds().includes(tag.id)" (click)="toggleTag(tag.id)">{{ tag.name }}</mat-chip-option>
                        }
                      </mat-chip-listbox>
                    </div>
                  }
                </div>
              </div>
            }

            <div class="mt-3 flex gap-2">
              <button mat-flat-button color="primary" type="button" (click)="search()">Apply filters</button>
              <button mat-stroked-button type="button" (click)="clearFilters()">Reset</button>
            </div>
          </div>
        }
      </mat-card>

      <!-- Source-switching spinner -->
      @if (isSwitchingSource()) {
        <mat-card style="background: var(--bg-card); border: 1px solid var(--border-color);" class="mb-6 p-8">
          <div class="flex flex-col items-center justify-center gap-3 text-center">
            <mat-progress-spinner diameter="40" mode="indeterminate"></mat-progress-spinner>
            <p class="text-sm text-[var(--text-muted)]">Loading {{ selectedSourceLabel() }}…</p>
          </div>
        </mat-card>
      } @else {
        <mat-tab-group
          [selectedIndex]="activeTab() === 'search' ? 0 : activeTab() === 'favorites' ? 1 : 2"
          (selectedIndexChange)="onTabChange($event)"
        >
          <mat-tab label="Search">
            <div class="pt-6">
              @if (showHome()) {
                <div class="mt-6 space-y-10">
                  @if (isDiscoverLoading()) {
                    <section>
                      <div class="flex items-center justify-between gap-3 mb-3">
                        <h2 class="text-lg font-semibold text-[var(--text-primary)]">Trending now</h2>
                        <span class="text-xs text-[var(--text-muted)]">Loading...</span>
                      </div>
                      <div class="np-cover-grid">
                        @for (i of [1,2,3,4,5,6]; track i) {
                          <mat-card class="np-cover-card animate-pulse">
                            <div class="np-cover-media"></div>
                            <div class="np-cover-body">
                              <div class="h-4 rounded bg-[#e5d2c6] dark:bg-cinema-800"></div>
                              <div class="mt-2 h-3 w-2/3 rounded bg-[#e5d2c6] dark:bg-cinema-800"></div>
                            </div>
                          </mat-card>
                        }
                      </div>
                    </section>
                  } @else {
                    @if (discover(); as d) {
                    @if (d.trending?.length) {
                      <section>
                        <div class="flex items-center justify-between gap-3 mb-3">
                          <h2 class="text-lg font-semibold text-[var(--text-primary)]">Trending now</h2>
                          <span class="text-xs text-[var(--text-muted)]">{{ selectedSourceLabel() }}</span>
                        </div>
                        <div class="np-cover-grid">
                          @for (manga of d.trending; track manga.id) {
                            <mat-card class="np-cover-card">
                              <a [routerLink]="[detailRouteFor(manga.id), toRouteParam(manga.id)]" class="np-cover-link">
                                <div class="np-cover-media">
                                  @if (manga.coverUrl) {
                                    <img [src]="manga.coverUrl" [alt]="manga.title" loading="lazy" decoding="async" referrerpolicy="no-referrer">
                                  } @else {
                                    <div class="absolute inset-0 flex items-center justify-center text-4xl">📘</div>
                                  }
                                </div>
                                <div class="np-cover-body">
                                  <div class="np-cover-title">{{ manga.title }}</div>
                                  <div class="np-cover-meta">
                                    {{ sourceLabel(manga.id) }}
                                    @if (manga.latestChapter) { • Ch. {{ manga.latestChapter }} }
                                  </div>
                                </div>
                              </a>
                            </mat-card>
                          }
                        </div>
                      </section>
                    }

                    @if (d.recentlyUpdated?.length) {
                      <section>
                        <div class="flex items-center justify-between gap-3 mb-3">
                          <h2 class="text-lg font-semibold text-[var(--text-primary)]">Recently updated</h2>
                          <span class="text-xs text-[var(--text-muted)]">Fresh chapters</span>
                        </div>
                        <div class="np-cover-grid">
                          @for (manga of d.recentlyUpdated; track manga.id) {
                            <mat-card class="np-cover-card">
                              <a [routerLink]="[detailRouteFor(manga.id), toRouteParam(manga.id)]" class="np-cover-link">
                                <div class="np-cover-media">
                                  @if (manga.coverUrl) {
                                    <img [src]="manga.coverUrl" [alt]="manga.title" loading="lazy" decoding="async" referrerpolicy="no-referrer">
                                  } @else {
                                    <div class="absolute inset-0 flex items-center justify-center text-4xl">📘</div>
                                  }
                                </div>
                                <div class="np-cover-body">
                                  <div class="np-cover-title">{{ manga.title }}</div>
                                  <div class="np-cover-meta">
                                    @if (manga.latestChapter) { Latest: {{ manga.latestChapter }} • }
                                    {{ sourceLabel(manga.id) }}
                                  </div>
                                </div>
                              </a>
                            </mat-card>
                          }
                        </div>
                      </section>
                    }

                    @if (d.newTitles?.length) {
                      <section>
                        <div class="flex items-center justify-between gap-3 mb-3">
                          <h2 class="text-lg font-semibold text-[var(--text-primary)]">New titles</h2>
                          <span class="text-xs text-[var(--text-muted)]">Discover something new</span>
                        </div>
                        <div class="np-cover-grid">
                          @for (manga of d.newTitles; track manga.id) {
                            <mat-card class="np-cover-card">
                              <a [routerLink]="[detailRouteFor(manga.id), toRouteParam(manga.id)]" class="np-cover-link">
                                <div class="np-cover-media">
                                  @if (manga.coverUrl) {
                                    <img [src]="manga.coverUrl" [alt]="manga.title" loading="lazy" decoding="async" referrerpolicy="no-referrer">
                                  } @else {
                                    <div class="absolute inset-0 flex items-center justify-center text-4xl">📘</div>
                                  }
                                </div>
                                <div class="np-cover-body">
                                  <div class="np-cover-title">{{ manga.title }}</div>
                                  <div class="np-cover-meta">{{ manga.year || 'Unknown year' }} • {{ sourceLabel(manga.id) }}</div>
                                </div>
                              </a>
                            </mat-card>
                          }
                        </div>
                      </section>
                    }

                    @if ((!d.trending?.length) && (!d.recentlyUpdated?.length) && (!d.newTitles?.length)) {
                      <mat-card class="p-6" style="background: var(--bg-card); border: 1px solid var(--border-color);">
                        <p class="text-sm text-[var(--text-muted)]">No discover sections available for this source. Use search to find titles.</p>
                      </mat-card>
                    }
                    } @else {
                      <mat-card class="p-6" style="background: var(--bg-card); border: 1px solid var(--border-color);">
                        <p class="text-sm text-[var(--text-muted)]">Start searching to find manga, or switch sources to explore trending titles.</p>
                      </mat-card>
                    }
                  }
                </div>
              } @else {
                <div class="mt-6">
                  <div class="flex items-center justify-between gap-3 mb-3">
                    <h2 class="text-lg font-semibold text-[var(--text-primary)]">Results</h2>
                    @if (isLoading()) {
                      <span class="text-xs text-[var(--text-muted)]">Searching...</span>
                    }
                  </div>

                  @if (hasSearched() && results().length === 0 && !isLoading()) {
                    <mat-card class="p-6" style="background: var(--bg-card); border: 1px solid var(--border-color);">
                      <p class="text-sm text-[var(--text-muted)]">No manga found. Try a different search or loosen filters.</p>
                    </mat-card>
                  }

                  <div class="np-cover-grid">
                    @for (manga of results(); track manga.id) {
                      <mat-card class="np-cover-card">
                        <a [routerLink]="[detailRouteFor(manga.id), toRouteParam(manga.id)]" class="np-cover-link">
                          <div class="np-cover-media">
                            @if (manga.coverUrl) {
                              <img [src]="manga.coverUrl" [alt]="manga.title" loading="lazy" decoding="async" referrerpolicy="no-referrer">
                            } @else {
                              <div class="absolute inset-0 flex items-center justify-center text-4xl">📘</div>
                            }
                          </div>
                          <div class="np-cover-body">
                            <div class="np-cover-title">{{ manga.title }}</div>
                            <div class="np-cover-meta">{{ manga.year || 'Unknown year' }} • {{ sourceLabel(manga.id) }}</div>
                          </div>
                        </a>

                        <div class="px-3 pb-3">
                          <button mat-stroked-button type="button" (click)="toggleFavorite(manga); $event.stopPropagation()">
                            {{ isFavorite(manga.id) ? '★ Favorited' : '☆ Favorite' }}
                          </button>
                        </div>
                      </mat-card>
                    }
                  </div>
                </div>
              }
            </div>
          </mat-tab>

          <mat-tab label="Favorites">
            <div class="pt-6">
              <div class="mb-3 text-sm text-[var(--text-muted)]">Favorites are saved to your account.</div>
              @if (favorites().length === 0) {
                <mat-card class="p-6" style="background: var(--bg-card); border: 1px solid var(--border-color);">
                  <p class="text-sm text-[var(--text-muted)]">No favorites yet.</p>
                </mat-card>
              }
              <div class="np-cover-grid" *ngIf="favorites().length > 0">
                @for (fav of favorites(); track fav.id) {
                  <mat-card class="np-cover-card">
                    <a [routerLink]="[detailRouteFor(fav.mangaId), toRouteParam(fav.mangaId)]" class="np-cover-link">
                      <div class="np-cover-media">
                        @if (fav.coverUrl) {
                          <img [src]="fav.coverUrl" [alt]="fav.title" loading="lazy" decoding="async" referrerpolicy="no-referrer">
                        } @else {
                          <div class="absolute inset-0 flex items-center justify-center text-4xl">📘</div>
                        }
                      </div>
                      <div class="np-cover-body">
                        <div class="np-cover-title">{{ fav.title }}</div>
                      </div>
                    </a>
                    <div class="px-3 pb-3">
                      <button mat-stroked-button color="warn" type="button" (click)="removeFavorite(fav.mangaId)">Remove</button>
                    </div>
                  </mat-card>
                }
              </div>
            </div>
          </mat-tab>

          <mat-tab label="History">
            <div class="pt-6">
              <div class="flex items-center justify-between gap-3 mb-4">
                <p class="text-sm text-[var(--text-muted)]">Continue where you stopped.</p>
                @if (history().length > 0) {
                  <button mat-stroked-button color="warn" type="button" (click)="clearHistory()">Clear all</button>
                }
              </div>

              @if (history().length === 0) {
                <mat-card style="background: var(--bg-card); border: 1px solid var(--border-color);" class="p-6">
                  <p class="text-sm text-[var(--text-muted)]">No reading history yet.</p>
                </mat-card>
              }

              <div class="space-y-3" *ngIf="history().length > 0">
                @for (item of history(); track item.id) {
                  <mat-card style="background: var(--bg-card); border: 1px solid var(--border-color);" class="p-4">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p class="text-sm text-[var(--text-primary)] font-medium">Chapter {{ item.chapterId.slice(0, 10) }}...</p>
                        <p class="mt-1 text-xs text-[var(--text-muted)]">Page {{ item.pageIndex + 1 }} / {{ item.totalPages }}</p>
                      </div>
                      <div class="flex items-center gap-2">
                        <a
                          mat-flat-button
                          color="primary"
                          [routerLink]="[readerRouteFor(item.chapterId), toRouteParam(item.chapterId)]"
                          [queryParams]="{ mangaId: item.mangaId }"
                        >Continue</a>
                        <button mat-stroked-button color="warn" type="button" (click)="removeHistoryEntry(item.chapterId)">Delete</button>
                      </div>
                    </div>
                  </mat-card>
                }
              </div>
            </div>
          </mat-tab>
        </mat-tab-group>
      }
    </div>
  `,
})
export class MangaLibraryComponent implements OnInit {
  private http = inject(HttpClient);
  private injector = inject(Injector);

  activeTab = signal<'search' | 'favorites' | 'history'>('search');
  query = signal('');
  isLoading = signal(false);
  hasSearched = signal(false);
  isDiscoverLoading = signal(false);
  isSwitchingSource = signal(false);
  showFilters = signal(false);

  results = signal<MangaSummary[]>([]);
  discover = signal<MangaDiscoverPayload | null>(null);
  sources = signal<MangaSource[]>([]);
  sourceHealth = signal<MangaSourceHealth[]>([]);
  selectedSource = signal('weebcentral');
  favorites = signal<MangaFavorite[]>([]);
  favoriteIds = signal<Set<string>>(new Set());
  history = signal<ReadingHistory[]>([]);
  tags = signal<MangaTag[]>([]);
  groupedTags = computed(() => {
    const grouped = new Map<string, MangaTag[]>();
    for (const tag of this.tags()) {
      const key = tag.group || 'other';
      const list = grouped.get(key) || [];
      list.push(tag);
      grouped.set(key, list);
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([group, items]) => ({
        group,
        items: items.sort((x, y) => x.name.localeCompare(y.name)),
      }));
  });

  selectedTagIds = signal<string[]>([]);
  status = signal('');
  originalLanguage = signal('');
  contentRating = signal('');
  demographic = signal('');
  sort = signal<'relevance' | 'latestUploadedChapter' | 'followedCount' | 'createdAt' | 'year'>('relevance');
  year = signal<number | null>(null);

  hasActiveFilters = computed(() => {
    return (
      this.selectedTagIds().length > 0 ||
      !!this.status() ||
      !!this.originalLanguage() ||
      !!this.contentRating() ||
      !!this.demographic() ||
      !!this.year() ||
      this.sort() !== 'relevance'
    );
  });

  showHome = computed(() => !this.query().trim() && !this.hasActiveFilters());

  ngOnInit() {
    // NOTE: `effect()` must run in an injection context OR receive an explicit injector.
    // In production builds this page can throw NG0203 without the injector option.
    effect(
      () => {
        if (this.showHome()) {
          this.hasSearched.set(false);
        }
      },
      { injector: this.injector, allowSignalWrites: true }
    );

    const savedSource = localStorage.getItem('np_manga_source');
    if (savedSource) {
      this.selectedSource.set(savedSource);
    }

    if (this.isAuthenticated()) {
      this.loadFavorites();
    }
    this.loadSources();
  }

  selectedSourceLabel() {
    return this.sources().find((source) => source.id === this.selectedSource())?.displayName || this.selectedSource();
  }

  onTabChange(index: number) {
    if (index === 0) {
      this.activeTab.set('search');
      return;
    }
    if (index === 1) {
      this.activeTab.set('favorites');
      this.loadFavorites();
      return;
    }
    this.activeTab.set('history');
    this.loadHistory();
  }

  private isAuthenticated() {
    return !!localStorage.getItem('token');
  }

  private buildSearchQuery() {
    const params = new URLSearchParams();
    const q = this.query().trim();
    if (q) params.append('q', q);
    params.append('sort', this.sort());
    if (this.year()) params.append('year', String(this.year()));
    if (this.status()) params.append('status', this.status());
    if (this.originalLanguage()) params.append('originalLanguage', this.originalLanguage());
    if (this.contentRating()) params.append('contentRating', this.contentRating());
    if (this.demographic()) params.append('demographic', this.demographic());
    for (const tagId of this.selectedTagIds()) params.append('tags', tagId);
    return params.toString();
  }

  private sourcePath() {
    return `/api/v1/books/manga/source/${encodeURIComponent(this.selectedSource())}`;
  }

  setSource(sourceId: string) {
    if (sourceId === this.selectedSource()) return;
    this.isSwitchingSource.set(true);
    this.selectedSource.set(sourceId);
    localStorage.setItem('np_manga_source', sourceId);
    this.selectedTagIds.set([]);
    
    // Clear current results immediately for better UX
    this.results.set([]);
    this.discover.set(null);
    this.tags.set([]);
    
    // Load new source data
    this.loadDiscover();
    this.loadTags();
    if (!this.showHome()) {
      this.search();
    }
    
    // Turn off switching state after a short delay to show the loading state
    setTimeout(() => {
      this.isSwitchingSource.set(false);
    }, 500);
  }

  sourceLabel(entityId: string) {
    const source = this.extractSource(entityId);
    const matched = this.sources().find((item) => item.id === source);
    return matched?.displayName || source || 'MangaDex';
  }

  toRouteParam(value: string) {
    return value;
  }

  detailRouteFor(entityId: string) {
    return this.extractSource(entityId) === 'readcomicsonline' ? '/books/comics' : '/books/manga';
  }

  readerRouteFor(chapterId: string) {
    return this.extractSource(chapterId) === 'readcomicsonline' ? '/books/comics/read' : '/books/manga/read';
  }

  private extractSource(entityId: string): string {
    const separator = entityId.indexOf(':');
    if (separator <= 0) return 'mangadex';
    return entityId.slice(0, separator);
  }

  private loadSources() {
    this.http.get<{ status: string; data: MangaSource[] }>('/api/v1/books/manga/sources').subscribe({
      next: (response) => {
        const available = response.data || [];
        this.sources.set(available);
        if (!available.find((source) => source.id === this.selectedSource()) && available.length > 0) {
          const preferred = ['weebcentral', 'asura', 'mangadex'];
          const selected = preferred.find((sourceId) => available.some((source) => source.id === sourceId)) || available[0].id;
          this.selectedSource.set(selected);
          localStorage.setItem('np_manga_source', selected);
        }
        this.loadSourceHealth();
        this.loadDiscover();
        this.loadTags();
        if (!this.showHome()) {
          this.search();
        } else {
          this.results.set([]);
        }
      },
      error: () => {
        this.sources.set([{ id: 'mangadex', displayName: 'MangaDex', capabilities: {
          supportsFilters: true,
          supportsLanguages: true,
          supportsSimilar: true,
          supportsDiscover: true,
          supportsTags: true,
          supportsExternalRedirect: true,
          needsAntiBot: false,
        } }]);
        this.loadDiscover();
        this.loadTags();
        if (!this.showHome()) {
          this.search();
        } else {
          this.results.set([]);
        }
      },
    });
  }

  private loadSourceHealth() {
    this.http.get<{ status: string; data: MangaSourceHealth[] }>('/api/v1/books/manga/sources/health').subscribe({
      next: (response) => this.sourceHealth.set(response.data || []),
      error: () => this.sourceHealth.set([]),
    });
  }

  search() {
    if (this.showHome()) {
      this.results.set([]);
      this.isLoading.set(false);
      this.hasSearched.set(false);
      return;
    }

    this.hasSearched.set(true);
    this.isLoading.set(true);
    const query = this.buildSearchQuery();
    this.http
      .get<{ status: string; data: MangaSummary[] }>(`${this.sourcePath()}/search${query ? `?${query}` : ''}`)
      .subscribe({
        next: (response) => {
          this.results.set(response.data);
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
        },
      });
  }

  clearFilters() {
    this.selectedTagIds.set([]);
    this.status.set('');
    this.originalLanguage.set('');
    this.contentRating.set('');
    this.demographic.set('');
    this.sort.set('relevance');
    this.year.set(null);

    if (this.query().trim()) {
      this.search();
    } else {
      this.results.set([]);
      this.hasSearched.set(false);
    }
  }

  toggleTag(tagId: string) {
    this.selectedTagIds.update((items) => items.includes(tagId) ? items.filter((id) => id !== tagId) : [...items, tagId]);
  }

  loadTags() {
    this.http.get<{ status: string; data: MangaTag[] }>(`${this.sourcePath()}/tags`).subscribe({
      next: (response) => {
        this.tags.set(response.data.slice(0, 80));
      },
      error: () => {
        this.tags.set([]);
      },
    });
  }

  loadDiscover() {
    this.isDiscoverLoading.set(true);
    this.http.get<{ status: string; data: MangaDiscoverPayload }>(`${this.sourcePath()}/discover?limit=10`).subscribe({
      next: (response) => {
        this.discover.set(response.data);
        this.isDiscoverLoading.set(false);
      },
      error: () => {
        this.discover.set(null);
        this.isDiscoverLoading.set(false);
      },
    });
  }

  toggleFavorite(manga: MangaSummary) {
    if (!this.isAuthenticated()) {
      return;
    }

    if (this.isFavorite(manga.id)) {
      this.removeFavorite(manga.id);
      return;
    }

    this.http.post('/api/v1/books/manga/favorites', {
      mangaId: manga.id,
      title: manga.title,
      coverUrl: manga.coverUrl,
      status: manga.status || undefined,
    }).subscribe({
      next: () => {
        this.favoriteIds.update((set) => new Set(set).add(manga.id));
        this.loadFavorites();
      },
    });
  }

  removeFavorite(mangaId: string) {
    if (!this.isAuthenticated()) {
      return;
    }

    this.http.delete(`/api/v1/books/manga/favorites/${mangaId}`).subscribe({
      next: () => {
        this.favoriteIds.update((set) => {
          const next = new Set(set);
          next.delete(mangaId);
          return next;
        });
        this.favorites.update((list) => list.filter((item) => item.mangaId !== mangaId));
      },
    });
  }

  loadFavorites() {
    if (!this.isAuthenticated()) {
      this.favorites.set([]);
      this.favoriteIds.set(new Set());
      return;
    }

    this.http.get<{ status: string; data: MangaFavorite[] }>('/api/v1/books/manga/favorites').subscribe({
      next: (response) => {
        this.favorites.set(response.data);
        this.favoriteIds.set(new Set(response.data.map((item) => item.mangaId)));
      },
      error: () => {
        this.favorites.set([]);
      },
    });
  }

  isFavorite(mangaId: string) {
    return this.favoriteIds().has(mangaId);
  }

  loadHistory() {
    if (!this.isAuthenticated()) {
      this.history.set([]);
      return;
    }

    this.http.get<{ status: string; data: ReadingHistory[] }>('/api/v1/books/manga/history?limit=50').subscribe({
      next: (response) => {
        this.history.set(response.data);
      },
    });
  }

  removeHistoryEntry(chapterId: string) {
    if (!this.isAuthenticated()) return;

    this.http.delete(`/api/v1/books/manga/history/${encodeURIComponent(chapterId)}`).subscribe({
      next: () => {
        this.history.update((list) => list.filter((item) => item.chapterId !== chapterId));
      },
    });
  }

  clearHistory() {
    if (!this.isAuthenticated()) return;

    this.http.delete('/api/v1/books/manga/history').subscribe({
      next: () => this.history.set([]),
    });
  }
}
