import { CommonModule } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { PwaService } from "../../../../core/services/pwa.service";
import { SymbolIconComponent } from "../../../../shared/components/symbol-icon/symbol-icon.component";
import { TvFocusGroupDirective } from "../../../../shared/directives/tv-focus-group.directive";

type ComicSummary = {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  status: string | null;
  latestChapter: string | null;
};

type DiscoverResponse = {
  status: string;
  data: {
    trending: ComicSummary[];
    recentlyUpdated: ComicSummary[];
    newTitles: ComicSummary[];
  };
};

type SearchResponse = {
  status: string;
  data: ComicSummary[];
};

@Component({
  selector: "app-comics-library",
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
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
              <app-symbol-icon
                name="library_books"
                [size]="24"
              ></app-symbol-icon>
            </span>
            <div class="hidden xl:block">
              <p
                class="text-sm font-semibold tracking-[0.22em] text-[#d0a97a] uppercase"
              >
                NaijasPride
              </p>
              <p class="text-xs text-white/45">Comics shelf</p>
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
              class="absolute inset-0 bg-[linear-gradient(135deg,#201117_0%,#10090d_48%,#050406_100%)]"
            ></div>
            <div
              class="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(208,169,122,0.14),transparent_24%)]"
            ></div>
            <div
              class="relative z-10 flex min-h-[72vh] max-w-5xl flex-col justify-center px-8 py-12 md:px-12 xl:px-20"
            >
              <div
                class="flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-white/55"
              >
                <span
                  class="rounded-full border border-[#d0a97a]/40 bg-[#d0a97a]/10 px-3 py-1 text-[#ecd8b7]"
                  >Comics Library</span
                >
                <span>ReadComicsOnline</span>
              </div>
              <h1
                class="mt-5 text-5xl font-black leading-[0.95] text-white md:text-7xl"
              >
                Western comics, graphic novels, and fresh issues.
              </h1>
              <p class="mt-5 max-w-2xl text-base leading-8 text-white/68">
                A shelf-first layout for desktop and TV, using your existing
                NaijasPride branding instead of the mockup palette.
              </p>

              <div
                class="mt-8 flex max-w-2xl flex-col gap-3 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md md:flex-row md:items-center"
              >
                <div
                  class="flex flex-1 items-center gap-3 rounded-2xl bg-black/20 px-4 py-3"
                >
                  <app-symbol-icon name="search" [size]="22"></app-symbol-icon>
                  <input
                    [(ngModel)]="query"
                    (keyup.enter)="search()"
                    class="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                    placeholder="Search comics"
                  />
                </div>
                <div class="flex gap-3">
                  <button
                    type="button"
                    (click)="search()"
                    class="rounded-2xl bg-[#800020] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#95002a]"
                  >
                    Search
                  </button>
                  <button
                    type="button"
                    (click)="clearSearch()"
                    class="rounded-2xl border border-white/15 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/[0.08]"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div class="space-y-12 px-8 pb-16 md:px-12 xl:px-20">
            @if (error()) {
              <div
                class="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
              >
                {{ error() }}
              </div>
            }

            <section>
              <div class="mb-5 flex items-center justify-between">
                <h2 class="text-2xl font-bold text-white">
                  {{
                    searchResults().length > 0
                      ? "Search Results"
                      : "Trending Comics"
                  }}
                </h2>
                <a
                  routerLink="/books"
                  class="text-sm font-medium text-[#d0a97a] hover:text-[#ead9bf]"
                  >Back to Books</a
                >
              </div>
              <div class="flex gap-5 overflow-x-auto pb-2">
                @for (comic of visibleComics(); track comic.id) {
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
                          : "Graphic novel"
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
      <div class="container mx-auto px-4 py-10 books-theme">
        <div class="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="font-['Cinzel'] text-3xl text-[#24181b] dark:text-white">
              Comics Library
            </h1>
            <p class="mt-2 text-sm text-[#8a756e] dark:text-gray-400">
              Powered by ReadComicsOnline.ru. Explore trending western comics
              and graphic novels.
            </p>
          </div>
          <div class="flex gap-2">
            <a mat-stroked-button color="primary" routerLink="/books/manga"
              >Manga</a
            >
            <a mat-stroked-button color="primary" routerLink="/books"
              >Back to Hub</a
            >
          </div>
        </div>

        <mat-card
          class="mb-8 p-4"
          style="background: var(--bg-card); border: 1px solid var(--border-color);"
        >
          <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
            <mat-form-field
              appearance="fill"
              floatLabel="never"
              subscriptSizing="dynamic"
              class="np-search-field w-full"
            >
              <span matPrefix class="np-search-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="11" cy="11" r="7"></circle>
                  <path d="M21 21l-4.3-4.3"></path>
                </svg>
              </span>
              <input
                matInput
                [(ngModel)]="query"
                (keyup.enter)="search()"
                aria-label="Search comics"
                placeholder="Search comics"
              />
            </mat-form-field>
            <button
              mat-flat-button
              color="primary"
              (click)="search()"
              [disabled]="isSearching()"
            >
              {{ isSearching() ? "Searching..." : "Search" }}
            </button>
            <button
              mat-stroked-button
              color="primary"
              type="button"
              (click)="clearSearch()"
            >
              Clear
            </button>
          </div>
        </mat-card>

        @if (error()) {
          <div
            class="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500"
          >
            {{ error() }}
          </div>
        }

        @if (isLoadingDiscover() || isSearching()) {
          <div class="np-cover-grid">
            @for (i of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; track i) {
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
        } @else {
          @if (searchResults().length > 0) {
            <section>
              <h2
                class="mb-4 text-xl font-serif text-[#24181b] dark:text-white"
              >
                Search Results
              </h2>
              <div class="np-cover-grid">
                @for (comic of searchResults(); track comic.id) {
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
                            <span
                              class="material-symbols-outlined text-4xl"
                              aria-hidden="true"
                              >library_books</span
                            >
                          </div>
                        }
                      </div>
                      <div class="np-cover-body">
                        <div class="np-cover-title">{{ comic.title }}</div>
                        <div class="np-cover-meta">
                          @if (comic.latestChapter) {
                            Latest: {{ comic.latestChapter }} •
                          }
                          Comics
                        </div>
                      </div>
                    </a>
                  </mat-card>
                }
              </div>
            </section>
          } @else {
            <section class="space-y-10">
              <div>
                <h2
                  class="mb-4 text-xl font-serif text-[#24181b] dark:text-white"
                >
                  Trending Comics
                </h2>
                <div class="np-cover-grid">
                  @for (comic of discoverTrending(); track comic.id) {
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
                              <span
                                class="material-symbols-outlined text-4xl"
                                aria-hidden="true"
                                >library_books</span
                              >
                            </div>
                          }
                        </div>
                        <div class="np-cover-body">
                          <div class="np-cover-title">{{ comic.title }}</div>
                          <div class="np-cover-meta">
                            @if (comic.latestChapter) {
                              Latest: {{ comic.latestChapter }} •
                            }
                            Trending
                          </div>
                        </div>
                      </a>
                    </mat-card>
                  }
                </div>
              </div>
            </section>
          }
        }
      </div>
    }
  `,
})
export class ComicsLibraryComponent {
  private readonly http = inject(HttpClient);
  protected pwaService = inject(PwaService);
  private readonly sourceId = "readcomicsonline";

  query = "";
  error = signal<string | null>(null);
  isLoadingDiscover = signal(true);
  isSearching = signal(false);
  discoverTrending = signal<ComicSummary[]>([]);
  searchResults = signal<ComicSummary[]>([]);

  shelfNavItems = [
    { label: "Home", link: "/home", icon: "home", active: false },
    { label: "Browse", link: "/books", icon: "explore", active: false },
    { label: "Books", link: "/books/all", icon: "menu_book", active: false },
    {
      label: "Comics",
      link: "/books/comics",
      icon: "library_books",
      active: true,
    },
    {
      label: "Manga",
      link: "/books/manga",
      icon: "auto_stories",
      active: false,
    },
  ];

  constructor() {
    this.loadDiscover();
  }

  useEditorialShell(): boolean {
    if (this.pwaService.isTV()) return true;
    if (typeof window === "undefined") return false;
    return window.innerWidth >= 1200;
  }

  visibleComics(): ComicSummary[] {
    return (
      this.searchResults().length > 0
        ? this.searchResults()
        : this.discoverTrending()
    ).slice(0, 14);
  }

  loadDiscover() {
    this.error.set(null);
    this.isLoadingDiscover.set(true);
    const endpoint = `/api/v1/books/manga/source/${encodeURIComponent(this.sourceId)}/discover?limit=24`;
    this.http.get<DiscoverResponse>(endpoint).subscribe({
      next: (response) => {
        this.discoverTrending.set(response.data.trending || []);
        this.isLoadingDiscover.set(false);
      },
      error: () => {
        this.error.set("Unable to load comics right now. Please try again.");
        this.isLoadingDiscover.set(false);
      },
    });
  }

  search() {
    const normalized = this.query.trim();
    if (!normalized) {
      this.searchResults.set([]);
      return;
    }

    this.error.set(null);
    this.isSearching.set(true);
    const endpoint = `/api/v1/books/manga/source/${encodeURIComponent(this.sourceId)}/search?q=${encodeURIComponent(normalized)}&limit=30`;
    this.http.get<SearchResponse>(endpoint).subscribe({
      next: (response) => {
        this.searchResults.set(response.data || []);
        this.isSearching.set(false);
      },
      error: () => {
        this.error.set("Comic search failed. Please try again.");
        this.isSearching.set(false);
      },
    });
  }

  clearSearch() {
    this.query = "";
    this.searchResults.set([]);
  }

  toRouteParam(value: string) {
    return value;
  }
}
