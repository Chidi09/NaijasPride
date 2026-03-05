import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Book, PaginationMeta } from '@naijaspride/types';
import { interval, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

type BookProgressResponse = {
  status: string;
  data?: {
    page?: number;
  } | null;
};

type ContentItem = {
  id: string;
  title: string;
  coverUrl: string | null;
  author?: string;
  year?: number;
  type: 'book' | 'comic' | 'manga';
  slug?: string;
  latestChapter?: string | null;
};

type FeaturedContent = {
  book: ContentItem | null;
  comic: ContentItem | null;
  manga: ContentItem | null;
};

type SourceDiscoverResponse = {
  status: string;
  data: {
    trending: Array<{
      id: string;
      title: string;
      coverUrl: string | null;
      latestChapter?: string | null;
    }>;
  };
};

@Component({
  selector: 'app-book-hub',
  standalone: true,
  imports: [CommonModule, RouterLink, MatButtonModule, MatCardModule],
  template: `
    <div class="min-h-screen bg-[var(--bg-primary)] pb-20 books-theme">
      <!-- Hero Section with Featured Content -->
      <div class="bg-gradient-to-b from-cinema-800 to-cinema-900 py-12 px-6">
        <div class="max-w-7xl mx-auto">
          <h1 class="text-4xl md:text-5xl font-serif text-[#24181b] dark:text-white mb-4">Reading Library</h1>
          <p class="text-gray-400 text-lg mb-8 max-w-2xl">
            Discover stories across books, comics, and manga. Something for every reader.
          </p>

          <!-- Featured Content Carousel -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            <!-- Featured Book -->
            <div class="group">
              <a [routerLink]="featured().book?.slug ? ['/books/novel', featured().book!.slug] : null" class="block">
                <mat-card class="np-surface-card overflow-hidden transition-all hover:scale-[1.01]">
                <div class="p-4 border-b border-cinema-700">
                  <span class="text-xs font-bold tracking-wider text-blue-400 uppercase">📚 Popular Book</span>
                </div>
                <div class="p-4 flex gap-4">
                  <div class="w-24 h-36 flex-shrink-0 rounded overflow-hidden relative">
                    <img
                      [src]="getBookCover(featured().book?.slug, featured().book?.coverUrl)"
                      [alt]="featured().book?.title || 'Featured book'"
                      loading="lazy"
                      decoding="async"
                      referrerpolicy="no-referrer"
                      class="w-full h-full object-cover"
                    >
                    @if (getBookProgress(featured().book?.slug); as progress) {
                      <div class="absolute inset-x-0 bottom-0 h-1 bg-black/40">
                        <div class="h-full bg-[#8a1c1c] transition-all duration-300" [style.width.%]="getBookProgressWidth(progress)"></div>
                      </div>
                    }
                  </div>
                  <div class="flex-1 min-w-0">
                    <h3 class="text-[#24181b] dark:text-white font-medium text-lg line-clamp-2 mb-1">{{ featured().book?.title || 'Loading...' }}</h3>
                    <p class="text-gray-400 text-sm">{{ featured().book?.author || 'Unknown Author' }}</p>
                    @if (featured().book?.year) {
                      <p class="text-gray-500 text-xs mt-1">{{ featured().book!.year }}</p>
                    }
                  </div>
                </div>
                </mat-card>
              </a>
            </div>

            <!-- Featured Comic -->
            <div class="group">
              <a [routerLink]="featured().comic?.id ? ['/books/comics', toRouteParam(featured().comic!.id)] : ['/books/comics']" class="block">
                <mat-card class="np-surface-card overflow-hidden transition-all hover:scale-[1.01]">
                <div class="p-4 border-b border-cinema-700">
                  <span class="text-xs font-bold tracking-wider text-purple-400 uppercase">📖 Popular Comic</span>
                </div>
                <div class="p-4 flex gap-4">
                  @if (featured().comic?.coverUrl) {
                    <div class="w-24 h-36 flex-shrink-0 rounded overflow-hidden">
                      <img
                        [src]="featured().comic!.coverUrl"
                        [alt]="featured().comic!.title"
                        loading="lazy"
                        decoding="async"
                        referrerpolicy="no-referrer"
                        class="w-full h-full object-cover"
                      >
                    </div>
                  } @else {
                    <div class="w-24 h-36 flex-shrink-0 bg-[#dcc4b8] dark:bg-cinema-700 rounded flex items-center justify-center">
                      <span class="text-2xl">📖</span>
                    </div>
                  }
                  <div class="flex-1 min-w-0">
                    <h3 class="text-[#24181b] dark:text-white font-medium text-lg line-clamp-2 mb-1">{{ featured().comic?.title || 'Loading...' }}</h3>
                    <p class="text-gray-400 text-sm">{{ featured().comic?.author || 'Unknown Author' }}</p>
                  </div>
                </div>
                </mat-card>
              </a>
            </div>

            <!-- Featured Manga (Auto-rotating) -->
            <div class="group relative">
              <a [routerLink]="featured().manga?.id ? ['/books/manga', toRouteParam(featured().manga!.id)] : null" class="block">
                <mat-card class="np-surface-card overflow-hidden transition-all hover:scale-[1.01]">
                <div class="p-4 border-b border-cinema-700">
                  <span class="text-xs font-bold tracking-wider text-pink-400 uppercase">🎌 Trending Manga</span>
                </div>
                <div class="p-4 flex gap-4">
                  @if (featured().manga?.coverUrl) {
                    <div class="w-24 h-36 flex-shrink-0 rounded overflow-hidden">
                      <img
                        [src]="featured().manga!.coverUrl"
                        [alt]="featured().manga!.title"
                        loading="lazy"
                        decoding="async"
                        referrerpolicy="no-referrer"
                        class="w-full h-full object-cover transition-opacity duration-500"
                        [class.opacity-0]="isMangaChanging()"
                        [class.opacity-100]="!isMangaChanging()"
                      >
                    </div>
                  } @else {
                    <div class="w-24 h-36 flex-shrink-0 bg-[#dcc4b8] dark:bg-cinema-700 rounded flex items-center justify-center">
                      <span class="text-2xl">🎌</span>
                    </div>
                  }
                  <div class="flex-1 min-w-0">
                    <h3 class="text-[#24181b] dark:text-white font-medium text-lg line-clamp-2 mb-1 transition-opacity duration-500"
                        [class.opacity-0]="isMangaChanging()"
                        [class.opacity-100]="!isMangaChanging()"
                    >{{ featured().manga?.title || 'Loading...' }}</h3>
                    @if (featured().manga?.latestChapter) {
                      <p class="text-pink-400 text-sm">Ch. {{ featured().manga!.latestChapter }}</p>
                    }
                  </div>
                </div>
                </mat-card>
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- Content Sections -->
      <div class="max-w-7xl mx-auto px-6 py-12 space-y-16">
        
        <!-- Books Section -->
        <section>
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
              <span class="text-2xl">📚</span>
              <h2 class="text-2xl font-serif text-[#24181b] dark:text-white">Books</h2>
            </div>
            <a routerLink="/books/all" mat-button color="primary">
              View All Books →
            </a>
          </div>

          @if (isBooksLoading()) {
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
          } @else if (books().length > 0) {
            <div class="np-cover-grid">
              @for (book of books().slice(0, 12); track book.id) {
                <mat-card class="np-cover-card">
                  <a [routerLink]="['/books/novel', book.slug]" class="np-cover-link">
                    <div class="np-cover-media">
                      <img
                        [src]="getBookCover(book.slug, book.coverUrl)"
                        [alt]="book.title"
                        loading="lazy"
                        decoding="async"
                        referrerpolicy="no-referrer"
                      >
                      @if (getBookProgress(book.slug); as progress) {
                        <div class="absolute inset-x-0 bottom-0 h-1 bg-black/40">
                          <div class="h-full bg-[#8a1c1c] transition-all duration-300" [style.width.%]="getBookProgressWidth(progress)"></div>
                        </div>
                      }
                    </div>
                    <div class="np-cover-body">
                      <div class="np-cover-title">{{ book.title }}</div>
                      <div class="np-cover-meta">{{ book.author }}</div>
                    </div>
                  </a>
                </mat-card>
              }
            </div>
          } @else {
            <mat-card class="p-8 text-center" style="background: var(--bg-card); border: 1px solid var(--border-color);">
              <span class="text-4xl">📚</span>
              <p class="text-[var(--text-muted)] mt-2">No books available yet</p>
            </mat-card>
          }
        </section>

        <!-- Comics Section -->
        <section>
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
              <span class="text-2xl">📖</span>
              <h2 class="text-2xl font-serif text-[#24181b] dark:text-white">Comics</h2>
            </div>
            <a routerLink="/books/comics" mat-button color="primary">
              View All Comics →
            </a>
          </div>

          @if (isComicsLoading()) {
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
          } @else if (comics().length > 0) {
            <div class="np-cover-grid">
              @for (comic of comics().slice(0, 12); track comic.id) {
                <mat-card class="np-cover-card">
                  <a [routerLink]="['/books/comics', toRouteParam(comic.id)]" class="np-cover-link">
                    <div class="np-cover-media">
                      @if (comic.coverUrl) {
                        <img
                          [src]="comic.coverUrl"
                          [alt]="comic.title"
                          loading="lazy"
                          decoding="async"
                          referrerpolicy="no-referrer"
                        >
                      } @else {
                        <div class="absolute inset-0 flex items-center justify-center text-4xl">📖</div>
                      }
                    </div>
                    <div class="np-cover-body">
                      <div class="np-cover-title">{{ comic.title }}</div>
                      <div class="np-cover-meta">{{ comic.author }}</div>
                    </div>
                  </a>
                </mat-card>
              }
            </div>
          } @else {
            <mat-card class="p-8 text-center" style="background: var(--bg-card); border: 1px solid var(--border-color);">
              <span class="text-4xl">📖</span>
              <p class="text-[var(--text-muted)] mt-2">No comics available yet</p>
            </mat-card>
          }
        </section>

        <!-- Manga Section -->
        <section>
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
              <span class="text-2xl">🎌</span>
              <h2 class="text-2xl font-serif text-[#24181b] dark:text-white">Manga</h2>
            </div>
            <a routerLink="/books/manga" mat-button color="primary">
              Open Manga Library →
            </a>
          </div>

          @if (isMangaLoading()) {
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
          } @else if (manga().length > 0) {
            <div class="np-cover-grid">
              @for (m of manga().slice(0, 12); track m.id) {
                <mat-card class="np-cover-card">
                  <a [routerLink]="['/books/manga', toRouteParam(m.id)]" class="np-cover-link">
                    <div class="np-cover-media">
                      @if (m.coverUrl) {
                        <img
                          [src]="m.coverUrl"
                          [alt]="m.title"
                          loading="lazy"
                          decoding="async"
                          referrerpolicy="no-referrer"
                        >
                      } @else {
                        <div class="absolute inset-0 flex items-center justify-center text-4xl">🎌</div>
                      }
                    </div>
                    <div class="np-cover-body">
                      <div class="np-cover-title">{{ m.title }}</div>
                      <div class="np-cover-meta">
                        @if (m.latestChapter) { Ch. {{ m.latestChapter }} • }
                        Manga
                      </div>
                    </div>
                  </a>
                </mat-card>
              }
            </div>
          } @else {
            <mat-card class="p-8 text-center" style="background: var(--bg-card); border: 1px solid var(--border-color);">
              <span class="text-4xl">🎌</span>
              <p class="text-[var(--text-muted)] mt-2">No manga available</p>
            </mat-card>
          }
        </section>

      </div>
    </div>
  `
})
export class BookHubComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private destroy$ = new Subject<void>();
  
  // Content signals
  books = signal<Book[]>([]);
  comics = signal<ContentItem[]>([]);
  manga = signal<ContentItem[]>([]);
  
  // Loading states
  isBooksLoading = signal(true);
  isComicsLoading = signal(true);
  isMangaLoading = signal(true);
  
  // Featured content
  featured = signal<FeaturedContent>({ book: null, comic: null, manga: null });
  isMangaChanging = signal(false);
  bookProgressBySlug = signal<Record<string, number>>({});
  
  // Manga rotation
  private mangaRotationIndex = 0;
  private allTrendingManga: ContentItem[] = [];

  ngOnInit() {
    this.loadBooks();
    this.loadComics();
    this.loadManga();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadBooks() {
    this.isBooksLoading.set(true);
    this.http.get<{ status: string; data: Book[]; meta: PaginationMeta }>('/api/v1/books?page=1&limit=20&kind=book')
      .subscribe({
        next: (response) => {
          this.books.set(response.data);
          this.loadBookProgress(response.data.map((book) => book.slug));
          // Set featured book (first one)
          if (response.data.length > 0) {
            const book = response.data[0];
            this.featured.update(f => ({
              ...f,
              book: {
                id: book.id,
                title: book.title,
                coverUrl: book.coverUrl,
                author: book.author,
                year: book.year,
                type: 'book',
                slug: book.slug
              }
            }));
          }
          this.isBooksLoading.set(false);
        },
        error: (error) => {
          console.error('Error loading books:', error);
          this.isBooksLoading.set(false);
        }
      });
  }

  loadComics() {
    this.isComicsLoading.set(true);
    this.http
      .get<SourceDiscoverResponse>('/api/v1/books/manga/source/readcomicsonline/discover?limit=20')
      .subscribe({
        next: (response) => {
          const comics = response.data.trending.map((entry) => ({
            id: entry.id,
            title: entry.title,
            coverUrl: entry.coverUrl,
            author: 'ReadComicsOnline',
            type: 'comic' as const,
            latestChapter: entry.latestChapter ?? null,
          }));

          this.comics.set(comics);
          if (comics.length > 0) {
            const comic = comics[0];
            this.featured.update(f => ({
              ...f,
              comic: {
                id: comic.id,
                title: comic.title,
                coverUrl: comic.coverUrl,
                author: comic.author,
                type: 'comic',
                latestChapter: comic.latestChapter,
              }
            }));
          }
          this.isComicsLoading.set(false);
        },
        error: (error) => {
          console.error('Error loading comics:', error);
          this.isComicsLoading.set(false);
        }
      });
  }

  loadManga() {
    this.isMangaLoading.set(true);
    const sourceId = localStorage.getItem('np_manga_source')?.trim().toLowerCase() || 'weebcentral';
    
    this.http.get<{ 
      status: string; 
      data: { 
        trending: Array<{
          id: string;
          title: string;
          coverUrl: string | null;
          latestChapter?: string | null;
        }> 
      } 
    }>(`/api/v1/books/manga/source/${encodeURIComponent(sourceId)}/discover?limit=20`)
      .subscribe({
        next: (response) => {
          const mangaItems = response.data.trending.map(m => ({
            id: m.id,
            title: m.title,
            coverUrl: m.coverUrl,
            type: 'manga' as const,
            latestChapter: m.latestChapter
          }));
          
          this.manga.set(mangaItems);
          this.allTrendingManga = mangaItems;
          
          // Set initial featured manga and start rotation
          if (mangaItems.length > 0) {
            this.featured.update(f => ({ ...f, manga: mangaItems[0] }));
            this.startMangaRotation();
          }
          
          this.isMangaLoading.set(false);
        },
        error: (error) => {
          console.error('Error loading manga:', error);
          this.isMangaLoading.set(false);
        }
      });
  }

  private startMangaRotation() {
    // Rotate manga every 5 seconds
    interval(5000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.allTrendingManga.length > 1) {
          // Fade out
          this.isMangaChanging.set(true);
          
          // Change after fade out
          setTimeout(() => {
            this.mangaRotationIndex = (this.mangaRotationIndex + 1) % this.allTrendingManga.length;
            this.featured.update(f => ({
              ...f,
              manga: this.allTrendingManga[this.mangaRotationIndex]
            }));
            
            // Fade in
            setTimeout(() => {
              this.isMangaChanging.set(false);
            }, 100);
          }, 300);
        }
      });
  }

  toRouteParam(value: string) {
    return encodeURIComponent(value);
  }

  getBookCover(slug?: string, coverUrl?: string | null): string {
    if (coverUrl && coverUrl.trim().length > 0) return coverUrl;
    if (!slug) return '';
    return `/api/v1/books/cover/${encodeURIComponent(slug)}`;
  }

  getBookProgress(slug?: string): number | null {
    if (!slug) return null;
    const value = this.bookProgressBySlug()[slug];
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return null;
    return Math.max(0, Math.min(100, value));
  }

  getBookProgressWidth(value: number): number {
    return Math.max(4, Math.min(100, value));
  }

  private loadBookProgress(slugs: string[]) {
    const uniqueSlugs = Array.from(new Set(slugs.filter(Boolean))).slice(0, 24);
    if (uniqueSlugs.length === 0) {
      this.bookProgressBySlug.set({});
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
    });
  }
}
