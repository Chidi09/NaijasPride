import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Book, PaginationMeta } from '@naijaspride/types';
import { PaginatorComponent } from '../../../../shared/components/paginator/paginator.component';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';

type MangaPreview = {
  id: string;
  title: string;
  coverUrl: string | null;
  latestChapter: string | null;
};

type MangaDiscoverPayload = {
  trending: MangaPreview[];
};

@Component({
  selector: 'app-book-list',
  standalone: true,
  imports: [CommonModule, RouterLink, PaginatorComponent, MatButtonModule, MatCardModule],
  template: `
    <div class="container mx-auto px-4 py-12 books-theme">
      <div class="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 class="text-3xl font-serif text-[#24181b] dark:text-white">Library</h1>
          <p class="text-[#8a756e] dark:text-gray-400 mt-2">Discover our collection of Nollywood books and magazines</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <a mat-stroked-button color="primary" routerLink="/books">Hub</a>
          <a mat-stroked-button color="primary" routerLink="/books/comics">Comics</a>
          <a mat-flat-button color="primary" routerLink="/books/manga">Manga</a>
          <a mat-stroked-button color="primary" routerLink="/movies">Movies</a>
        </div>
      </div>

      @if (isLoading()) {
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          @for (i of [1,2,3,4,5,6,7,8,10]; track i) {
            <div class="bg-[#e5d2c6] dark:bg-cinema-800 rounded-sm aspect-[2/3] animate-pulse"></div>
          }
        </div>
      }

      @if (books().length > 0) {
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          @for (book of books(); track book.id) {
            <a [routerLink]="['/books', book.slug]" class="block">
              <mat-card class="h-full overflow-hidden hover:shadow-md transition-shadow" style="background: var(--bg-card); border: 1px solid var(--border-color);">
                <div class="aspect-[2/3] relative bg-[var(--bg-elevated)]">
                  @if (book.coverUrl) {
                    <img 
                      [src]="book.coverUrl" 
                      [alt]="book.title"
                      class="absolute inset-0 w-full h-full object-cover"
                      referrerpolicy="no-referrer"
                    >
                  } @else {
                    <div class="w-full h-full flex items-center justify-center">
                      <span class="text-4xl">📚</span>
                    </div>
                  }
                </div>
                <div class="p-4">
                  <h3 class="text-[#24181b] dark:text-white font-medium text-sm line-clamp-2">{{ book.title }}</h3>
                  <p class="text-[#8a756e] dark:text-gray-400 text-xs mt-1">{{ book.author }}</p>
                  @if (book.year) {
                    <p class="text-[#9a857d] dark:text-gray-500 text-xs mt-1">{{ book.year }}</p>
                  }
                </div>
              </mat-card>
            </a>
          }
        </div>
        
        @if (meta()) {
          <app-paginator 
            [currentPage]="meta()!.page"
            [totalPages]="meta()!.totalPages"
            (pageChange)="onPageChange($event)"
          />
        }
      }

      @if (!isLoading() && books().length === 0) {
        <div class="text-center py-24 text-[#8a756e] dark:text-gray-400">
          <span class="text-6xl">📚</span>
          <p class="text-lg font-serif text-[#24181b] dark:text-white mt-4">No books available yet.</p>
          <p class="text-[#9a857d] dark:text-gray-500">Check back soon for our growing library.</p>
        </div>

        @if (isTrendingLoading()) {
          <p class="text-sm text-[#9a857d] dark:text-gray-500 text-center -mt-10 mb-8">Loading trending manga...</p>
        }

        @if (trendingManga().length > 0) {
          <section class="mt-6">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-xl font-serif text-[#24181b] dark:text-white">Trending Manga Right Now</h2>
              <a routerLink="/books/manga" class="text-sm text-[#d6b87a] hover:text-white">Open Manga Library</a>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
              @for (manga of trendingManga(); track manga.id) {
                <a [routerLink]="['/books/manga', toRouteParam(manga.id)]" class="group">
                  <div class="bg-[#f1e5dd] dark:bg-cinema-800 rounded-sm overflow-hidden transition-transform group-hover:scale-105">
                    <div class="aspect-[2/3] relative">
                      @if (manga.coverUrl) {
                        <img
                          [src]="manga.coverUrl"
                          [alt]="manga.title"
                          class="absolute inset-0 w-full h-full object-cover"
                        >
                      } @else {
                        <div class="w-full h-full bg-[#dcc4b8] dark:bg-cinema-700 flex items-center justify-center">
                          <span class="text-4xl">📘</span>
                        </div>
                      }
                    </div>
                    <div class="p-3">
                      <h3 class="text-[#24181b] dark:text-white font-medium text-sm line-clamp-2">{{ manga.title }}</h3>
                      @if (manga.latestChapter) {
                        <p class="text-[#d6b87a] text-xs mt-1">Ch. {{ manga.latestChapter }}</p>
                      }
                    </div>
                  </div>
                </a>
              }
            </div>
          </section>
        }
      }
    </div>
  `
})
export class BookListComponent {
  private http = inject(HttpClient);
  
  books = signal<Book[]>([]);
  meta = signal<PaginationMeta | null>(null);
  isLoading = signal(true);
  currentPage = signal(1);
  trendingManga = signal<MangaPreview[]>([]);
  isTrendingLoading = signal(false);

  constructor() {
    this.loadTrendingManga();
    this.loadBooks();
  }

  loadTrendingManga() {
    this.isTrendingLoading.set(true);
    const sourceId = this.resolveTrendingSourceId();
    const endpoint = `/api/v1/books/manga/source/${encodeURIComponent(sourceId)}/discover?limit=10`;
    this.http
      .get<{ status: string; data: MangaDiscoverPayload }>(endpoint)
      .subscribe({
        next: (response) => {
          this.trendingManga.set(response.data.trending || []);
          this.isTrendingLoading.set(false);
        },
        error: (error) => {
          console.error('Error loading trending manga:', error);
          this.isTrendingLoading.set(false);
        },
      });
  }

  private resolveTrendingSourceId(): string {
    const savedSource = localStorage.getItem('np_manga_source')?.trim().toLowerCase();
    return savedSource || 'weebcentral';
  }

  loadBooks() {
    this.isLoading.set(true);
    this.http.get<{ status: string; data: Book[]; meta: PaginationMeta }>(`/api/v1/books?page=${this.currentPage()}&kind=book`)
      .subscribe({
        next: (response) => {
          this.books.set(response.data);
          this.meta.set(response.meta);
          this.isLoading.set(false);
        },
        error: (error) => {
          console.error('Error loading books:', error);
          this.isLoading.set(false);
        }
      });
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
    this.loadBooks();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  toRouteParam(value: string) {
    return encodeURIComponent(value);
  }
}
