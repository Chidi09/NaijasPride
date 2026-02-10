import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

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
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="container mx-auto px-4 py-10">
      <div class="mb-8 flex items-center justify-between gap-3">
        <div>
          <h1 class="font-['Cinzel'] text-3xl text-white">Manga Library</h1>
          <p class="mt-2 text-sm text-gray-400">Search Manga, Manhwa and Manhua with advanced filters.</p>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            @for (source of sources(); track source.id) {
              <button
                type="button"
                (click)="setSource(source.id)"
                class="rounded border px-2 py-1 text-[11px]"
                [class.border-[#800020]]="selectedSource() === source.id"
                [class.text-[#d6b87a]]="selectedSource() === source.id"
                [class.border-zinc-700]="selectedSource() !== source.id"
                [class.text-gray-300]="selectedSource() !== source.id"
              >{{ source.displayName }}</button>
            }
          </div>
          <div class="mt-2 flex flex-wrap gap-2">
            @for (health of sourceHealth(); track health.sourceId) {
              <span class="rounded border px-2 py-1 text-[11px]"
                [class.border-emerald-700]="health.ok && health.circuitState === 'closed'"
                [class.text-emerald-300]="health.ok && health.circuitState === 'closed'"
                [class.border-amber-700]="health.circuitState === 'half_open'"
                [class.text-amber-300]="health.circuitState === 'half_open'"
                [class.border-red-700]="!health.ok || health.circuitState === 'open'"
                [class.text-red-300]="!health.ok || health.circuitState === 'open'"
                [attr.title]="health.degradationReasons.join(', ')"
              >{{ health.displayName }} {{ health.latencyMs }}ms</span>
            }
          </div>
        </div>
        <a routerLink="/books" class="rounded border border-[#5f1327] px-4 py-2 text-sm text-[#d6b87a] hover:bg-[#5f1327]/20">Back to Books</a>
      </div>

      <div class="mb-6 flex gap-2 border-b border-[#5f1327]/30">
        <button
          (click)="activeTab.set('search')"
          [class]="activeTab() === 'search' ? 'border-b-2 border-[#800020] text-[#d6b87a]' : 'text-gray-400 hover:text-white'"
          class="px-4 py-2 text-sm font-medium transition"
        >Search</button>
        <button
          (click)="activeTab.set('favorites'); loadFavorites()"
          [class]="activeTab() === 'favorites' ? 'border-b-2 border-[#800020] text-[#d6b87a]' : 'text-gray-400 hover:text-white'"
          class="px-4 py-2 text-sm font-medium transition"
        >Favorites ({{ favorites().length }})</button>
        <button
          (click)="activeTab.set('history'); loadHistory()"
          [class]="activeTab() === 'history' ? 'border-b-2 border-[#800020] text-[#d6b87a]' : 'text-gray-400 hover:text-white'"
          class="px-4 py-2 text-sm font-medium transition"
        >History</button>
      </div>

      @if (activeTab() === 'search') {
        <div class="mb-8 rounded-xl border border-[#5f1327]/50 bg-[#120a0d]/70 p-4">
          <div class="mb-3 flex flex-col gap-3 sm:flex-row">
            <input
              [ngModel]="query()"
              (ngModelChange)="query.set($event)"
              (keyup.enter)="search()"
              type="text"
              placeholder="Search by title..."
              class="w-full rounded-lg border border-[#5f1327] bg-[#1b1014] px-4 py-3 text-[#f7eee7] placeholder-[#a88a78] outline-none focus:border-[#800020]"
            >
            <button
              (click)="search()"
              [disabled]="isLoading()"
              class="rounded-lg bg-[#800020] px-5 py-3 text-sm font-semibold text-white hover:bg-[#660019] disabled:opacity-50"
            >{{ isLoading() ? 'Searching...' : 'Search' }}</button>
          </div>

          <button class="text-xs text-[#d6b87a] hover:text-white" (click)="showFilters.set(!showFilters())">
            {{ showFilters() ? 'Hide Filters' : 'Show Filters' }}
          </button>

          @if (showFilters()) {
            <div class="mt-4 grid gap-4 rounded-lg border border-[#5f1327]/40 bg-black/20 p-4 md:grid-cols-2 lg:grid-cols-3">
              <label class="text-xs text-gray-300">
                <span class="mb-1 block">Sort</span>
                <select [ngModel]="sort()" (ngModelChange)="sort.set($event)" class="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white">
                  <option value="relevance">Relevance</option>
                  <option value="followedCount">Popularity</option>
                  <option value="latestUploadedChapter">Latest Updates</option>
                  <option value="createdAt">Newest Titles</option>
                  <option value="year">Year</option>
                </select>
              </label>

              <label class="text-xs text-gray-300">
                <span class="mb-1 block">Year</span>
                <input type="number" [ngModel]="year()" (ngModelChange)="year.set($event || null)" class="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white">
              </label>

              <label class="text-xs text-gray-300">
                <span class="mb-1 block">Language</span>
                <select [ngModel]="originalLanguage()" (ngModelChange)="originalLanguage.set($event)" class="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white">
                  <option value="">Any</option>
                  <option value="ja">Japanese (Manga)</option>
                  <option value="ko">Korean (Manhwa)</option>
                  <option value="zh">Chinese (Manhua)</option>
                  <option value="en">English</option>
                </select>
              </label>

              <label class="text-xs text-gray-300">
                <span class="mb-1 block">Status</span>
                <select [ngModel]="status()" (ngModelChange)="status.set($event)" class="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white">
                  <option value="">Any</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                  <option value="hiatus">Hiatus</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>

              <label class="text-xs text-gray-300">
                <span class="mb-1 block">Demographic</span>
                <select [ngModel]="demographic()" (ngModelChange)="demographic.set($event)" class="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white">
                  <option value="">Any</option>
                  <option value="shounen">Shounen</option>
                  <option value="shoujo">Shoujo</option>
                  <option value="seinen">Seinen</option>
                  <option value="josei">Josei</option>
                </select>
              </label>

              <label class="text-xs text-gray-300">
                <span class="mb-1 block">Content Rating</span>
                <select [ngModel]="contentRating()" (ngModelChange)="contentRating.set($event)" class="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white">
                  <option value="">Any</option>
                  <option value="safe">Safe</option>
                  <option value="suggestive">Suggestive</option>
                  <option value="erotica">Erotica</option>
                </select>
              </label>

              <div class="md:col-span-2 lg:col-span-3">
                <p class="mb-2 text-xs text-gray-300">Tags</p>
                <div class="max-h-56 space-y-3 overflow-auto rounded border border-zinc-700 bg-zinc-900 p-3">
                  @for (group of groupedTags(); track group.group) {
                    <div>
                      <p class="mb-2 text-[11px] uppercase tracking-wide text-[#d6b87a]">{{ group.group }}</p>
                      <div class="flex flex-wrap gap-2">
                        @for (tag of group.items; track tag.id) {
                          <button
                            type="button"
                            (click)="toggleTag(tag.id)"
                            class="rounded border px-2 py-1 text-xs"
                            [class.border-[#800020]]="selectedTagIds().includes(tag.id)"
                            [class.text-[#d6b87a]]="selectedTagIds().includes(tag.id)"
                            [class.border-zinc-700]="!selectedTagIds().includes(tag.id)"
                            [class.text-gray-300]="!selectedTagIds().includes(tag.id)"
                          >{{ tag.name }}</button>
                        }
                      </div>
                    </div>
                  }
                </div>
              </div>

              <div class="md:col-span-2 lg:col-span-3 flex gap-2">
                <button (click)="search()" class="rounded bg-[#800020] px-4 py-2 text-xs text-white hover:bg-[#660019]">Apply Filters</button>
                <button (click)="clearFilters()" class="rounded border border-zinc-700 px-4 py-2 text-xs text-gray-200 hover:bg-zinc-800">Clear</button>
              </div>
            </div>
          }
        </div>

        @if (isDiscoverLoading()) {
          <div class="mb-6 text-sm text-gray-400">Loading discover sections...</div>
        }

        @if (discover(); as discover) {
          <section class="mb-8 space-y-6">
            <div>
              <h2 class="mb-3 text-base font-semibold text-[#d6b87a]">Trending Now</h2>
              <div class="grid grid-cols-2 gap-4 md:grid-cols-5">
                @for (manga of discover.trending; track manga.id) {
                  <a [routerLink]="['/books/manga', toRouteParam(manga.id)]" class="overflow-hidden rounded border border-[#5f1327]/30 bg-[#120a0d] text-left hover:border-[#800020]">
                    <div class="relative aspect-[3/4]">
                      @if (manga.coverUrl) {
                        <img [src]="manga.coverUrl" [alt]="manga.title" class="absolute inset-0 h-full w-full object-cover">
                      } @else {
                        <div class="flex h-full items-center justify-center bg-zinc-800 text-3xl">📘</div>
                      }
                    </div>
                    <p class="line-clamp-2 p-2 text-xs font-medium text-white">{{ manga.title }}</p>
                    <p class="px-2 pb-2 text-[11px] text-gray-400">{{ sourceLabel(manga.id) }}</p>
                  </a>
                }
              </div>
            </div>

            <div class="grid gap-6 md:grid-cols-2">
              <div>
                <h3 class="mb-3 text-sm font-semibold text-[#d6b87a]">Recently Updated</h3>
                <div class="space-y-2">
                  @for (manga of discover.recentlyUpdated.slice(0, 6); track manga.id) {
                    <a [routerLink]="['/books/manga', toRouteParam(manga.id)]" class="block w-full rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-left text-sm text-gray-200 hover:border-[#800020]">
                      <span>{{ manga.title }}</span>
                      <span class="ml-2 text-[11px] text-gray-500">{{ sourceLabel(manga.id) }}</span>
                      @if (manga.latestChapter) {
                        <span class="ml-2 text-xs text-[#d6b87a]">Ch. {{ manga.latestChapter }}</span>
                      }
                    </a>
                  }
                </div>
              </div>
              <div>
                <h3 class="mb-3 text-sm font-semibold text-[#d6b87a]">Fresh Titles</h3>
                <div class="space-y-2">
                  @for (manga of discover.newTitles.slice(0, 6); track manga.id) {
                    <a [routerLink]="['/books/manga', toRouteParam(manga.id)]" class="block w-full rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-left text-sm text-gray-200 hover:border-[#800020]">
                      <span>{{ manga.title }}</span>
                      <span class="ml-2 text-[11px] text-gray-500">{{ sourceLabel(manga.id) }}</span>
                      @if (manga.latestChapter) {
                        <span class="ml-2 text-xs text-[#d6b87a]">Ch. {{ manga.latestChapter }}</span>
                      }
                    </a>
                  }
                </div>
              </div>
            </div>
          </section>
        }

        <section>
          <h2 class="mb-4 text-lg font-semibold text-[#d6b87a]">Results</h2>
          @if (results().length === 0 && !isLoading()) {
            <div class="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-gray-400">No manga found.</div>
          }
          <div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            @for (manga of results(); track manga.id) {
              <div class="group relative overflow-hidden rounded-lg border border-[#5f1327]/30 bg-[#120a0d] transition hover:border-[#800020]">
                <a [routerLink]="['/books/manga', toRouteParam(manga.id)]" class="block">
                  <div class="relative aspect-[3/4]">
                    @if (manga.coverUrl) {
                      <img [src]="manga.coverUrl" [alt]="manga.title" class="absolute inset-0 h-full w-full object-cover">
                    } @else {
                      <div class="flex h-full items-center justify-center bg-zinc-800 text-4xl">📘</div>
                    }
                  </div>
                  <div class="p-3">
                    <p class="line-clamp-2 text-sm font-semibold text-white">{{ manga.title }}</p>
                    <p class="mt-1 text-xs text-gray-400">{{ manga.year || 'Unknown year' }}</p>
                    <p class="mt-1 text-[11px] text-gray-500">{{ sourceLabel(manga.id) }}</p>
                  </div>
                </a>

                <button
                  type="button"
                  (click)="toggleFavorite(manga); $event.stopPropagation()"
                  class="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white hover:bg-[#800020]"
                >{{ isFavorite(manga.id) ? '★' : '☆' }}</button>
              </div>
            }
          </div>
        </section>
      }

      @if (activeTab() === 'favorites') {
        <section>
          <h2 class="mb-4 text-lg font-semibold text-[#d6b87a]">Your Favorites</h2>
          @if (favorites().length === 0) {
            <div class="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-gray-400">No favorites yet.</div>
          }
          <div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            @for (fav of favorites(); track fav.id) {
              <div class="overflow-hidden rounded-lg border border-[#5f1327]/30 bg-[#120a0d]">
                <a [routerLink]="['/books/manga', toRouteParam(fav.mangaId)]" class="block">
                  <div class="relative aspect-[3/4]">
                    @if (fav.coverUrl) {
                      <img [src]="fav.coverUrl" [alt]="fav.title" class="absolute inset-0 h-full w-full object-cover">
                    } @else {
                      <div class="flex h-full items-center justify-center bg-zinc-800 text-4xl">📘</div>
                    }
                  </div>
                  <div class="p-3">
                    <p class="line-clamp-2 text-sm font-semibold text-white">{{ fav.title }}</p>
                  </div>
                </a>
                <div class="px-3 pb-3">
                  <button (click)="removeFavorite(fav.mangaId)" class="w-full rounded border border-red-900/50 px-3 py-1 text-xs text-red-400 hover:bg-red-900/20">Remove</button>
                </div>
              </div>
            }
          </div>
        </section>
      }

      @if (activeTab() === 'history') {
        <section>
          <h2 class="mb-4 text-lg font-semibold text-[#d6b87a]">Reading History</h2>
          @if (history().length === 0) {
            <div class="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-gray-400">No reading history yet.</div>
          }
          <div class="space-y-3">
            @for (item of history(); track item.id) {
              <div class="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
                <div>
                  <p class="text-sm text-white">Chapter ID: {{ item.chapterId.slice(0, 8) }}...</p>
                  <p class="mt-1 text-xs text-gray-400">Page {{ item.pageIndex + 1 }} / {{ item.totalPages }}</p>
                </div>
                <a
                  [routerLink]="['/books/manga/read', toRouteParam(item.chapterId)]"
                  [queryParams]="{ mangaId: item.mangaId }"
                  class="rounded bg-[#800020] px-3 py-1 text-xs text-white hover:bg-[#660019]"
                >Continue</a>
              </div>
            }
          </div>
        </section>
      }
    </div>
  `,
})
export class MangaLibraryComponent implements OnInit {
  private http = inject(HttpClient);

  activeTab = signal<'search' | 'favorites' | 'history'>('search');
  query = signal('');
  isLoading = signal(false);
  isDiscoverLoading = signal(false);
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

  ngOnInit() {
    const savedSource = localStorage.getItem('np_manga_source');
    if (savedSource) {
      this.selectedSource.set(savedSource);
    }

    if (this.isAuthenticated()) {
      this.loadFavorites();
    }
    this.loadSources();
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
    this.selectedSource.set(sourceId);
    localStorage.setItem('np_manga_source', sourceId);
    this.selectedTagIds.set([]);
    this.loadDiscover();
    this.loadTags();
    this.search();
  }

  sourceLabel(entityId: string) {
    const source = this.extractSource(entityId);
    const matched = this.sources().find((item) => item.id === source);
    return matched?.displayName || source || 'MangaDex';
  }

  toRouteParam(value: string) {
    return encodeURIComponent(value);
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
        this.search();
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
        this.search();
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
    this.search();
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
}
