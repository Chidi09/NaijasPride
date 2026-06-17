import { Component, inject, signal, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { HttpClient } from "@angular/common/http";
import { Book, PaginationMeta } from "@naijaspride/types";
import { interval, Subject } from "rxjs";
import { takeUntil } from "rxjs/operators";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { forkJoin, of } from "rxjs";
import { catchError, map } from "rxjs/operators";
import { PwaService } from "../../../../core/services/pwa.service";
import { SymbolIconComponent } from "../../../../shared/components/symbol-icon/symbol-icon.component";
import { TvFocusGroupDirective } from "../../../../shared/directives/tv-focus-group.directive";

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
  type: "book" | "comic" | "manga";
  slug?: string;
  latestChapter?: string | null;
};

type LightNovelSeries = {
  seriesKey: string;
  seriesTitle: string;
  totalVolumes: number;
  latestYear: number;
  coverUrl: string | null;
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
  selector: "app-book-hub",
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    SymbolIconComponent,
    TvFocusGroupDirective,
  ],
  template: `
    @if (useEditorialShell()) {
      <div
        appTvFocusGroup
        [tvAutoFocus]="true"
        class="flex min-h-screen w-full overflow-hidden bg-[#090609] text-[#f6efe8] books-theme"
      >
        <aside
          class="hidden w-24 flex-col border-r border-white/10 bg-black/30 px-3 py-8 backdrop-blur-xl lg:flex xl:w-64 xl:px-5"
        >
          <div class="flex items-center gap-3 px-1">
            <span
              class="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#800020] text-white"
            >
              <app-symbol-icon name="menu_book" [size]="24"></app-symbol-icon>
            </span>
            <div class="hidden xl:block">
              <p
                class="text-sm font-semibold tracking-[0.22em] text-[#d0a97a] uppercase"
              >
                NaijasPride
              </p>
              <p class="text-xs text-white/45">Reading lounge</p>
            </div>
          </div>

          <nav class="mt-8 flex flex-col gap-3">
            @for (item of shelfNavItems; track item.label) {
              <a
                [routerLink]="item.link"
                class="group flex items-center gap-3 rounded-2xl px-3 py-3 text-white/65 transition hover:bg-white/[0.06] hover:text-white"
                [ngClass]="item.active ? 'bg-[#800020]/25 text-white' : ''"
              >
                <span
                  class="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]"
                >
                  <app-symbol-icon
                    [name]="item.icon"
                    [size]="24"
                  ></app-symbol-icon>
                </span>
                <span class="hidden xl:block text-base font-medium">{{
                  item.label
                }}</span>
              </a>
            }
          </nav>
        </aside>

        <main class="flex-1 overflow-y-auto">
          <section class="relative min-h-[72vh] overflow-hidden">
            <div
              class="absolute inset-0 bg-cover bg-center"
              [style.background-image]="heroBackground()"
            ></div>
            <div
              class="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,6,9,0.96)_0%,rgba(9,6,9,0.7)_42%,rgba(9,6,9,0.18)_100%),linear-gradient(0deg,rgba(9,6,9,1)_0%,rgba(9,6,9,0.35)_45%,rgba(9,6,9,0)_100%)]"
            ></div>
            <div
              class="relative z-10 flex min-h-[72vh] max-w-5xl flex-col justify-center px-8 py-12 md:px-12 xl:px-20"
            >
              <div
                class="flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-white/55"
              >
                <span
                  class="rounded-full border border-[#d0a97a]/40 bg-[#d0a97a]/10 px-3 py-1 text-[#ecd8b7]"
                  >Featured Shelf</span
                >
                <span>{{ heroTypeLabel() }}</span>
              </div>
              <h1
                class="mt-5 text-5xl font-black leading-[0.95] text-white md:text-7xl"
              >
                {{ heroTitle() }}
              </h1>
              <p class="mt-5 max-w-2xl text-base leading-8 text-white/68">
                {{ heroDescription() }}
              </p>
              <div class="mt-8 flex flex-wrap gap-4">
                <a
                  [routerLink]="heroPrimaryLink()"
                  class="inline-flex items-center gap-3 rounded-2xl bg-[#800020] px-7 py-4 text-base font-semibold text-white shadow-[0_18px_48px_rgba(128,0,32,0.35)] transition hover:bg-[#95002a]"
                >
                  <app-symbol-icon
                    name="auto_stories"
                    [size]="24"
                  ></app-symbol-icon>
                  Read Now
                </a>
                <a
                  [routerLink]="heroSecondaryLink()"
                  class="inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.06] px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-md transition hover:bg-white/[0.1]"
                >
                  <app-symbol-icon name="info" [size]="24"></app-symbol-icon>
                  Browse Collection
                </a>
              </div>
            </div>
          </section>

          <div class="space-y-12 px-8 pb-16 md:px-12 xl:px-20">
            <section>
              <div class="mb-5 flex items-center justify-between">
                <h2 class="text-2xl font-bold text-white">Books</h2>
                <a
                  routerLink="/books/all"
                  class="text-sm font-medium text-[#d0a97a] hover:text-[#ead9bf]"
                  >See all</a
                >
              </div>
              @if (isBooksLoading()) {
                <div class="flex gap-5">
                  <div
                    class="w-44 flex-shrink-0 aspect-[2/3] rounded-[1.6rem] bg-white/[0.04] animate-pulse"
                  ></div>
                  <div
                    class="w-44 flex-shrink-0 aspect-[2/3] rounded-[1.6rem] bg-white/[0.04] animate-pulse"
                  ></div>
                  <div
                    class="w-44 flex-shrink-0 aspect-[2/3] rounded-[1.6rem] bg-white/[0.04] animate-pulse"
                  ></div>
                </div>
              } @else if (books().length === 0) {
                <p class="text-sm text-white/35 italic">
                  Books are being added to the library — check back soon.
                </p>
              } @else {
                <div class="flex gap-5 overflow-x-auto pb-2">
                  @for (book of books().slice(0, 10); track book.id) {
                    <a
                      [routerLink]="['/books/novel', book.slug]"
                      class="group block w-44 flex-shrink-0"
                    >
                      <div
                        class="relative aspect-[2/3] overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/[0.04]"
                      >
                        <img
                          [src]="getBookCover(book.slug, book.coverUrl)"
                          [alt]="book.title"
                          class="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          referrerpolicy="no-referrer"
                        />
                        @if (getBookProgress(book.slug); as progress) {
                          <div
                            class="absolute inset-x-0 bottom-0 h-1.5 bg-white/10"
                          >
                            <div
                              class="h-full bg-[#d0a97a]"
                              [style.width.%]="getBookProgressWidth(progress)"
                            ></div>
                          </div>
                        }
                      </div>
                      <p class="mt-3 truncate text-sm font-semibold text-white">
                        {{ book.title }}
                      </p>
                      <p class="truncate text-xs text-white/50">
                        {{ book.author || "Book" }}
                      </p>
                    </a>
                  }
                </div>
              }
            </section>

            <section>
              <div class="mb-5 flex items-center justify-between">
                <h2 class="text-2xl font-bold text-white">Light Novels</h2>
                <a
                  routerLink="/books/light-novels"
                  class="text-sm font-medium text-[#d0a97a] hover:text-[#ead9bf]"
                  >Browse series</a
                >
              </div>
              @if (isLightNovelsLoading()) {
                <div class="flex gap-5">
                  <div
                    class="w-44 flex-shrink-0 aspect-[2/3] rounded-[1.6rem] bg-white/[0.04] animate-pulse"
                  ></div>
                  <div
                    class="w-44 flex-shrink-0 aspect-[2/3] rounded-[1.6rem] bg-white/[0.04] animate-pulse"
                  ></div>
                  <div
                    class="w-44 flex-shrink-0 aspect-[2/3] rounded-[1.6rem] bg-white/[0.04] animate-pulse"
                  ></div>
                </div>
              } @else {
                <div class="flex gap-5 overflow-x-auto pb-2">
                  @for (
                    series of lightNovelSeries().slice(0, 10);
                    track series.seriesKey
                  ) {
                    <a
                      [routerLink]="['/books/light-novels']"
                      [queryParams]="{ q: series.seriesTitle }"
                      class="group block w-44 flex-shrink-0"
                    >
                      <div
                        class="relative aspect-[2/3] overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/[0.04]"
                      >
                        @if (series.coverUrl) {
                          <img
                            [src]="series.coverUrl"
                            [alt]="series.seriesTitle"
                            class="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                            referrerpolicy="no-referrer"
                          />
                        } @else {
                          <div
                            class="absolute inset-0 flex items-center justify-center"
                          >
                            <app-symbol-icon
                              name="edit_note"
                              [size]="40"
                            ></app-symbol-icon>
                          </div>
                        }
                      </div>
                      <p class="mt-3 truncate text-sm font-semibold text-white">
                        {{ series.seriesTitle }}
                      </p>
                      <p class="truncate text-xs text-white/50">
                        {{ series.totalVolumes }} vol{{
                          series.totalVolumes !== 1 ? "s" : ""
                        }}
                      </p>
                    </a>
                  }
                </div>
              }
            </section>

            <section>
              <div class="mb-5 flex items-center justify-between">
                <h2 class="text-2xl font-bold text-white">Comics</h2>
                <a
                  routerLink="/books/comics"
                  class="text-sm font-medium text-[#d0a97a] hover:text-[#ead9bf]"
                  >Explore comics</a
                >
              </div>
              <div class="flex gap-5 overflow-x-auto pb-2">
                @for (comic of comics().slice(0, 10); track comic.id) {
                  <a
                    [routerLink]="['/books/comics', toRouteParam(comic.id)]"
                    class="group block w-44 flex-shrink-0"
                  >
                    <div
                      class="relative aspect-[2/3] overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/[0.04]"
                    >
                      @if (comic.coverUrl) {
                        <img
                          [src]="comic.coverUrl"
                          [alt]="comic.title"
                          class="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          referrerpolicy="no-referrer"
                        />
                      }
                    </div>
                    <p class="mt-3 truncate text-sm font-semibold text-white">
                      {{ comic.title }}
                    </p>
                    <p class="truncate text-xs text-white/50">
                      {{
                        comic.latestChapter
                          ? "Latest " + comic.latestChapter
                          : "Comic"
                      }}
                    </p>
                  </a>
                }
              </div>
            </section>

            <section>
              <div class="mb-5 flex items-center justify-between">
                <h2 class="text-2xl font-bold text-white">Manga</h2>
                <a
                  routerLink="/books/manga"
                  class="text-sm font-medium text-[#d0a97a] hover:text-[#ead9bf]"
                  >Open manga</a
                >
              </div>
              <div class="flex gap-5 overflow-x-auto pb-2">
                @for (item of manga().slice(0, 10); track item.id) {
                  <a
                    [routerLink]="['/books/manga', toRouteParam(item.id)]"
                    class="group block w-44 flex-shrink-0"
                  >
                    <div
                      class="relative aspect-[2/3] overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/[0.04]"
                    >
                      @if (item.coverUrl) {
                        <img
                          [src]="item.coverUrl"
                          [alt]="item.title"
                          class="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          referrerpolicy="no-referrer"
                        />
                      }
                    </div>
                    <p class="mt-3 truncate text-sm font-semibold text-white">
                      {{ item.title }}
                    </p>
                    <p class="truncate text-xs text-white/50">
                      {{
                        item.latestChapter
                          ? "Ch. " + item.latestChapter
                          : "Manga"
                      }}
                    </p>
                  </a>
                }
              </div>
            </section>
          </div>
        </main>
      </div>
    } @else {
      <div class="min-h-screen bg-[var(--bg-primary)] pb-20 books-theme">
        <!-- Hero Section with Featured Content -->
        <div class="bg-gradient-to-b from-cinema-800 to-cinema-900 py-12 px-6">
          <div class="max-w-7xl mx-auto">
            <h1
              class="text-4xl md:text-5xl font-serif text-[#24181b] dark:text-white mb-4"
            >
              Reading Library
            </h1>
            <p class="text-gray-400 text-lg mb-8 max-w-2xl">
              Discover stories across books, comics, and manga. Something for
              every reader.
            </p>

            <!-- Featured Content Carousel -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
              <!-- Featured Book -->
              <div class="group">
                <a
                  [routerLink]="
                    featured().book?.slug
                      ? ['/books/novel', featured().book!.slug]
                      : null
                  "
                  class="block"
                >
                  <mat-card
                    class="np-surface-card overflow-hidden transition-all hover:scale-[1.01]"
                  >
                    <div class="p-4 border-b border-cinema-700">
                      <span
                        class="text-xs font-bold tracking-wider text-blue-400 uppercase inline-flex items-center gap-1"
                        ><app-symbol-icon
                          name="menu_book"
                          [size]="16"
                        ></app-symbol-icon>
                        Popular Book</span
                      >
                    </div>
                    <div class="p-4 flex gap-4">
                      <div
                        class="w-24 h-36 flex-shrink-0 rounded overflow-hidden relative"
                      >
                        <img
                          [src]="
                            getBookCover(
                              featured().book?.slug,
                              featured().book?.coverUrl
                            )
                          "
                          [alt]="featured().book?.title || 'Featured book'"
                          loading="lazy"
                          decoding="async"
                          referrerpolicy="no-referrer"
                          class="w-full h-full object-cover"
                        />
                        @if (
                          getBookProgress(featured().book?.slug);
                          as progress
                        ) {
                          <div
                            class="absolute inset-x-0 bottom-0 h-1 bg-black/40"
                          >
                            <div
                              class="h-full bg-[#8a1c1c] transition-all duration-300"
                              [style.width.%]="getBookProgressWidth(progress)"
                            ></div>
                          </div>
                        }
                      </div>
                      <div class="flex-1 min-w-0">
                        <h3
                          class="text-[#24181b] dark:text-white font-medium text-lg line-clamp-2 mb-1"
                        >
                          {{ featured().book?.title || "Loading..." }}
                        </h3>
                        <p class="text-gray-400 text-sm">
                          {{ featured().book?.author || "Unknown Author" }}
                        </p>
                        @if (featured().book?.year) {
                          <p class="text-gray-500 text-xs mt-1">
                            {{ featured().book!.year }}
                          </p>
                        }
                      </div>
                    </div>
                  </mat-card>
                </a>
              </div>

              <!-- Featured Comic -->
              <div class="group">
                <a
                  [routerLink]="
                    featured().comic?.id
                      ? ['/books/comics', toRouteParam(featured().comic!.id)]
                      : ['/books/comics']
                  "
                  class="block"
                >
                  <mat-card
                    class="np-surface-card overflow-hidden transition-all hover:scale-[1.01]"
                  >
                    <div class="p-4 border-b border-cinema-700">
                      <span
                        class="text-xs font-bold tracking-wider text-purple-400 uppercase inline-flex items-center gap-1"
                        ><app-symbol-icon
                          name="library_books"
                          [size]="16"
                        ></app-symbol-icon>
                        Popular Comic</span
                      >
                    </div>
                    <div class="p-4 flex gap-4">
                      @if (featured().comic?.coverUrl) {
                        <div
                          class="w-24 h-36 flex-shrink-0 rounded overflow-hidden"
                        >
                          <img
                            [src]="featured().comic!.coverUrl"
                            [alt]="featured().comic!.title"
                            loading="lazy"
                            decoding="async"
                            referrerpolicy="no-referrer"
                            class="w-full h-full object-cover"
                          />
                        </div>
                      } @else {
                        <div
                          class="w-24 h-36 flex-shrink-0 bg-[#dcc4b8] dark:bg-cinema-700 rounded flex items-center justify-center"
                        >
                          <app-symbol-icon
                            name="library_books"
                            [size]="24"
                          ></app-symbol-icon>
                        </div>
                      }
                      <div class="flex-1 min-w-0">
                        <h3
                          class="text-[#24181b] dark:text-white font-medium text-lg line-clamp-2 mb-1"
                        >
                          {{ featured().comic?.title || "Loading..." }}
                        </h3>
                        <p class="text-gray-400 text-sm">
                          {{ featured().comic?.author || "Unknown Author" }}
                        </p>
                      </div>
                    </div>
                  </mat-card>
                </a>
              </div>

              <!-- Featured Manga (Auto-rotating) -->
              <div class="group relative">
                <a
                  [routerLink]="
                    featured().manga?.id
                      ? ['/books/manga', toRouteParam(featured().manga!.id)]
                      : null
                  "
                  class="block"
                >
                  <mat-card
                    class="np-surface-card overflow-hidden transition-all hover:scale-[1.01]"
                  >
                    <div class="p-4 border-b border-cinema-700">
                      <span
                        class="text-xs font-bold tracking-wider text-pink-400 uppercase inline-flex items-center gap-1"
                        ><app-symbol-icon
                          name="collections_bookmark"
                          [size]="16"
                        ></app-symbol-icon>
                        Trending Manga</span
                      >
                    </div>
                    <div class="p-4 flex gap-4">
                      @if (featured().manga?.coverUrl) {
                        <div
                          class="w-24 h-36 flex-shrink-0 rounded overflow-hidden"
                        >
                          <img
                            [src]="featured().manga!.coverUrl"
                            [alt]="featured().manga!.title"
                            loading="lazy"
                            decoding="async"
                            referrerpolicy="no-referrer"
                            class="w-full h-full object-cover transition-opacity duration-500"
                            [class.opacity-0]="isMangaChanging()"
                            [class.opacity-100]="!isMangaChanging()"
                          />
                        </div>
                      } @else {
                        <div
                          class="w-24 h-36 flex-shrink-0 bg-[#dcc4b8] dark:bg-cinema-700 rounded flex items-center justify-center"
                        >
                          <app-symbol-icon
                            name="collections_bookmark"
                            [size]="24"
                          ></app-symbol-icon>
                        </div>
                      }
                      <div class="flex-1 min-w-0">
                        <h3
                          class="text-[#24181b] dark:text-white font-medium text-lg line-clamp-2 mb-1 transition-opacity duration-500"
                          [class.opacity-0]="isMangaChanging()"
                          [class.opacity-100]="!isMangaChanging()"
                        >
                          {{ featured().manga?.title || "Loading..." }}
                        </h3>
                        @if (featured().manga?.latestChapter) {
                          <p class="text-pink-400 text-sm">
                            Ch. {{ featured().manga!.latestChapter }}
                          </p>
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
                <app-symbol-icon name="menu_book" [size]="24"></app-symbol-icon>
                <h2 class="text-2xl font-serif text-[#24181b] dark:text-white">
                  Books
                </h2>
              </div>
              <a routerLink="/books/all" mat-button color="primary">
                View All Books →
              </a>
            </div>

            @if (isBooksLoading()) {
              <div class="np-cover-grid">
                @for (i of [1, 2, 3, 4, 5, 6]; track i) {
                  <mat-card class="np-cover-card animate-pulse">
                    <div class="np-cover-media"></div>
                    <div class="np-cover-body">
                      <div
                        class="h-4 rounded bg-[#e5d2c6] dark:bg-cinema-800"
                      ></div>
                      <div
                        class="mt-2 h-3 w-2/3 rounded bg-[#e5d2c6] dark:bg-cinema-800"
                      ></div>
                    </div>
                  </mat-card>
                }
              </div>
            } @else if (books().length > 0) {
              <div class="np-cover-grid">
                @for (book of books().slice(0, 12); track book.id) {
                  <mat-card class="np-cover-card">
                    <a
                      [routerLink]="['/books/novel', book.slug]"
                      class="np-cover-link"
                    >
                      <div class="np-cover-media">
                        <img
                          [src]="getBookCover(book.slug, book.coverUrl)"
                          [alt]="book.title"
                          loading="lazy"
                          decoding="async"
                          referrerpolicy="no-referrer"
                        />
                        @if (getBookProgress(book.slug); as progress) {
                          <div
                            class="absolute inset-x-0 bottom-0 h-1 bg-black/40"
                          >
                            <div
                              class="h-full bg-[#8a1c1c] transition-all duration-300"
                              [style.width.%]="getBookProgressWidth(progress)"
                            ></div>
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
              <mat-card
                class="p-8 text-center"
                style="background: var(--bg-card); border: 1px solid var(--border-color);"
              >
                <app-symbol-icon name="menu_book" [size]="40"></app-symbol-icon>
                <p class="text-[var(--text-muted)] mt-2">
                  No books available yet
                </p>
              </mat-card>
            }
          </section>

          <!-- Light Novels Section -->
          <section>
            <div class="flex items-center justify-between mb-6">
              <div class="flex items-center gap-3">
                <app-symbol-icon name="edit_note" [size]="24"></app-symbol-icon>
                <h2 class="text-2xl font-serif text-[#24181b] dark:text-white">
                  Light Novels
                </h2>
              </div>
              <a routerLink="/books/light-novels" mat-button color="primary">
                View All Series →
              </a>
            </div>

            @if (isLightNovelsLoading()) {
              <div class="np-cover-grid">
                @for (i of [1, 2, 3, 4, 5, 6]; track i) {
                  <mat-card class="np-cover-card animate-pulse">
                    <div class="np-cover-media"></div>
                    <div class="np-cover-body">
                      <div
                        class="h-4 rounded bg-[#e5d2c6] dark:bg-cinema-800"
                      ></div>
                      <div
                        class="mt-2 h-3 w-2/3 rounded bg-[#e5d2c6] dark:bg-cinema-800"
                      ></div>
                    </div>
                  </mat-card>
                }
              </div>
            } @else if (lightNovelSeries().length > 0) {
              <div class="np-cover-grid">
                @for (
                  series of lightNovelSeries().slice(0, 12);
                  track series.seriesKey
                ) {
                  <mat-card class="np-cover-card">
                    <a
                      [routerLink]="['/books/light-novels']"
                      [queryParams]="{ q: series.seriesTitle }"
                      class="np-cover-link"
                    >
                      <div class="np-cover-media">
                        @if (series.coverUrl) {
                          <img
                            [src]="series.coverUrl"
                            [alt]="series.seriesTitle"
                            loading="lazy"
                            decoding="async"
                            referrerpolicy="no-referrer"
                          />
                        } @else {
                          <div
                            class="absolute inset-0 flex items-center justify-center"
                          >
                            <app-symbol-icon
                              name="edit_note"
                              [size]="40"
                            ></app-symbol-icon>
                          </div>
                        }
                      </div>
                      <div class="np-cover-body">
                        <div class="np-cover-title">
                          {{ series.seriesTitle }}
                        </div>
                        <div class="np-cover-meta">
                          {{ series.totalVolumes }} vol{{
                            series.totalVolumes !== 1 ? "s" : ""
                          }}
                        </div>
                      </div>
                    </a>
                  </mat-card>
                }
              </div>
            } @else {
              <mat-card
                class="p-8 text-center"
                style="background: var(--bg-card); border: 1px solid var(--border-color);"
              >
                <app-symbol-icon name="edit_note" [size]="40"></app-symbol-icon>
                <p class="text-[var(--text-muted)] mt-2">
                  No light novels available yet
                </p>
              </mat-card>
            }
          </section>

          <!-- Comics Section -->
          <section>
            <div class="flex items-center justify-between mb-6">
              <div class="flex items-center gap-3">
                <app-symbol-icon
                  name="library_books"
                  [size]="24"
                ></app-symbol-icon>
                <h2 class="text-2xl font-serif text-[#24181b] dark:text-white">
                  Comics
                </h2>
              </div>
              <a routerLink="/books/comics" mat-button color="primary">
                View All Comics →
              </a>
            </div>

            @if (isComicsLoading()) {
              <div class="np-cover-grid">
                @for (i of [1, 2, 3, 4, 5, 6]; track i) {
                  <mat-card class="np-cover-card animate-pulse">
                    <div class="np-cover-media"></div>
                    <div class="np-cover-body">
                      <div
                        class="h-4 rounded bg-[#e5d2c6] dark:bg-cinema-800"
                      ></div>
                      <div
                        class="mt-2 h-3 w-2/3 rounded bg-[#e5d2c6] dark:bg-cinema-800"
                      ></div>
                    </div>
                  </mat-card>
                }
              </div>
            } @else if (comics().length > 0) {
              <div class="np-cover-grid">
                @for (comic of comics().slice(0, 12); track comic.id) {
                  <mat-card class="np-cover-card">
                    <a
                      [routerLink]="['/books/comics', toRouteParam(comic.id)]"
                      class="np-cover-link"
                    >
                      <div class="np-cover-media">
                        @if (comic.coverUrl) {
                          <img
                            [src]="comic.coverUrl"
                            [alt]="comic.title"
                            loading="lazy"
                            decoding="async"
                            referrerpolicy="no-referrer"
                          />
                        } @else {
                          <div
                            class="absolute inset-0 flex items-center justify-center"
                          >
                            <app-symbol-icon
                              name="library_books"
                              [size]="40"
                            ></app-symbol-icon>
                          </div>
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
              <mat-card
                class="p-8 text-center"
                style="background: var(--bg-card); border: 1px solid var(--border-color);"
              >
                <app-symbol-icon
                  name="library_books"
                  [size]="40"
                ></app-symbol-icon>
                <p class="text-[var(--text-muted)] mt-2">
                  No comics available yet
                </p>
              </mat-card>
            }
          </section>

          <!-- Manga Section -->
          <section>
            <div class="flex items-center justify-between mb-6">
              <div class="flex items-center gap-3">
                <app-symbol-icon
                  name="collections_bookmark"
                  [size]="24"
                ></app-symbol-icon>
                <h2 class="text-2xl font-serif text-[#24181b] dark:text-white">
                  Manga
                </h2>
              </div>
              <a routerLink="/books/manga" mat-button color="primary">
                Open Manga Library →
              </a>
            </div>

            @if (isMangaLoading()) {
              <div class="np-cover-grid">
                @for (i of [1, 2, 3, 4, 5, 6]; track i) {
                  <mat-card class="np-cover-card animate-pulse">
                    <div class="np-cover-media"></div>
                    <div class="np-cover-body">
                      <div
                        class="h-4 rounded bg-[#e5d2c6] dark:bg-cinema-800"
                      ></div>
                      <div
                        class="mt-2 h-3 w-2/3 rounded bg-[#e5d2c6] dark:bg-cinema-800"
                      ></div>
                    </div>
                  </mat-card>
                }
              </div>
            } @else if (manga().length > 0) {
              <div class="np-cover-grid">
                @for (m of manga().slice(0, 12); track m.id) {
                  <mat-card class="np-cover-card">
                    <a
                      [routerLink]="['/books/manga', toRouteParam(m.id)]"
                      class="np-cover-link"
                    >
                      <div class="np-cover-media">
                        @if (m.coverUrl) {
                          <img
                            [src]="m.coverUrl"
                            [alt]="m.title"
                            loading="lazy"
                            decoding="async"
                            referrerpolicy="no-referrer"
                          />
                        } @else {
                          <div
                            class="absolute inset-0 flex items-center justify-center"
                          >
                            <app-symbol-icon
                              name="collections_bookmark"
                              [size]="40"
                            ></app-symbol-icon>
                          </div>
                        }
                      </div>
                      <div class="np-cover-body">
                        <div class="np-cover-title">{{ m.title }}</div>
                        <div class="np-cover-meta">
                          @if (m.latestChapter) {
                            Ch. {{ m.latestChapter }} •
                          }
                          Manga
                        </div>
                      </div>
                    </a>
                  </mat-card>
                }
              </div>
            } @else {
              <mat-card
                class="p-8 text-center"
                style="background: var(--bg-card); border: 1px solid var(--border-color);"
              >
                <app-symbol-icon
                  name="collections_bookmark"
                  [size]="40"
                ></app-symbol-icon>
                <p class="text-[var(--text-muted)] mt-2">No manga available</p>
              </mat-card>
            }
          </section>
        </div>
      </div>
    }
  `,
})
export class BookHubComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  protected pwaService = inject(PwaService);
  private destroy$ = new Subject<void>();

  // Content signals
  books = signal<Book[]>([]);
  comics = signal<ContentItem[]>([]);
  manga = signal<ContentItem[]>([]);
  lightNovelSeries = signal<LightNovelSeries[]>([]);

  // Loading states
  isBooksLoading = signal(true);
  isComicsLoading = signal(true);
  isMangaLoading = signal(true);
  isLightNovelsLoading = signal(true);

  // Featured content
  featured = signal<FeaturedContent>({ book: null, comic: null, manga: null });
  isMangaChanging = signal(false);
  bookProgressBySlug = signal<Record<string, number>>({});

  // Manga rotation
  private mangaRotationIndex = 0;
  private allTrendingManga: ContentItem[] = [];

  shelfNavItems = [
    { label: "Home", link: "/home", icon: "home", active: false },
    { label: "Browse", link: "/books", icon: "explore", active: true },
    { label: "Books", link: "/books/all", icon: "menu_book", active: false },
    {
      label: "Comics",
      link: "/books/comics",
      icon: "library_books",
      active: false,
    },
    {
      label: "Manga",
      link: "/books/manga",
      icon: "auto_stories",
      active: false,
    },
  ];

  ngOnInit() {
    this.loadBooks();
    this.loadLightNovels();
    this.loadComics();
    this.loadManga();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  useEditorialShell(): boolean {
    if (this.pwaService.isTV()) return true;
    if (typeof window === "undefined") return false;
    return window.innerWidth >= 1200;
  }

  heroItem(): ContentItem | null {
    return (
      this.featured().manga ||
      this.featured().book ||
      this.featured().comic ||
      null
    );
  }

  heroTitle(): string {
    return this.heroItem()?.title || "Reading Library";
  }

  heroDescription(): string {
    const item = this.heroItem();
    if (!item)
      return "Discover stories across books, comics, and manga in a premium shelf-first reading experience.";
    if (item.type === "book")
      return `${item.author || "Featured author"} brings a standout read to the front shelf. Dive into premium storytelling built for desktop and TV.`;
    if (item.type === "comic")
      return "A cinematic comic selection with bold art, fast updates, and immersive reading routes curated for big screens.";
    return "Explore trending manga with chapter updates, rich cover art, and a browse-first layout inspired by premium streaming interfaces.";
  }

  heroTypeLabel(): string {
    const item = this.heroItem();
    if (!item) return "Reading lounge";
    return item.type === "book"
      ? "Featured Book"
      : item.type === "comic"
        ? "Featured Comic"
        : "Featured Manga";
  }

  heroBackground(): string {
    const item = this.heroItem();
    const image =
      item?.coverUrl ||
      (item?.slug ? this.getBookCover(item.slug, item.coverUrl) : "");
    return image
      ? `url(${image})`
      : "linear-gradient(135deg, #2b0a16 0%, #10090d 55%, #040304 100%)";
  }

  heroPrimaryLink(): string[] {
    const item = this.heroItem();
    if (!item) return ["/books"];
    if (item.type === "book" && item.slug) return ["/books/novel", item.slug];
    if (item.type === "comic")
      return ["/books/comics", this.toRouteParam(item.id)];
    return ["/books/manga", this.toRouteParam(item.id)];
  }

  heroSecondaryLink(): string[] {
    const item = this.heroItem();
    if (!item) return ["/books"];
    if (item.type === "book") return ["/books/all"];
    if (item.type === "comic") return ["/books/comics"];
    return ["/books/manga"];
  }

  loadBooks() {
    this.isBooksLoading.set(true);
    this.http
      .get<{
        status: string;
        data: Book[];
        meta: PaginationMeta;
      }>("/api/v1/books?page=1&limit=20&kind=book")
      .subscribe({
        next: (response) => {
          this.books.set(response.data);
          this.loadBookProgress(response.data.map((book) => book.slug));
          // Set featured book (first one)
          if (response.data.length > 0) {
            const book = response.data[0];
            this.featured.update((f) => ({
              ...f,
              book: {
                id: book.id,
                title: book.title,
                coverUrl: book.coverUrl,
                author: book.author,
                year: book.year,
                type: "book",
                slug: book.slug,
              },
            }));
          }
          this.isBooksLoading.set(false);
        },
        error: (error) => {
          this.isBooksLoading.set(false);
        },
      });
  }

  loadLightNovels() {
    this.isLightNovelsLoading.set(true);
    this.http
      .get<{
        status: string;
        data: LightNovelSeries[];
        meta: { total: number };
      }>("/api/v1/books/light-novels?page=1&limit=12")
      .subscribe({
        next: (response) => {
          this.lightNovelSeries.set(response.data || []);
          this.isLightNovelsLoading.set(false);
        },
        error: (err) => {
          this.isLightNovelsLoading.set(false);
        },
      });
  }

  loadComics() {
    this.isComicsLoading.set(true);
    this.http
      .get<SourceDiscoverResponse>(
        "/api/v1/books/manga/source/readcomicsonline/discover?limit=20",
      )
      .subscribe({
        next: (response) => {
          const comics = response.data.trending.map((entry) => ({
            id: entry.id,
            title: entry.title,
            coverUrl: entry.coverUrl,
            author: "ReadComicsOnline",
            type: "comic" as const,
            latestChapter: entry.latestChapter ?? null,
          }));

          this.comics.set(comics);
          if (comics.length > 0) {
            const comic = comics[0];
            this.featured.update((f) => ({
              ...f,
              comic: {
                id: comic.id,
                title: comic.title,
                coverUrl: comic.coverUrl,
                author: comic.author,
                type: "comic",
                latestChapter: comic.latestChapter,
              },
            }));
          }
          this.isComicsLoading.set(false);
        },
        error: (error) => {
          this.isComicsLoading.set(false);
        },
      });
  }

  loadManga() {
    this.isMangaLoading.set(true);
    const sourceId =
      localStorage.getItem("np_manga_source")?.trim().toLowerCase() ||
      "weebcentral";

    this.http
      .get<{
        status: string;
        data: {
          trending: Array<{
            id: string;
            title: string;
            coverUrl: string | null;
            latestChapter?: string | null;
          }>;
        };
      }>(
        `/api/v1/books/manga/source/${encodeURIComponent(sourceId)}/discover?limit=20`,
      )
      .subscribe({
        next: (response) => {
          const mangaItems = response.data.trending.map((m) => ({
            id: m.id,
            title: m.title,
            coverUrl: m.coverUrl,
            type: "manga" as const,
            latestChapter: m.latestChapter,
          }));

          this.manga.set(mangaItems);
          this.allTrendingManga = mangaItems;

          // Set initial featured manga and start rotation
          if (mangaItems.length > 0) {
            this.featured.update((f) => ({ ...f, manga: mangaItems[0] }));
            this.startMangaRotation();
          }

          this.isMangaLoading.set(false);
        },
        error: (error) => {
          this.isMangaLoading.set(false);
        },
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
            this.mangaRotationIndex =
              (this.mangaRotationIndex + 1) % this.allTrendingManga.length;
            this.featured.update((f) => ({
              ...f,
              manga: this.allTrendingManga[this.mangaRotationIndex],
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
    if (!slug) return "";
    return `/api/v1/books/cover/${encodeURIComponent(slug)}`;
  }

  getBookProgress(slug?: string): number | null {
    if (!slug) return null;
    const value = this.bookProgressBySlug()[slug];
    if (typeof value !== "number" || Number.isNaN(value) || value <= 0)
      return null;
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
        .get<BookProgressResponse>(
          `/api/v1/books/progress/${encodeURIComponent(slug)}`,
        )
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
