import { CommonModule, NgOptimizedImage } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
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
};

type MangaChapter = {
  id: string;
  chapter: string | null;
  volume: string | null;
  title: string | null;
  pages: number;
  publishedAt: string | null;
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

type MangaDiscoverPayload = {
  trending: MangaSummary[];
  recentlyUpdated: MangaSummary[];
  newTitles: MangaSummary[];
};

@Component({
  selector: 'app-manga-library',
  standalone: true,
  imports: [CommonModule, RouterLink, NgOptimizedImage, FormsModule],
  template: `
    <div class="container mx-auto px-4 py-10">
      <div class="mb-8 flex items-center justify-between gap-3">
        <div>
          <h1 class="font-['Cinzel'] text-3xl text-white">Manga Library</h1>
          <p class="mt-2 text-sm text-gray-400">Search MangaDex and read instantly with auto reader mode.</p>
        </div>
        <a routerLink="/books" class="rounded border border-[#5f1327] px-4 py-2 text-sm text-[#d6b87a] hover:bg-[#5f1327]/20">Back to Books</a>
      </div>

      <!-- Tab Navigation -->
      <div class="mb-6 flex gap-2 border-b border-[#5f1327]/30">
        <button
          (click)="activeTab.set('search')"
          [class]="activeTab() === 'search' ? 'border-b-2 border-[#800020] text-[#d6b87a]' : 'text-gray-400 hover:text-white'"
          class="px-4 py-2 text-sm font-medium transition"
        >
          Search
        </button>
        <button
          (click)="activeTab.set('favorites'); loadFavorites()"
          [class]="activeTab() === 'favorites' ? 'border-b-2 border-[#800020] text-[#d6b87a]' : 'text-gray-400 hover:text-white'"
          class="px-4 py-2 text-sm font-medium transition"
        >
          Favorites ({{ favorites().length }})
        </button>
        <button
          (click)="activeTab.set('history'); loadHistory()"
          [class]="activeTab() === 'history' ? 'border-b-2 border-[#800020] text-[#d6b87a]' : 'text-gray-400 hover:text-white'"
          class="px-4 py-2 text-sm font-medium transition"
        >
          History
        </button>
      </div>

      <!-- Search Tab -->
      @if (activeTab() === 'search') {
        <div class="mb-8 rounded-xl border border-[#5f1327]/50 bg-[#120a0d]/70 p-4">
          <div class="flex flex-col gap-3 sm:flex-row">
              <input
                [(ngModel)]="query"
                (keyup.enter)="search()"
                type="text"
                placeholder="Search manga e.g. Solo Leveling, One Piece (leave blank for featured)"
                class="w-full rounded-lg border border-[#5f1327] bg-[#1b1014] px-4 py-3 text-[#f7eee7] placeholder-[#a88a78] outline-none focus:border-[#800020]"
              >
              <button
                (click)="search()"
                [disabled]="isLoading()"
                class="rounded-lg bg-[#800020] px-5 py-3 text-sm font-semibold text-white hover:bg-[#660019] disabled:opacity-50"
              >
              {{ isLoading() ? 'Searching...' : 'Search' }}
            </button>
          </div>
        </div>

        @if (isDiscoverLoading()) {
          <div class="mb-6 text-sm text-gray-400">Loading trending manga...</div>
        }

        @if (discover(); as discover) {
          <section class="mb-8 space-y-6">
            <div>
              <div class="mb-3 flex items-center justify-between">
                <h2 class="text-base font-semibold text-[#d6b87a]">Trending Now</h2>
                <button (click)="query.set(''); search()" class="text-xs text-[#d6b87a] hover:text-white">Use as main results</button>
              </div>
              <div class="grid grid-cols-2 gap-4 md:grid-cols-5">
                @for (manga of discover.trending; track manga.id) {
                  <button type="button" (click)="selectManga(manga)" class="overflow-hidden rounded border border-[#5f1327]/30 bg-[#120a0d] text-left hover:border-[#800020]">
                    <div class="relative aspect-[3/4]">
                      @if (manga.coverUrl) {
                        <img [ngSrc]="manga.coverUrl" [alt]="manga.title" fill sizes="180px" class="object-cover">
                      } @else {
                        <div class="flex h-full items-center justify-center bg-zinc-800 text-3xl">📘</div>
                      }
                    </div>
                    <p class="line-clamp-2 p-2 text-xs font-medium text-white">{{ manga.title }}</p>
                  </button>
                }
              </div>
            </div>

            <div class="grid gap-6 md:grid-cols-2">
              <div>
                <h3 class="mb-3 text-sm font-semibold text-[#d6b87a]">Recently Updated</h3>
                <div class="space-y-2">
                  @for (manga of discover.recentlyUpdated.slice(0, 6); track manga.id) {
                    <button type="button" (click)="selectManga(manga)" class="block w-full rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-left text-sm text-gray-200 hover:border-[#800020]">
                      {{ manga.title }}
                    </button>
                  }
                </div>
              </div>
              <div>
                <h3 class="mb-3 text-sm font-semibold text-[#d6b87a]">Fresh Titles</h3>
                <div class="space-y-2">
                  @for (manga of discover.newTitles.slice(0, 6); track manga.id) {
                    <button type="button" (click)="selectManga(manga)" class="block w-full rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-left text-sm text-gray-200 hover:border-[#800020]">
                      {{ manga.title }}
                    </button>
                  }
                </div>
              </div>
            </div>
          </section>
        }

        <div class="grid grid-cols-1 gap-8 lg:grid-cols-[1.2fr_1fr]">
          <section>
            <h2 class="mb-4 text-lg font-semibold text-[#d6b87a]">Results</h2>
            @if (results().length === 0 && !isLoading()) {
              <div class="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-gray-400">No manga found. Try another keyword.</div>
            }
            <div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              @for (manga of results(); track manga.id) {
                <div
                  class="group relative overflow-hidden rounded-lg border border-[#5f1327]/30 bg-[#120a0d] text-left transition hover:border-[#800020]"
                >
                  <button type="button" (click)="selectManga(manga)" class="w-full text-left">
                    <div class="relative aspect-[3/4]">
                      @if (manga.coverUrl) {
                        <img [ngSrc]="manga.coverUrl" [alt]="manga.title" fill sizes="200px" class="object-cover">
                      } @else {
                        <div class="flex h-full items-center justify-center bg-zinc-800 text-4xl">📘</div>
                      }
                    </div>
                    <div class="p-3">
                      <p class="line-clamp-2 text-sm font-semibold text-white">{{ manga.title }}</p>
                      <p class="mt-1 text-xs text-gray-400">{{ manga.year || 'Unknown year' }}</p>
                    </div>
                  </button>

                  <!-- Favorite Button -->
                  <button
                    type="button"
                    (click)="toggleFavorite(manga); $event.stopPropagation()"
                    class="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white hover:bg-[#800020]"
                    [title]="isFavorite(manga.id) ? 'Remove from favorites' : 'Add to favorites'"
                  >
                    @if (isFavorite(manga.id)) {
                      <span class="text-yellow-400">★</span>
                    } @else {
                      <span>☆</span>
                    }
                  </button>
                </div>
              }
            </div>
          </section>

          <section>
            <h2 class="mb-4 text-lg font-semibold text-[#d6b87a]">Chapters</h2>
            @if (!selectedManga()) {
              <div class="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-gray-400">Select a manga to load chapters.</div>
            }
            @if (selectedManga(); as manga) {
              <div class="mb-4 rounded-lg border border-[#5f1327]/40 bg-[#120a0d]/80 p-4">
                <div class="flex items-start justify-between">
                  <div>
                    <h3 class="font-semibold text-white">{{ manga.title }}</h3>
                    <p class="mt-2 line-clamp-4 text-xs text-gray-400">{{ manga.description || 'No description available.' }}</p>
                  </div>
                  <button
                    (click)="toggleFavorite(manga)"
                    class="rounded border border-[#5f1327] px-3 py-1 text-sm"
                    [class.bg-[#800020]]="isFavorite(manga.id)"
                    [class.text-white]="isFavorite(manga.id)"
                    [class.text-gray-400]="!isFavorite(manga.id)"
                  >
                    {{ isFavorite(manga.id) ? '★ Favorited' : '☆ Favorite' }}
                  </button>
                </div>
              </div>

              <div class="max-h-[60vh] space-y-2 overflow-auto pr-1">
                @for (chapter of chapters(); track chapter.id) {
                  <a
                    [routerLink]="['/books/manga/read', chapter.id]"
                    [queryParams]="{ title: manga.title, chapter: chapter.chapter || '', mangaId: manga.id }"
                    class="block rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm text-gray-200 hover:border-[#800020] hover:bg-[#800020]/10"
                  >
                    <div class="font-medium"
                    >Chapter {{ chapter.chapter || '?' }} <span class="text-gray-400">{{ chapter.title || '' }}</span></div>
                    <div class="mt-1 text-xs text-gray-500">{{ chapter.pages }} pages</div>
                  </a>
                }
              </div>
            }
          </section>
        </div>
      }

      <!-- Favorites Tab -->
      @if (activeTab() === 'favorites') {
        <section>
          <h2 class="mb-4 text-lg font-semibold text-[#d6b87a]">Your Favorites</h2>
          @if (favorites().length === 0) {
            <div class="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-gray-400">No favorites yet. Search and add manga to your favorites.</div>
          }
          <div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            @for (fav of favorites(); track fav.id) {
              <div class="overflow-hidden rounded-lg border border-[#5f1327]/30 bg-[#120a0d]">
                <div class="relative aspect-[3/4]">
                  @if (fav.coverUrl) {
                    <img [ngSrc]="fav.coverUrl" [alt]="fav.title" fill sizes="200px" class="object-cover">
                  } @else {
                    <div class="flex h-full items-center justify-center bg-zinc-800 text-4xl">📘</div>
                  }
                </div>
                <div class="p-3">
                  <p class="line-clamp-2 text-sm font-semibold text-white">{{ fav.title }}</p>
                  <div class="mt-2 flex gap-2">
                    <button
                      (click)="loadFavoriteChapters(fav)"
                      class="flex-1 rounded bg-[#800020] px-3 py-1 text-xs text-white hover:bg-[#660019]"
                    >
                      Chapters
                    </button>
                    <button
                      (click)="removeFavorite(fav.mangaId)"
                      class="rounded border border-red-900/50 px-3 py-1 text-xs text-red-400 hover:bg-red-900/20"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            }
          </div>
        </section>
      }

      <!-- History Tab -->
      @if (activeTab() === 'history') {
        <section>
          <h2 class="mb-4 text-lg font-semibold text-[#d6b87a]">Reading History</h2>
          @if (history().length === 0) {
            <div class="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-gray-400">No reading history yet. Start reading to track your progress.</div>
          }
          <div class="space-y-3">
            @for (item of history(); track item.id) {
              <div class="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
                <div>
                  <p class="text-sm text-white">Chapter ID: {{ item.chapterId.slice(0, 8) }}...</p>
                  <p class="mt-1 text-xs text-gray-400">Page {{ item.pageIndex + 1 }} / {{ item.totalPages }}</p>
                  @if (item.isCompleted) {
                    <span class="mt-1 inline-block rounded bg-green-900/50 px-2 py-0.5 text-xs text-green-400">Completed</span>
                  }
                </div>
                <div class="text-right">
                  <p class="text-xs text-gray-500">{{ item.lastReadAt | date: 'short' }}</p>
                  <a
                    [routerLink]="['/books/manga/read', item.chapterId]"
                    [queryParams]="{ mangaId: item.mangaId }"
                    class="mt-2 inline-block rounded bg-[#800020] px-3 py-1 text-xs text-white hover:bg-[#660019]"
                  >
                    Continue
                  </a>
                </div>
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

  // Search tab
  query = signal('');
  isLoading = signal(false);
  results = signal<MangaSummary[]>([]);
  selectedManga = signal<MangaSummary | null>(null);
  chapters = signal<MangaChapter[]>([]);
  favoriteIds = signal<Set<string>>(new Set());
  discover = signal<MangaDiscoverPayload | null>(null);
  isDiscoverLoading = signal(false);

  // Favorites tab
  favorites = signal<MangaFavorite[]>([]);

  // History tab
  history = signal<ReadingHistory[]>([]);

  ngOnInit() {
    this.loadFavorites();
    this.loadDiscover();
    this.search();
  }

  loadDiscover() {
    this.isDiscoverLoading.set(true);
    this.http
      .get<{ status: string; data: MangaDiscoverPayload }>('/api/v1/books/manga/discover?limit=10')
      .subscribe({
        next: (response) => {
          this.discover.set(response.data);
          this.isDiscoverLoading.set(false);
        },
        error: (error) => {
          console.error('Failed to load discover manga:', error);
          this.isDiscoverLoading.set(false);
        },
      });
  }

  search() {
    const q = this.query().trim();

    this.isLoading.set(true);
    this.http
      .get<{ status: string; data: MangaSummary[] }>(`/api/v1/books/manga/search${q ? `?q=${encodeURIComponent(q)}` : ''}`)
      .subscribe({
        next: (response) => {
          this.results.set(response.data);
          this.isLoading.set(false);
          this.selectedManga.set(null);
          this.chapters.set([]);
          this.updateFavoriteStatus();
        },
        error: (error) => {
          console.error('Failed to search manga:', error);
          this.isLoading.set(false);
        },
      });
  }

  selectManga(manga: MangaSummary) {
    this.selectedManga.set(manga);
    this.chapters.set([]);
    this.http
      .get<{ status: string; data: MangaChapter[] }>(`/api/v1/books/manga/${manga.id}/chapters`)
      .subscribe({
        next: (response) => this.chapters.set(response.data),
        error: (error) => console.error('Failed to load chapters:', error),
      });
  }

  // Favorites
  toggleFavorite(manga: MangaSummary) {
    if (this.isFavorite(manga.id)) {
      this.removeFavorite(manga.id);
    } else {
      this.addFavorite(manga);
    }
  }

  addFavorite(manga: MangaSummary) {
    this.http
      .post<{ status: string; data: MangaFavorite }>('/api/v1/books/manga/favorites', {
        mangaId: manga.id,
        title: manga.title,
        coverUrl: manga.coverUrl,
        status: manga.status || undefined,
      })
      .subscribe({
        next: () => {
          this.favoriteIds.update((set) => new Set(set).add(manga.id));
          this.loadFavorites();
        },
        error: (error) => console.error('Failed to add favorite:', error),
      });
  }

  removeFavorite(mangaId: string) {
    this.http.delete(`/api/v1/books/manga/favorites/${mangaId}`).subscribe({
      next: () => {
        this.favoriteIds.update((set) => {
          const newSet = new Set(set);
          newSet.delete(mangaId);
          return newSet;
        });
        this.favorites.update((list) => list.filter((f) => f.mangaId !== mangaId));
      },
      error: (error) => console.error('Failed to remove favorite:', error),
    });
  }

  loadFavorites() {
    this.http.get<{ status: string; data: MangaFavorite[] }>('/api/v1/books/manga/favorites').subscribe({
      next: (response) => {
        this.favorites.set(response.data);
        this.favoriteIds.set(new Set(response.data.map((f) => f.mangaId)));
      },
      error: (error) => console.error('Failed to load favorites:', error),
    });
  }

  loadFavoriteChapters(fav: MangaFavorite) {
    const manga: MangaSummary = {
      id: fav.mangaId,
      title: fav.title,
      description: '',
      coverUrl: fav.coverUrl,
      status: fav.status,
      year: null,
      originalLanguage: null,
      tags: [],
    };
    this.selectManga(manga);
    this.activeTab.set('search');
  }

  isFavorite(mangaId: string): boolean {
    return this.favoriteIds().has(mangaId);
  }

  updateFavoriteStatus() {
    // Check each manga in results if it's favorited
    this.results().forEach((manga) => {
      this.http.get<{ status: string; data: { isFavorite: boolean } }>(`/api/v1/books/manga/favorites/${manga.id}/check`).subscribe({
        next: (response) => {
          if (response.data.isFavorite) {
            this.favoriteIds.update((set) => new Set(set).add(manga.id));
          }
        },
      });
    });
  }

  // History
  loadHistory() {
    this.http
      .get<{ status: string; data: ReadingHistory[] }>('/api/v1/books/manga/history?limit=50')
      .subscribe({
        next: (response) => {
          this.history.set(response.data);
        },
        error: (error) => console.error('Failed to load history:', error),
      });
  }
}
