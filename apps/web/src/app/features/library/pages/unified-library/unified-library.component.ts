import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LibraryService } from '../../../../core/services/library.service';
import { ProfileQueryService } from '../../../profile/services/profile-query.service';

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
    </div>
  `
})
export class UnifiedLibraryComponent implements OnInit {
  private libraryService = inject(LibraryService);
  private profileService = inject(ProfileQueryService);

  profileQuery = this.profileService.getProfileQuery();

  summary = signal<LibrarySummary | null>(null);
  isLoading = signal<boolean>(true);

  watchlistCount = computed(() => this.profileQuery.data()?.data?.watchlist?.length || 0);

  async ngOnInit() {
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
}
