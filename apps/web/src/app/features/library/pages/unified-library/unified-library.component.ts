import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { LibraryService } from '../../../../core/services/library.service';
import { ProfileQueryService } from '../../../profile/services/profile-query.service';
import { WatchApiService, WatchHistoryItem } from '../../../watch/services/watch-api.service';
import { BookSummary } from '@naijaspride/types';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

type BookProgressResponse = {
  status: string;
  data?: {
    page?: number;
  } | null;
};

interface LibrarySummary {
  bookFavCount: number;
  mangaFavCount: number;
  offlineMangaCount: number;
  offlineBookCount: number;
  chapterWatchCount: number;
}

@Component({
  selector: 'app-unified-library',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="container mx-auto px-4 py-12 text-[var(--text-primary)]">
      <!-- Header -->
      <div class="flex items-center gap-6 mb-12">
        <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-cinema-500 to-cinema-700 flex items-center justify-center text-3xl text-white shadow-lg">
          📚
        </div>
        <div>
          <h1 class="text-3xl font-serif text-[#24181b] dark:text-white">Unified Library</h1>
          <p class="text-[#7b6660] dark:text-gray-400 mt-1">Your personal collection across all media types.</p>
        </div>
      </div>

      <!-- Dashboard Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        <!-- Movie Watchlist -->
        <a routerLink="/profile" [queryParams]="{ tab: 'watchlist' }" class="group block">
          <div class="bg-[#f1e5dd] dark:bg-cinema-800 p-6 rounded-2xl shadow-sm border border-[#e5d2c6] dark:border-cinema-700 transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:border-cinema-400 dark:hover:border-cinema-500">
            <div class="flex items-center justify-between mb-4">
              <div class="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 text-xl">
                🎬
              </div>
              <span class="text-2xl font-bold text-[#24181b] dark:text-white">
                {{ watchlistCount() }}
              </span>
            </div>
            <h3 class="text-lg font-medium text-[#24181b] dark:text-white group-hover:text-cinema-500 transition-colors">Movie Watchlist</h3>
            <p class="text-sm text-[#8a756e] dark:text-gray-400 mt-1">Movies you plan to watch</p>
          </div>
        </a>

        <!-- Favorite Books -->
        <a routerLink="/books" [queryParams]="{ tab: 'favorites' }" class="group block">
          <div class="bg-[#f1e5dd] dark:bg-cinema-800 p-6 rounded-2xl shadow-sm border border-[#e5d2c6] dark:border-cinema-700 transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:border-cinema-400 dark:hover:border-cinema-500">
            <div class="flex items-center justify-between mb-4">
              <div class="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xl">
                📖
              </div>
              <span class="text-2xl font-bold text-[#24181b] dark:text-white">
                @if (isLoading()) {
                  <span class="inline-block w-8 h-8 bg-[#e5d2c6] dark:bg-cinema-700 rounded animate-pulse"></span>
                } @else {
                  {{ summary()?.bookFavCount || 0 }}
                }
              </span>
            </div>
            <h3 class="text-lg font-medium text-[#24181b] dark:text-white group-hover:text-cinema-500 transition-colors">Favorite Books</h3>
            <p class="text-sm text-[#8a756e] dark:text-gray-400 mt-1">Novels and light novels you love</p>
          </div>
        </a>

        <!-- Favorite Manga -->
        <a routerLink="/books/manga" [queryParams]="{ tab: 'favorites' }" class="group block">
          <div class="bg-[#f1e5dd] dark:bg-cinema-800 p-6 rounded-2xl shadow-sm border border-[#e5d2c6] dark:border-cinema-700 transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:border-cinema-400 dark:hover:border-cinema-500">
            <div class="flex items-center justify-between mb-4">
              <div class="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 text-xl">
                🗯️
              </div>
              <span class="text-2xl font-bold text-[#24181b] dark:text-white">
                @if (isLoading()) {
                  <span class="inline-block w-8 h-8 bg-[#e5d2c6] dark:bg-cinema-700 rounded animate-pulse"></span>
                } @else {
                  {{ summary()?.mangaFavCount || 0 }}
                }
              </span>
            </div>
            <h3 class="text-lg font-medium text-[#24181b] dark:text-white group-hover:text-cinema-500 transition-colors">Favorite Manga</h3>
            <p class="text-sm text-[#8a756e] dark:text-gray-400 mt-1">Comics and manga you follow</p>
          </div>
        </a>

        <!-- Offline Downloads -->
        <a routerLink="/downloads" class="group block">
          <div class="bg-[#f1e5dd] dark:bg-cinema-800 p-6 rounded-2xl shadow-sm border border-[#e5d2c6] dark:border-cinema-700 transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:border-cinema-400 dark:hover:border-cinema-500">
            <div class="flex items-center justify-between mb-4">
              <div class="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400 text-xl">
                ⬇️
              </div>
              <span class="text-2xl font-bold text-[#24181b] dark:text-white">
                @if (isLoading()) {
                  <span class="inline-block w-8 h-8 bg-[#e5d2c6] dark:bg-cinema-700 rounded animate-pulse"></span>
                } @else {
                  {{ (summary()?.offlineMangaCount || 0) + (summary()?.offlineBookCount || 0) }}
                }
              </span>
            </div>
            <h3 class="text-lg font-medium text-[#24181b] dark:text-white group-hover:text-cinema-500 transition-colors">Offline Reading</h3>
            <p class="text-sm text-[#8a756e] dark:text-gray-400 mt-1">Downloaded books & manga</p>
          </div>
        </a>

        <!-- Chapter Watches -->
        <a routerLink="/books/manga" [queryParams]="{ tab: 'watches' }" class="group block">
          <div class="bg-[#f1e5dd] dark:bg-cinema-800 p-6 rounded-2xl shadow-sm border border-[#e5d2c6] dark:border-cinema-700 transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:border-cinema-400 dark:hover:border-cinema-500">
            <div class="flex items-center justify-between mb-4">
              <div class="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400 text-xl">
                👀
              </div>
              <span class="text-2xl font-bold text-[#24181b] dark:text-white">
                @if (isLoading()) {
                  <span class="inline-block w-8 h-8 bg-[#e5d2c6] dark:bg-cinema-700 rounded animate-pulse"></span>
                } @else {
                  {{ summary()?.chapterWatchCount || 0 }}
                }
              </span>
            </div>
            <h3 class="text-lg font-medium text-[#24181b] dark:text-white group-hover:text-cinema-500 transition-colors">Chapter Watches</h3>
            <p class="text-sm text-[#8a756e] dark:text-gray-400 mt-1">Tracking new chapter releases</p>
          </div>
        </a>

      </div>

      @if (isLoadingWatchHistory() || continueWatching().length > 0) {
        <section class="mt-12">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-xl font-semibold text-[#24181b] dark:text-white">Continue Watching</h2>
            <a routerLink="/profile" [queryParams]="{ tab: 'history' }" class="text-sm text-cinema-500">View all</a>
          </div>

          @if (isLoadingWatchHistory()) {
            <div class="flex gap-3 overflow-x-auto pb-2">
              @for (i of [1,2,3,4]; track i) {
                <div class="w-36 flex-shrink-0">
                  <div class="aspect-[2/3] animate-pulse rounded-xl bg-[#e5d2c6] dark:bg-cinema-700"></div>
                </div>
              }
            </div>
          } @else {
            <div class="flex gap-3 overflow-x-auto pb-2">
              @for (item of continueWatching(); track item.id) {
                <a [routerLink]="['/watch', item.movie.slug || item.movie.id]" class="group w-36 flex-shrink-0">
                  <div class="relative aspect-[2/3] overflow-hidden rounded-xl bg-[#e5d2c6] dark:bg-cinema-700">
                    <img [src]="item.movie.thumbnailUrl || ''" [alt]="item.movie.title" class="h-full w-full object-cover transition group-hover:scale-105" referrerpolicy="no-referrer">
                    <div class="absolute inset-x-0 bottom-0 h-1 bg-black/55">
                      <div class="h-full bg-cinema-500" [style.width.%]="item.progressPercentage"></div>
                    </div>
                  </div>
                  <p class="mt-2 truncate text-xs font-medium text-[#24181b] dark:text-white">{{ item.movie.title }}</p>
                  <p class="text-[10px] text-[#8a756e] dark:text-gray-400">{{ item.progressPercentage | number:'1.0-0' }}% watched</p>
                </a>
              }
            </div>
          }
        </section>
      }

      @if (isLoadingContinueReading() || continueReadingBooks().length > 0) {
        <section class="mt-10">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-xl font-semibold text-[#24181b] dark:text-white">Continue Reading</h2>
            <a routerLink="/books" class="text-sm text-cinema-500">View books</a>
          </div>

          @if (isLoadingContinueReading()) {
            <div class="flex gap-3 overflow-x-auto pb-2">
              @for (i of [1,2,3,4]; track i) {
                <div class="w-32 flex-shrink-0">
                  <div class="aspect-[2/3] animate-pulse rounded-xl bg-[#e5d2c6] dark:bg-cinema-700"></div>
                </div>
              }
            </div>
          } @else {
            <div class="flex gap-3 overflow-x-auto pb-2">
              @for (book of continueReadingBooks(); track book.id) {
                <a [routerLink]="['/books/novel', book.slug]" class="group w-32 flex-shrink-0">
                  <div class="relative aspect-[2/3] overflow-hidden rounded-xl bg-[#e5d2c6] dark:bg-cinema-700">
                    <img [src]="book.coverUrl || ''" [alt]="book.title" class="h-full w-full object-cover transition group-hover:scale-105" referrerpolicy="no-referrer">
                    @if (getBookProgress(book.slug); as progress) {
                      <div class="absolute inset-x-0 bottom-0 h-1 bg-black/55">
                        <div class="h-full bg-cinema-500" [style.width.%]="progress"></div>
                      </div>
                    }
                  </div>
                  <p class="mt-2 truncate text-xs font-medium text-[#24181b] dark:text-white">{{ book.title }}</p>
                  @if (getBookProgress(book.slug); as progress) {
                    <p class="text-[10px] text-[#8a756e] dark:text-gray-400">{{ progress | number:'1.0-0' }}% read</p>
                  }
                </a>
              }
            </div>
          }
        </section>
      }
    </div>
  `
})
export class UnifiedLibraryComponent implements OnInit {
  private http = inject(HttpClient);
  private libraryService = inject(LibraryService);
  private profileService = inject(ProfileQueryService);
  private watchApi = inject(WatchApiService);

  profileQuery = this.profileService.getProfileQuery();

  summary = signal<LibrarySummary | null>(null);
  isLoading = signal<boolean>(true);
  isLoadingWatchHistory = signal<boolean>(true);
  continueWatching = signal<WatchHistoryItem[]>([]);
  isLoadingContinueReading = signal<boolean>(true);
  continueReadingBooks = signal<BookSummary[]>([]);
  bookProgressBySlug = signal<Record<string, number>>({});

  watchlistCount = computed(() => this.profileQuery.data()?.data?.watchlist?.length || 0);

  async ngOnInit() {
    this.loadContinueWatching();
    this.loadContinueReading();

    try {
      this.isLoading.set(true);
      const data = await this.libraryService.getSummary();
      this.summary.set(data);
    } catch (error) {
      console.error('Failed to load library summary:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  getBookProgress(slug?: string): number | null {
    if (!slug) return null;
    const value = this.bookProgressBySlug()[slug];
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return null;
    return Math.max(0, Math.min(100, value));
  }

  private loadContinueWatching() {
    this.watchApi.getWatchHistory({ page: 1, limit: 12 }).subscribe({
      next: (res) => {
        const items = (res.data || []).filter((item) => item.progressPercentage > 0 && item.progressPercentage < 95);
        this.continueWatching.set(items);
        this.isLoadingWatchHistory.set(false);
      },
      error: () => {
        this.isLoadingWatchHistory.set(false);
      },
    });
  }

  private loadContinueReading() {
    this.http.get<{ success?: boolean; data?: BookSummary[] }>('/api/v1/books', {
      params: { page: '1', limit: '12', kind: 'book' },
    }).subscribe({
      next: (res) => {
        const books = (res.data || []).slice(0, 12);
        this.loadBookProgress(books.map((book) => book.slug), (progressMap) => {
          const filtered = books.filter((book) => {
            const progress = progressMap[book.slug];
            return typeof progress === 'number' && progress > 0;
          });
          this.continueReadingBooks.set(filtered);
          this.isLoadingContinueReading.set(false);
        });
      },
      error: () => {
        this.isLoadingContinueReading.set(false);
      },
    });
  }

  private loadBookProgress(slugs: string[], onDone?: (progressBySlug: Record<string, number>) => void) {
    const uniqueSlugs = Array.from(new Set(slugs.filter(Boolean))).slice(0, 20);
    if (uniqueSlugs.length === 0) {
      onDone?.({});
      return;
    }

    const requests = uniqueSlugs.map((slug) =>
      this.http
        .get<BookProgressResponse>(`/api/v1/books/progress/${encodeURIComponent(slug)}`)
        .pipe(
          map((response) => {
            const page = response?.data?.page ?? 0;
            return { slug, percentage: Math.max(0, Math.min(100, page)) };
          }),
          catchError(() => of({ slug, percentage: 0 })),
        ),
    );

    forkJoin(requests).subscribe((entries) => {
      const next: Record<string, number> = {};
      for (const entry of entries) {
        if (entry.percentage > 0) {
          next[entry.slug] = entry.percentage;
        }
      }

      this.bookProgressBySlug.set(next);
      onDone?.(next);
    });
  }
}
