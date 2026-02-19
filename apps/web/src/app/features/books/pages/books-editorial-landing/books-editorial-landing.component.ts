import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Book, PaginationMeta } from '@naijaspride/types';
import { interval, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

// Lucide icons as SVG components
const ArrowRightIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
`;

const GridIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
`;

const MoveUpRightIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>
`;


type ContentItem = {
  id: string;
  title: string;
  coverUrl: string | null;
  author?: string;
  year?: number;
  type: 'book' | 'comic' | 'manga';
  slug?: string;
  latestChapter?: string | null;
  tag?: string;
  description?: string;
};

type FeaturedContent = {
  book: ContentItem | null;
  comic: ContentItem | null;
  manga: ContentItem | null;
};

@Component({
  selector: 'app-books-editorial-landing',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      --books-bg: #f6f1eb;
      --books-surface: #ffffff;
      --books-surface-strong: #efe7df;
      --books-text: #1f1715;
      --books-text-muted: #6a5850;
      --books-border: #d8c9bf;
      --books-border-strong: #c6b2a6;
      --books-contrast: #111111;

      background: var(--books-bg);
      color: var(--books-text);
    }

    :host-context(.dark) {
      --books-bg: #050505;
      --books-surface: #1f1f1f;
      --books-surface-strong: #151515;
      --books-text: #e6e0d4;
      --books-text-muted: #bcae9e;
      --books-border: #2a2a2a;
      --books-border-strong: #3b3b3b;
      --books-contrast: #f7f1e8;
    }

    /* Typography */
    .serif-text { 
      font-family: 'Cormorant Garamond', 'Playfair Display', Georgia, serif;
      font-weight: 400;
    }
    .sans-text { 
      font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif;
      font-weight: 300;
    }

    /* Grain overlay */
    .grain-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 9999;
      opacity: 0.04;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
    }

    /* Image clip path */
    .clip-image-diag {
      clip-path: polygon(8% 0, 100% 0, 100% 92%, 92% 100%, 0 100%, 0 8%);
    }

    /* Text outline */
    .text-outline {
      -webkit-text-stroke: 1px var(--books-text);
      color: transparent;
    }

    /* Custom scrollbar */
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: var(--books-bg); }
    ::-webkit-scrollbar-thumb { background: #590d0d; }

    /* Hover animations */
    .hover-lift {
      transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.5s ease;
    }
    .hover-lift:hover {
      transform: translateY(-8px);
      box-shadow: 0 20px 40px rgba(0,0,0,0.4);
    }

    .image-zoom {
      transition: transform 0.7s cubic-bezier(0.16, 1, 0.3, 1), filter 0.5s ease;
    }
    .group:hover .image-zoom {
      transform: scale(1.08);
    }

    /* Scroll reveal */
    .reveal {
      opacity: 0;
      transform: translateY(30px);
      transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .reveal.visible {
      opacity: 1;
      transform: translateY(0);
    }

    /* Category hover */
    .category-item {
      transition: padding-left 0.3s ease, color 0.3s ease;
    }
    .category-item:hover {
      padding-left: 16px;
    }
  `],
  template: `
    <!-- Hero Section -->
    <section class="relative min-h-screen flex flex-col justify-center px-6 pt-24 pb-12 overflow-hidden border-b border-[var(--books-border)]">
      <!-- Background Elements -->
      <div class="absolute top-0 right-0 w-1/3 h-full bg-[var(--books-surface-strong)] opacity-35 dark:opacity-20 -z-10"></div>
      <div class="absolute top-1/4 left-10 w-64 h-64 border border-[#590d0d] rounded-full opacity-30 -z-10 blur-3xl"></div>
      
      <div class="max-w-7xl mx-auto w-full z-10">
        <div class="reveal visible">
          <h1 class="serif-text text-[11vw] md:text-[9vw] leading-[0.8] text-[var(--books-text)] mix-blend-overlay">
            VISUAL
          </h1>
          <div class="flex flex-col md:flex-row items-start md:items-end justify-between">
            <h1 class="serif-text text-[11vw] md:text-[9vw] leading-[0.8] text-[#8a1c1c] italic ml-0 md:ml-12">
              LIT.
            </h1>
            <div class="mb-4 md:mb-8 md:mr-12 max-w-sm">
              <p class="sans-text text-sm md:text-base text-[var(--books-text-muted)] leading-relaxed text-justify">
                Explore books, comics, and manga in one place. Track your reading progress and continue chapters from any device.
              </p>
              <a routerLink="/books/all" class="mt-6 px-6 py-3 border border-[var(--books-border-strong)] text-[var(--books-text)] text-xs tracking-[0.2em] hover:bg-[#8a1c1c] hover:border-[#8a1c1c] hover:text-white transition-all duration-300 inline-block sans-text">
                ENTER ARCHIVE
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- Decorative Line -->
      <div class="absolute bottom-12 left-0 h-[1px] bg-[#8a1c1c]" [style.width.%]="scrollProgress() * 100"></div>
    </section>

    <!-- Featured Weekly Drops -->
    <section class="py-24 px-6 bg-[var(--books-bg)]">
      <div class="max-w-7xl mx-auto">
        <div class="flex flex-col md:flex-row justify-between items-end mb-16 border-b border-[var(--books-border)] pb-6 reveal">
          <h2 class="serif-text text-4xl md:text-5xl text-[var(--books-text)]">
            WEEKLY <span class="text-[#590d0d] italic">DROPS</span>
          </h2>
          <div class="flex gap-2 mt-4 md:mt-0">
            <button routerLink="/books/all" class="w-10 h-10 border border-[var(--books-border)] flex items-center justify-center hover:bg-[var(--books-text)] hover:text-[var(--books-bg)] transition-colors">
              <span [innerHTML]="gridIcon"></span>
            </button>
            <button routerLink="/books/all" class="w-10 h-10 border border-[var(--books-border)] flex items-center justify-center hover:bg-[var(--books-text)] hover:text-[var(--books-bg)] transition-colors">
              <span [innerHTML]="arrowIcon"></span>
            </button>
          </div>
        </div>

        @if (isLoading()) {
          <div class="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            @for (i of [1,2,3]; track i) {
              <div class="animate-pulse">
                <div class="aspect-[3/4] bg-[var(--books-surface)] clip-image-diag mb-4"></div>
                <div class="h-6 bg-[var(--books-surface)] w-3/4 mb-2"></div>
                <div class="h-4 bg-[var(--books-surface)] w-1/2"></div>
              </div>
            }
          </div>
        } @else {
          <div class="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            <!-- Featured Book -->
            @if (featured().book) {
              <a [routerLink]="['/books', featured()!.book!.slug]" class="group cursor-pointer reveal" [style.transition-delay]="'0ms'">
                <div class="relative aspect-[3/4] overflow-hidden mb-4 clip-image-diag bg-[var(--books-surface)] hover-lift">
                  <div class="absolute inset-0 bg-[#590d0d] opacity-0 group-hover:opacity-30 transition-opacity duration-500 z-10 mix-blend-multiply"></div>
                  
                  @if (featured()!.book!.coverUrl) {
                    <img 
                      [src]="featured()!.book!.coverUrl" 
                      [alt]="featured()!.book!.title"
                      class="w-full h-full object-cover grayscale group-hover:grayscale-0 image-zoom"
                      loading="lazy"
                      referrerpolicy="no-referrer"
                    >
                  } @else {
                    <div class="w-full h-full flex items-center justify-center">
                      <span class="text-6xl">📚</span>
                    </div>
                  }
                  
                  <div class="absolute top-4 right-4 bg-[var(--books-bg)] px-2 py-1 z-20">
                    <span class="text-[10px] tracking-widest text-[var(--books-text)] uppercase sans-text">BOOK</span>
                  </div>
                </div>

                <div class="flex justify-between items-start border-t border-[var(--books-border)] pt-3 group-hover:border-[#8a1c1c] transition-colors">
                  <div>
                    <h3 class="serif-text text-xl text-[var(--books-text)] italic">{{ featured()!.book!.title }}</h3>
                    <p class="sans-text text-xs text-[var(--books-text-muted)] mt-1 uppercase tracking-wide">By {{ featured()!.book!.author || 'Unknown Author' }}</p>
                  </div>
                  <div class="text-right">
                    <span class="block text-[#8a1c1c] sans-text text-xs font-bold">{{ featured()!.book!.year || '2024' }}</span>
                    <span [innerHTML]="arrowUpIcon" class="ml-auto mt-2 text-[var(--books-text)] opacity-0 group-hover:opacity-100 transition-opacity"></span>
                  </div>
                </div>
              </a>
            }

            <!-- Featured Comic -->
            @if (featured().comic) {
              <a [routerLink]="['/books/comics', toRouteParam(featured()!.comic!.id)]" class="group cursor-pointer reveal" [style.transition-delay]="'100ms'">
                <div class="relative aspect-[3/4] overflow-hidden mb-4 clip-image-diag bg-[var(--books-surface)] hover-lift">
                  <div class="absolute inset-0 bg-[#590d0d] opacity-0 group-hover:opacity-30 transition-opacity duration-500 z-10 mix-blend-multiply"></div>
                  
                  @if (featured()!.comic!.coverUrl) {
                    <img 
                      [src]="featured()!.comic!.coverUrl" 
                      [alt]="featured()!.comic!.title"
                      class="w-full h-full object-cover grayscale group-hover:grayscale-0 image-zoom"
                      loading="lazy"
                      referrerpolicy="no-referrer"
                    >
                  } @else {
                    <div class="w-full h-full flex items-center justify-center">
                      <span class="text-6xl">📖</span>
                    </div>
                  }
                  
                  <div class="absolute top-4 right-4 bg-[var(--books-bg)] px-2 py-1 z-20">
                    <span class="text-[10px] tracking-widest text-[var(--books-text)] uppercase sans-text">COMIC</span>
                  </div>
                </div>

                <div class="flex justify-between items-start border-t border-[var(--books-border)] pt-3 group-hover:border-[#8a1c1c] transition-colors">
                  <div>
                    <h3 class="serif-text text-xl text-[var(--books-text)] italic">{{ featured()!.comic!.title }}</h3>
                    <p class="sans-text text-xs text-[var(--books-text-muted)] mt-1 uppercase tracking-wide">Updated Recently</p>
                  </div>
                  <div class="text-right">
                    @if (featured()!.comic!.latestChapter) {
                      <span class="block text-[#8a1c1c] sans-text text-xs font-bold">Ch. {{ featured()!.comic!.latestChapter }}</span>
                    }
                    <span [innerHTML]="arrowUpIcon" class="ml-auto mt-2 text-[var(--books-text)] opacity-0 group-hover:opacity-100 transition-opacity"></span>
                  </div>
                </div>
              </a>
            }

            <!-- Featured Manga (Rotating) -->
            @if (featured().manga) {
              <a [routerLink]="['/books/manga', toRouteParam(featured()!.manga!.id)]" class="group cursor-pointer reveal" [style.transition-delay]="'200ms'">
                <div class="relative aspect-[3/4] overflow-hidden mb-4 clip-image-diag bg-[var(--books-surface)] hover-lift">
                  <div class="absolute inset-0 bg-[#590d0d] opacity-0 group-hover:opacity-30 transition-opacity duration-500 z-10 mix-blend-multiply"></div>
                  
                  @if (featured()!.manga!.coverUrl) {
                    <img 
                      [src]="featured()!.manga!.coverUrl" 
                      [alt]="featured()!.manga!.title"
                      class="w-full h-full object-cover grayscale group-hover:grayscale-0 image-zoom"
                      loading="lazy"
                      referrerpolicy="no-referrer"
                      [class.opacity-0]="isMangaChanging()"
                      [class.opacity-100]="!isMangaChanging()"
                      style="transition: opacity 0.3s ease, transform 0.7s cubic-bezier(0.16, 1, 0.3, 1), filter 0.5s ease"
                    >
                  } @else {
                    <div class="w-full h-full flex items-center justify-center">
                      <span class="text-6xl">🎌</span>
                    </div>
                  }
                  
                  <div class="absolute top-4 right-4 bg-[var(--books-bg)] px-2 py-1 z-20">
                    <span class="text-[10px] tracking-widest text-[var(--books-text)] uppercase sans-text">MANGA</span>
                  </div>
                </div>

                <div class="flex justify-between items-start border-t border-[var(--books-border)] pt-3 group-hover:border-[#8a1c1c] transition-colors">
                  <div>
                    <h3 class="serif-text text-xl text-[var(--books-text)] italic transition-opacity duration-300" [class.opacity-0]="isMangaChanging()" [class.opacity-100]="!isMangaChanging()">{{ featured()!.manga!.title }}</h3>
                    <p class="sans-text text-xs text-[var(--books-text-muted)] mt-1 uppercase tracking-wide">Trending Now</p>
                  </div>
                  <div class="text-right">
                    @if (featured()!.manga!.latestChapter) {
                      <span class="block text-[#8a1c1c] sans-text text-xs font-bold transition-opacity duration-300" [class.opacity-0]="isMangaChanging()" [class.opacity-100]="!isMangaChanging()">Ch. {{ featured()!.manga!.latestChapter }}</span>
                    }
                    <span [innerHTML]="arrowUpIcon" class="ml-auto mt-2 text-[var(--books-text)] opacity-0 group-hover:opacity-100 transition-opacity"></span>
                  </div>
                </div>
              </a>
            }
          </div>
        }
      </div>
    </section>

    <!-- Content Sections -->
    <section class="py-24 px-6 max-w-7xl mx-auto">
      
      <!-- Books Section -->
      <div class="mb-20 reveal">
        <div class="flex items-center justify-between mb-10 border-b border-[var(--books-border)] pb-4">
          <div class="flex items-baseline gap-4">
            <span class="serif-text text-5xl md:text-6xl text-[var(--books-border)]">01</span>
            <h2 class="serif-text text-3xl md:text-4xl text-[var(--books-text)] group-hover:italic group-hover:text-[#8a1c1c] transition-all">BOOKS</h2>
          </div>
          <a routerLink="/books/all" class="text-xs tracking-widest text-[#8a1c1c] hover:text-[var(--books-text)] transition-colors sans-text flex items-center gap-2">
            VIEW ALL <span [innerHTML]="arrowIcon"></span>
          </a>
        </div>

        @if (isBooksLoading()) {
          <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            @for (i of [1,2,3,4,5,6]; track i) {
                <div class="animate-pulse">
                <div class="aspect-[2/3] bg-[var(--books-surface)] clip-image-diag mb-3"></div>
                <div class="h-4 bg-[var(--books-surface)] w-3/4"></div>
                </div>
            }
          </div>
        } @else if (books().length > 0) {
          <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            @for (book of books().slice(0, 6); track book.id; let idx = $index) {
              <a [routerLink]="['/books', book.slug]" class="group reveal" [style.transition-delay]="idx * 50 + 'ms'">
                <div class="relative aspect-[2/3] overflow-hidden mb-3 clip-image-diag bg-[var(--books-surface)]">
                  @if (book.coverUrl) {
                    <img [src]="book.coverUrl" [alt]="book.title" class="w-full h-full object-cover grayscale group-hover:grayscale-0 image-zoom" loading="lazy" referrerpolicy="no-referrer">
                  } @else {
                    <div class="w-full h-full flex items-center justify-center text-3xl">📚</div>
                  }
                </div>
                <h3 class="serif-text text-lg text-[var(--books-text)] truncate">{{ book.title }}</h3>
                <p class="sans-text text-xs text-[var(--books-text-muted)] uppercase tracking-wide">{{ book.author }}</p>
              </a>
            }
          </div>
        }
      </div>

      <!-- Comics Section -->
      <div class="mb-20 reveal">
        <div class="flex items-center justify-between mb-10 border-b border-[var(--books-border)] pb-4">
          <div class="flex items-baseline gap-4">
            <span class="serif-text text-5xl md:text-6xl text-[var(--books-border)]">02</span>
            <h2 class="serif-text text-3xl md:text-4xl text-[var(--books-text)]">COMICS</h2>
          </div>
          <a routerLink="/books/comics" class="text-xs tracking-widest text-[#8a1c1c] hover:text-[var(--books-text)] transition-colors sans-text flex items-center gap-2">
            VIEW ALL <span [innerHTML]="arrowIcon"></span>
          </a>
        </div>

        @if (isComicsLoading()) {
          <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            @for (i of [1,2,3,4,5,6]; track i) {
                <div class="animate-pulse">
                <div class="aspect-[2/3] bg-[var(--books-surface)] clip-image-diag mb-3"></div>
                <div class="h-4 bg-[var(--books-surface)] w-3/4"></div>
                </div>
            }
          </div>
        } @else if (comics().length > 0) {
          <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            @for (comic of comics().slice(0, 6); track comic.id; let idx = $index) {
              <a [routerLink]="['/books/comics', toRouteParam(comic.id)]" class="group reveal" [style.transition-delay]="idx * 50 + 'ms'">
                <div class="relative aspect-[2/3] overflow-hidden mb-3 clip-image-diag bg-[var(--books-surface)]">
                  @if (comic.coverUrl) {
                    <img [src]="comic.coverUrl" [alt]="comic.title" class="w-full h-full object-cover grayscale group-hover:grayscale-0 image-zoom" loading="lazy" referrerpolicy="no-referrer">
                  } @else {
                    <div class="w-full h-full flex items-center justify-center text-3xl">📖</div>
                  }
                  @if (comic.latestChapter) {
                    <div class="absolute bottom-2 left-2 bg-[var(--books-bg)] px-2 py-0.5 text-[10px] tracking-wider">CH. {{ comic.latestChapter }}</div>
                  }
                </div>
                <h3 class="serif-text text-lg text-[var(--books-text)] truncate">{{ comic.title }}</h3>
              </a>
            }
          </div>
        }
      </div>

      <!-- Manga Section -->
      <div class="reveal">
        <div class="flex items-center justify-between mb-10 border-b border-[var(--books-border)] pb-4">
          <div class="flex items-baseline gap-4">
            <span class="serif-text text-5xl md:text-6xl text-[var(--books-border)]">03</span>
            <h2 class="serif-text text-3xl md:text-4xl text-[var(--books-text)]">MANGA</h2>
          </div>
          <a routerLink="/books/manga" class="text-xs tracking-widest text-[#8a1c1c] hover:text-[var(--books-text)] transition-colors sans-text flex items-center gap-2">
            OPEN LIBRARY <span [innerHTML]="arrowIcon"></span>
          </a>
        </div>

        @if (isMangaLoading()) {
          <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            @for (i of [1,2,3,4,5,6]; track i) {
                <div class="animate-pulse">
                <div class="aspect-[2/3] bg-[var(--books-surface)] clip-image-diag mb-3"></div>
                <div class="h-4 bg-[var(--books-surface)] w-3/4"></div>
                </div>
            }
          </div>
        } @else if (manga().length > 0) {
          <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            @for (m of manga().slice(0, 6); track m.id; let idx = $index) {
              <a [routerLink]="['/books/manga', toRouteParam(m.id)]" class="group reveal" [style.transition-delay]="idx * 50 + 'ms'">
                <div class="relative aspect-[2/3] overflow-hidden mb-3 clip-image-diag bg-[var(--books-surface)]">
                  @if (m.coverUrl) {
                    <img [src]="m.coverUrl" [alt]="m.title" class="w-full h-full object-cover grayscale group-hover:grayscale-0 image-zoom" loading="lazy" referrerpolicy="no-referrer">
                  } @else {
                    <div class="w-full h-full flex items-center justify-center text-3xl">🎌</div>
                  }
                  @if (m.latestChapter) {
                    <div class="absolute bottom-2 left-2 bg-[var(--books-bg)] px-2 py-0.5 text-[10px] tracking-wider">CH. {{ m.latestChapter }}</div>
                  }
                </div>
                <h3 class="serif-text text-lg text-[var(--books-text)] truncate">{{ m.title }}</h3>
              </a>
            }
          </div>
        }
      </div>
    </section>

  `,
})
export class BooksEditorialLandingComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private destroy$ = new Subject<void>();
  private intersectionObserver: IntersectionObserver | null = null;
  
  // Content signals
  books = signal<Book[]>([]);
  comics = signal<ContentItem[]>([]);
  manga = signal<ContentItem[]>([]);
  
  // Loading states
  isBooksLoading = signal(true);
  isComicsLoading = signal(true);
  isMangaLoading = signal(true);
  isLoading = computed(() => this.isBooksLoading() || this.isComicsLoading() || this.isMangaLoading());
  
  // Featured content
  featured = signal<FeaturedContent>({ book: null, comic: null, manga: null });
  isMangaChanging = signal(false);
  
  // Scroll progress for hero line
  scrollProgress = signal(0);
  
  // Icons
  arrowIcon = ArrowRightIcon;
  gridIcon = GridIcon;
  arrowUpIcon = MoveUpRightIcon;
  
  // Manga rotation
  private mangaRotationIndex = 0;
  private allTrendingManga: ContentItem[] = [];

  ngOnInit() {
    this.loadBooks();
    this.loadComics();
    this.loadManga();
    this.setupScrollListener();
    this.setupIntersectionObserver();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.intersectionObserver?.disconnect();
  }

  private setupScrollListener() {
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', () => {
        const scrollY = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        this.scrollProgress.set(Math.min(1, scrollY / 500));
      }, { passive: true });
    }
  }

  private setupIntersectionObserver() {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;

    this.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          this.intersectionObserver?.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    this.observeReveals();
  }

  private observeReveals() {
    if (typeof document === 'undefined' || !this.intersectionObserver) return;
    setTimeout(() => {
      document.querySelectorAll('.reveal:not(.visible)').forEach((el) => this.intersectionObserver?.observe(el));
    }, 0);
  }

  loadBooks() {
    this.isBooksLoading.set(true);
    this.http.get<{ status: string; data: Book[]; meta: PaginationMeta }>('/api/v1/books?page=1&limit=20&kind=book')
      .subscribe({
        next: (response) => {
          this.books.set(response.data);
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
          this.observeReveals();
        },
        error: () => {
          this.isBooksLoading.set(false);
          this.observeReveals();
        }
      });
  }

  loadComics() {
    this.isComicsLoading.set(true);
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
    }>('/api/v1/books/manga/source/readcomicsonline/discover?limit=20')
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
            this.featured.update(f => ({
              ...f,
              comic: comics[0]
            }));
          }
          this.isComicsLoading.set(false);
          this.observeReveals();
        },
        error: () => {
          this.isComicsLoading.set(false);
          this.observeReveals();
        }
      });
  }

  loadManga() {
    this.isMangaLoading.set(true);
    const sourceId = typeof window !== 'undefined'
      ? localStorage.getItem('np_manga_source')?.trim().toLowerCase() || 'weebcentral'
      : 'weebcentral';
    
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
          
          if (mangaItems.length > 0) {
            this.featured.update(f => ({ ...f, manga: mangaItems[0] }));
            this.startMangaRotation();
          }
          
          this.isMangaLoading.set(false);
          this.observeReveals();
        },
        error: () => {
          this.isMangaLoading.set(false);
          this.observeReveals();
        }
      });
  }

  private startMangaRotation() {
    interval(5000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.allTrendingManga.length > 1) {
          this.isMangaChanging.set(true);
          
          setTimeout(() => {
            this.mangaRotationIndex = (this.mangaRotationIndex + 1) % this.allTrendingManga.length;
            this.featured.update(f => ({
              ...f,
              manga: this.allTrendingManga[this.mangaRotationIndex]
            }));
            
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
