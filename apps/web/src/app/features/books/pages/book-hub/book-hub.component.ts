import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Book, PaginationMeta } from '@naijaspride/types';
import { interval, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

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
  imports: [CommonModule, RouterLink],
  template: `
    <div class="min-h-screen bg-[var(--bg-primary)] pb-20">
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
              <a [routerLink]="featured().book?.slug ? ['/books', featured().book!.slug] : null"
                 class="block bg-[#f0e4db] dark:bg-cinema-800/50 rounded-lg overflow-hidden transition-all hover:bg-[#e6d5c9] dark:hover:bg-cinema-800 hover:scale-[1.02]"
              >
                <div class="p-4 border-b border-cinema-700">
                  <span class="text-xs font-bold tracking-wider text-blue-400 uppercase">📚 Popular Book</span>
                </div>
                <div class="p-4 flex gap-4">
                  @if (featured().book?.coverUrl) {
                    <div class="w-24 h-36 flex-shrink-0 rounded overflow-hidden">
                      <img 
                        [src]="featured().book!.coverUrl" 
                        [alt]="featured().book!.title"
                        referrerpolicy="no-referrer"
                        class="w-full h-full object-cover"
                      >
                    </div>
                  } @else {
                    <div class="w-24 h-36 flex-shrink-0 bg-[#dcc4b8] dark:bg-cinema-700 rounded flex items-center justify-center">
                      <span class="text-2xl">📚</span>
                    </div>
                  }
                  <div class="flex-1 min-w-0">
                    <h3 class="text-[#24181b] dark:text-white font-medium text-lg line-clamp-2 mb-1">{{ featured().book?.title || 'Loading...' }}</h3>
                    <p class="text-gray-400 text-sm">{{ featured().book?.author || 'Unknown Author' }}</p>
                    @if (featured().book?.year) {
                      <p class="text-gray-500 text-xs mt-1">{{ featured().book!.year }}</p>
                    }
                  </div>
                </div>
              </a>
            </div>

            <!-- Featured Comic -->
            <div class="group">
              <a [routerLink]="featured().comic?.id ? ['/books/comics', toRouteParam(featured().comic!.id)] : ['/books/comics']"
                 class="block bg-[#f0e4db] dark:bg-cinema-800/50 rounded-lg overflow-hidden transition-all hover:bg-[#e6d5c9] dark:hover:bg-cinema-800 hover:scale-[1.02]"
              >
                <div class="p-4 border-b border-cinema-700">
                  <span class="text-xs font-bold tracking-wider text-purple-400 uppercase">📖 Popular Comic</span>
                </div>
                <div class="p-4 flex gap-4">
                  @if (featured().comic?.coverUrl) {
                    <div class="w-24 h-36 flex-shrink-0 rounded overflow-hidden">
                      <img 
                        [src]="featured().comic!.coverUrl" 
                        [alt]="featured().comic!.title"
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
              </a>
            </div>

            <!-- Featured Manga (Auto-rotating) -->
            <div class="group relative">
              <a [routerLink]="featured().manga?.id ? ['/books/manga', toRouteParam(featured().manga!.id)] : null"
                 class="block bg-[#f0e4db] dark:bg-cinema-800/50 rounded-lg overflow-hidden transition-all hover:bg-[#e6d5c9] dark:hover:bg-cinema-800 hover:scale-[1.02]"
              >
                <div class="p-4 border-b border-cinema-700">
                  <span class="text-xs font-bold tracking-wider text-pink-400 uppercase">🎌 Trending Manga</span>
                </div>
                <div class="p-4 flex gap-4">
                  @if (featured().manga?.coverUrl) {
                    <div class="w-24 h-36 flex-shrink-0 rounded overflow-hidden">
                      <img 
                        [src]="featured().manga!.coverUrl" 
                        [alt]="featured().manga!.title"
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
            <a routerLink="/books/all" class="text-sm text-[#d6b87a] hover:text-white transition-colors">
              View All Books →
            </a>
          </div>

          @if (isBooksLoading()) {
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              @for (i of [1,2,3,4,5,6]; track i) {
                <div class="bg-[#e5d2c6] dark:bg-cinema-800 rounded aspect-[2/3] animate-pulse"></div>
              }
            </div>
          } @else if (books().length > 0) {
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              @for (book of books().slice(0, 12); track book.id) {
                <a [routerLink]="['/books', book.slug]" class="group">
                  <div class="bg-[#f1e5dd] dark:bg-cinema-800 rounded overflow-hidden transition-transform group-hover:scale-105">
                    <div class="aspect-[2/3] relative">
                      @if (book.coverUrl) {
                        <img 
                          [src]="book.coverUrl" 
                          [alt]="book.title"
                          referrerpolicy="no-referrer"
                          class="absolute inset-0 w-full h-full object-cover"
                        >
                      } @else {
                        <div class="w-full h-full bg-[#dcc4b8] dark:bg-cinema-700 flex items-center justify-center">
                          <span class="text-2xl">📚</span>
                        </div>
                      }
                    </div>
                    <div class="p-3">
                      <h3 class="text-[#24181b] dark:text-white text-sm font-medium line-clamp-2">{{ book.title }}</h3>
                      <p class="text-gray-500 text-xs mt-1">{{ book.author }}</p>
                    </div>
                  </div>
                </a>
              }
            </div>
          } @else {
            <div class="text-center py-12 bg-cinema-800/50 rounded-lg">
              <span class="text-4xl">📚</span>
              <p class="text-gray-400 mt-2">No books available yet</p>
            </div>
          }
        </section>

        <!-- Comics Section -->
        <section>
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
              <span class="text-2xl">📖</span>
              <h2 class="text-2xl font-serif text-[#24181b] dark:text-white">Comics</h2>
            </div>
            <a routerLink="/books/comics" class="text-sm text-[#d6b87a] hover:text-white transition-colors">
              View All Comics →
            </a>
          </div>

          @if (isComicsLoading()) {
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              @for (i of [1,2,3,4,5,6]; track i) {
                <div class="bg-cinema-800 rounded aspect-[2/3] animate-pulse"></div>
              }
            </div>
          } @else if (comics().length > 0) {
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              @for (comic of comics().slice(0, 12); track comic.id) {
                <a [routerLink]="['/books/comics', toRouteParam(comic.id)]" class="group">
                  <div class="bg-cinema-800 rounded overflow-hidden transition-transform group-hover:scale-105">
                    <div class="aspect-[2/3] relative">
                      @if (comic.coverUrl) {
                        <img 
                          [src]="comic.coverUrl" 
                          [alt]="comic.title"
                          referrerpolicy="no-referrer"
                          class="absolute inset-0 w-full h-full object-cover"
                        >
                      } @else {
                        <div class="w-full h-full bg-cinema-700 flex items-center justify-center">
                          <span class="text-2xl">📖</span>
                        </div>
                      }
                    </div>
                    <div class="p-3">
                      <h3 class="text-white text-sm font-medium line-clamp-2">{{ comic.title }}</h3>
                      <p class="text-gray-500 text-xs mt-1">{{ comic.author }}</p>
                    </div>
                  </div>
                </a>
              }
            </div>
          } @else {
            <div class="text-center py-12 bg-cinema-800/50 rounded-lg">
              <span class="text-4xl">📖</span>
              <p class="text-gray-400 mt-2">No comics available yet</p>
            </div>
          }
        </section>

        <!-- Manga Section -->
        <section>
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
              <span class="text-2xl">🎌</span>
              <h2 class="text-2xl font-serif text-[#24181b] dark:text-white">Manga</h2>
            </div>
            <a routerLink="/books/manga" class="text-sm text-[#d6b87a] hover:text-white transition-colors">
              Open Manga Library →
            </a>
          </div>

          @if (isMangaLoading()) {
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              @for (i of [1,2,3,4,5,6]; track i) {
                <div class="bg-cinema-800 rounded aspect-[2/3] animate-pulse"></div>
              }
            </div>
          } @else if (manga().length > 0) {
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              @for (m of manga().slice(0, 12); track m.id) {
                <a [routerLink]="['/books/manga', toRouteParam(m.id)]" class="group">
                  <div class="bg-cinema-800 rounded overflow-hidden transition-transform group-hover:scale-105">
                    <div class="aspect-[2/3] relative">
                      @if (m.coverUrl) {
                        <img 
                          [src]="m.coverUrl" 
                          [alt]="m.title"
                          referrerpolicy="no-referrer"
                          class="absolute inset-0 w-full h-full object-cover"
                        >
                      } @else {
                        <div class="w-full h-full bg-cinema-700 flex items-center justify-center">
                          <span class="text-2xl">🎌</span>
                        </div>
                      }
                    </div>
                    <div class="p-3">
                      <h3 class="text-white text-sm font-medium line-clamp-2">{{ m.title }}</h3>
                      @if (m.latestChapter) {
                        <p class="text-pink-400 text-xs mt-1">Ch. {{ m.latestChapter }}</p>
                      }
                    </div>
                  </div>
                </a>
              }
            </div>
          } @else {
            <div class="text-center py-12 bg-cinema-800/50 rounded-lg">
              <span class="text-4xl">🎌</span>
              <p class="text-gray-400 mt-2">No manga available</p>
            </div>
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
}
