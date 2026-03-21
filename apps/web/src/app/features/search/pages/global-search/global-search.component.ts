import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BookSummary, MovieSummary, MusicVideoSummary, TvShowSummary } from '@naijaspride/types';
import { PwaService } from '../../../../core/services/pwa.service';
import { SymbolIconComponent } from '../../../../shared/components/symbol-icon/symbol-icon.component';
import { TvFocusGroupDirective } from '../../../../shared/directives/tv-focus-group.directive';

type MangaResult = {
  id: string;
  title: string;
  coverUrl?: string | null;
  sourceId?: string | null;
};

type SearchSuggestion = {
  key: string;
  title: string;
  subtitle: string;
  coverUrl: string | null;
  link: string[];
};

type TvResultCard = SearchSuggestion & {
  badge: string;
};

@Component({
  selector: 'app-global-search',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SymbolIconComponent, TvFocusGroupDirective],
  template: `
    @if (pwaService.isTV()) {
      <div appTvFocusGroup [tvAutoFocus]="true" class="flex h-screen flex-col overflow-hidden bg-[#090609] text-[#f6efe8]">
        <header class="flex items-center justify-between border-b border-white/10 px-10 py-6">
          <div class="flex items-center gap-4">
            <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#800020]/20 text-[#d0a97a]">
              <app-symbol-icon name="search" [size]="28"></app-symbol-icon>
            </span>
            <div>
              <p class="text-xs uppercase tracking-[0.24em] text-[#d0a97a]">TV Search</p>
              <h1 class="text-3xl font-black text-white">Search NaijasPride</h1>
            </div>
          </div>
          <div class="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <app-symbol-icon name="account_circle" [size]="26"></app-symbol-icon>
            <span class="text-sm font-medium text-white/80">Big-screen mode</span>
          </div>
        </header>

        <main class="grid min-h-0 flex-1 grid-cols-[1.02fr,0.98fr]">
          <section class="border-r border-white/10 px-10 py-8">
            <div class="rounded-[2rem] border border-[#800020]/25 bg-white/[0.04] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
              <p class="text-[11px] uppercase tracking-[0.24em] text-white/45">Searching for</p>
              <div class="mt-3 flex items-center gap-4 rounded-[1.6rem] border border-white/10 bg-black/30 px-5 py-5">
                <app-symbol-icon name="search" [size]="28"></app-symbol-icon>
                <span class="min-h-[2.5rem] text-4xl font-black tracking-tight text-white">{{ query || 'Type with your remote' }}</span>
                <span class="h-10 w-1 animate-pulse rounded-full bg-[#d0a97a]"></span>
              </div>

              <div class="mt-8 space-y-3">
                @for (row of tvKeyboardRows; track $index) {
                  <div class="flex gap-2.5">
                    @for (key of row; track key.value) {
                      <button
                        type="button"
                        (click)="onTvKeyPress(key.value)"
                        class="flex min-h-[4.5rem] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-xl font-bold text-white transition hover:bg-[#800020]/25"
                        [class.flex-[1.4]]="key.wide"
                        [class.flex-1]="!key.wide"
                      >
                        @if (key.icon) {
                          <app-symbol-icon [name]="key.icon" [size]="24"></app-symbol-icon>
                        } @else {
                          {{ key.label }}
                        }
                      </button>
                    }
                  </div>
                }
              </div>

              <div class="mt-6 flex gap-3">
                <button type="button" (click)="clearQuery()" class="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm font-semibold uppercase tracking-[0.24em] text-white/70 transition hover:bg-white/[0.08]">Clear</button>
                <button type="button" (click)="submitTvSearch()" class="flex-1 rounded-2xl bg-[#800020] px-5 py-4 text-sm font-semibold uppercase tracking-[0.24em] text-white shadow-[0_16px_40px_rgba(128,0,32,0.35)] transition hover:bg-[#95002a]">Search</button>
              </div>
            </div>
          </section>

          <section class="min-h-0 overflow-y-auto px-10 py-8">
            <div class="mb-6 flex items-center justify-between">
              <div>
                <h2 class="text-2xl font-black text-white">Results</h2>
                <p class="mt-1 text-sm text-white/45">{{ tvResults().length }} items found</p>
              </div>
              @if (searchHint()) {
                <p class="max-w-sm text-right text-sm text-[#d0a97a]">{{ searchHint() }}</p>
              }
            </div>

            @if (loading()) {
              <div class="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 text-white/55">Searching across movies, books, manga and music...</div>
            } @else {
              <div class="grid grid-cols-2 gap-5 pb-10">
                @for (item of tvResults(); track item.key) {
                  <a [routerLink]="item.link" class="group block overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/[0.04] transition hover:bg-white/[0.06]">
                    <div class="relative aspect-video overflow-hidden bg-black/30">
                      @if (item.coverUrl) {
                        <img [src]="item.coverUrl" [alt]="item.title" class="h-full w-full object-cover transition duration-500 group-hover:scale-105" referrerpolicy="no-referrer" />
                      }
                      <div class="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent"></div>
                      <div class="absolute left-4 top-4 rounded-full bg-[#800020]/85 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-white">{{ item.badge }}</div>
                    </div>
                    <div class="space-y-1 p-4">
                      <p class="truncate text-lg font-semibold text-white">{{ item.title }}</p>
                      <p class="truncate text-sm text-white/55">{{ item.subtitle }}</p>
                    </div>
                  </a>
                }
                @if (!loading() && submitted() && tvResults().length === 0) {
                  <div class="col-span-2 rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center text-white/50">No results yet. Try a different title, artist, or keyword.</div>
                }
              </div>
            }
          </section>
        </main>

        <footer class="flex items-center gap-10 border-t border-white/10 bg-black/30 px-10 py-4 text-xs uppercase tracking-[0.22em] text-white/45">
          <span>Select with Enter</span>
          <span>Backspace deletes</span>
          <span>Use ?tv=0 to exit TV mode</span>
        </footer>
      </div>
    } @else {
    <div class="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(128,0,32,0.12),_transparent_52%),var(--bg-primary)] text-[var(--text-primary)] pb-24">
      <div class="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <div class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-sm md:p-6">
          <p class="text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Global Search</p>
          <h1 class="mt-1 text-2xl font-semibold">Find Nollywood, Bollywood, Hollywood, books, manga, and music</h1>
          <p class="mt-2 text-sm text-[var(--text-muted)]">One query searches every catalog currently indexed in NaijasPride.</p>

          <form class="mt-4 flex flex-col gap-2 sm:flex-row" (submit)="onSubmit($event)">
            <div class="relative flex-1">
              <input
                type="text"
                [(ngModel)]="query"
                (ngModelChange)="onQueryInput($event)"
                (focus)="onSearchFocus()"
                name="q"
                placeholder="Search everything..."
                class="h-12 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 outline-none transition focus:border-[#800020]"
              />

              @if (showSuggestions()) {
                <div class="absolute z-20 mt-2 max-h-[24rem] w-full overflow-y-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-2 shadow-xl">
                  @if (suggestionLoading()) {
                    <div class="p-2 text-xs text-[var(--text-muted)]">Searching...</div>
                  }

                  @if (!suggestionLoading() && suggestions().length === 0) {
                    <div class="p-2 text-xs text-[var(--text-muted)]">No quick matches.</div>
                  }

                  @for (item of suggestions(); track item.key) {
                    <a
                      [routerLink]="item.link"
                      (click)="onSuggestionClick()"
                      class="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-[var(--bg-secondary)]"
                    >
                      <div class="h-10 w-8 overflow-hidden rounded bg-[var(--bg-secondary)]">
                        @if (item.coverUrl) {
                          <img [src]="item.coverUrl" [alt]="item.title" class="h-full w-full object-cover" referrerpolicy="no-referrer" />
                        }
                      </div>
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-xs font-medium">{{ item.title }}</p>
                        <p class="truncate text-[10px] text-[var(--text-muted)]">{{ item.subtitle }}</p>
                      </div>
                    </a>
                  }
                </div>
              }
            </div>

            <button
              type="submit"
              [disabled]="loading() || !hasValidQuery"
              class="h-12 rounded-xl bg-[#800020] px-5 text-sm font-semibold text-white transition hover:bg-[#660019] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Search
            </button>
          </form>

          @if (searchHint()) {
            <p class="mt-3 text-xs text-[var(--text-muted)]">{{ searchHint() }}</p>
          }
        </div>

        @if (loading()) {
          <div class="mt-6 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 text-[var(--text-muted)]">Searching...</div>
        }

        @if (submitted() && !loading()) {
          <div class="mt-6 space-y-8">
            <section>
              <div class="mb-3 flex items-center justify-between">
                <h2 class="text-lg font-semibold">Movies</h2>
                <a routerLink="/movies" class="text-sm text-[#800020] hover:underline">Open Movies</a>
              </div>
              @if (movies().length > 0) {
                <div class="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
                  @for (movie of movies(); track movie.id) {
                    <a [routerLink]="['/movies', movie.slug || movie.id]" class="group block overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)]">
                      <div class="aspect-[2/3] overflow-hidden bg-[var(--bg-secondary)]">
                        <img [src]="movie.thumbnailUrl || movie.posterUrl || movie.coverUrl || ''" [alt]="movie.title" class="h-full w-full object-cover transition group-hover:scale-105" referrerpolicy="no-referrer" />
                      </div>
                      <div class="p-2">
                        <p class="truncate text-xs font-medium">{{ movie.title }}</p>
                        <p class="text-[10px] text-[var(--text-muted)]">{{ movie.year }}</p>
                      </div>
                    </a>
                  }
                </div>
              } @else {
                <div class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 text-sm text-[var(--text-muted)]">No movies found.</div>
              }
            </section>

            <section>
              <div class="mb-3 flex items-center justify-between">
                <h2 class="text-lg font-semibold">TV Shows</h2>
                <a routerLink="/tv-shows" class="text-sm text-[#800020] hover:underline">Browse TV Shows</a>
              </div>
              @if (tvShows().length > 0) {
                <div class="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
                  @for (show of tvShows(); track show.id) {
                    <a [routerLink]="['/tv-shows', show.slug]" class="group block overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)]">
                      <div class="aspect-[2/3] overflow-hidden bg-[var(--bg-secondary)]">
                        <img [src]="show.posterUrl || show.thumbnailUrl || ''" [alt]="show.title" class="h-full w-full object-cover transition group-hover:scale-105" referrerpolicy="no-referrer" />
                      </div>
                      <div class="p-2">
                        <p class="truncate text-xs font-medium">{{ show.title }}</p>
                        <p class="text-[10px] text-[var(--text-muted)]">{{ show.year }}</p>
                      </div>
                    </a>
                  }
                </div>
              } @else {
                <div class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 text-sm text-[var(--text-muted)]">No TV shows found.</div>
              }
            </section>

            <section>
              <div class="mb-3 flex items-center justify-between">
                <h2 class="text-lg font-semibold">Books</h2>
                <a routerLink="/books" class="text-sm text-[#800020] hover:underline">Browse Books</a>
              </div>
              @if (books().length > 0) {
                <div class="space-y-2">
                  @for (book of books(); track book.id) {
                    <a [routerLink]="['/books/novel', book.slug]" class="flex items-center gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-2">
                      <img [src]="book.coverUrl || ''" [alt]="book.title" class="h-14 w-10 rounded object-cover" referrerpolicy="no-referrer" />
                      <div class="min-w-0">
                        <p class="truncate text-sm font-medium">{{ book.title }}</p>
                        <p class="truncate text-xs text-[var(--text-muted)]">{{ book.author || 'Unknown author' }}</p>
                      </div>
                    </a>
                  }
                </div>
              } @else {
                <div class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 text-sm text-[var(--text-muted)]">No books found.</div>
              }
            </section>

            <section>
              <div class="mb-3 flex items-center justify-between">
                <h2 class="text-lg font-semibold">Manga & Comics</h2>
                <a routerLink="/books/manga" class="text-sm text-[#800020] hover:underline">Open Manga</a>
              </div>
              @if (manga().length > 0) {
                <div class="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
                  @for (item of manga(); track item.id) {
                    <a [routerLink]="['/books/manga', item.id]" class="group block overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)]">
                      <div class="aspect-[3/4] overflow-hidden bg-[var(--bg-secondary)]">
                        <img [src]="item.coverUrl || ''" [alt]="item.title" class="h-full w-full object-cover transition group-hover:scale-105" referrerpolicy="no-referrer" />
                      </div>
                      <div class="p-2">
                        <p class="truncate text-xs font-medium">{{ item.title }}</p>
                      </div>
                    </a>
                  }
                </div>
              } @else {
                <div class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 text-sm text-[var(--text-muted)]">No manga or comics found.</div>
              }
            </section>

            <section>
              <div class="mb-3 flex items-center justify-between">
                <h2 class="text-lg font-semibold">Music</h2>
                <a routerLink="/music" class="text-sm text-[#800020] hover:underline">Open Music</a>
              </div>
              @if (music().length > 0) {
                <div class="space-y-2">
                  @for (track of music(); track track.id) {
                    <a [routerLink]="['/music', track.slug]" class="flex items-center gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-2">
                      <img [src]="track.thumbnailUrl || ''" [alt]="track.title" class="h-14 w-20 rounded object-cover" referrerpolicy="no-referrer" />
                      <div class="min-w-0">
                        <p class="truncate text-sm font-medium">{{ track.title }}</p>
                        <p class="truncate text-xs text-[var(--text-muted)]">{{ track.artist }}</p>
                      </div>
                    </a>
                  }
                </div>
              } @else {
                <div class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 text-sm text-[var(--text-muted)]">No music found.</div>
              }
            </section>
          </div>
        }
      </div>
    </div>
    }
  `,
})
export class GlobalSearchComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  protected pwaService = inject(PwaService);

  query = '';
  loading = signal(false);
  submitted = signal(false);
  searchHint = signal('');

  movies = signal<MovieSummary[]>([]);
  books = signal<BookSummary[]>([]);
  music = signal<MusicVideoSummary[]>([]);
  manga = signal<MangaResult[]>([]);
  tvShows = signal<TvShowSummary[]>([]);
  suggestions = signal<SearchSuggestion[]>([]);
  suggestionLoading = signal(false);
  private suggestionRequestToken = 0;
  private suggestionTimer: ReturnType<typeof setTimeout> | null = null;

  readonly tvKeyboardRows = [
    '1234567890'.split('').map((value) => ({ label: value, value })),
    'QWERTYUIOP'.split('').map((value) => ({ label: value, value })),
    'ASDFGHJKL'.split('').map((value) => ({ label: value, value })),
    [
      { label: 'Space', value: ' ', icon: 'space_bar', wide: true },
      { label: 'Backspace', value: 'BACKSPACE', icon: 'backspace', wide: true },
    ],
  ];

  // Plain getter — this.query is a regular string (not a signal), so computed()
  // would evaluate once and never update. A getter re-evaluates on every CD cycle.
  get hasValidQuery(): boolean {
    return this.query.trim().length >= 2;
  }
  showSuggestions = computed(() => this.query.trim().length >= 2 && (this.suggestionLoading() || this.suggestions().length > 0));
  tvResults = computed<TvResultCard[]>(() => [
    ...this.movies().map((movie) => ({
      key: `movie:${movie.id}`,
      title: movie.title,
      subtitle: [movie.year, 'Movie'].filter(Boolean).join(' • '),
      coverUrl: movie.thumbnailUrl || movie.posterUrl || movie.coverUrl || null,
      link: ['/movies', movie.slug || movie.id],
      badge: 'Movie',
    })),
    ...this.tvShows().map((show) => ({
      key: `tv:${show.id}`,
      title: show.title,
      subtitle: [show.year, 'TV Show'].filter(Boolean).join(' • '),
      coverUrl: show.posterUrl || show.thumbnailUrl || null,
      link: ['/tv-shows', show.slug],
      badge: 'TV Show',
    })),
    ...this.books().map((book) => ({
      key: `book:${book.id}`,
      title: book.title,
      subtitle: book.author || 'Book',
      coverUrl: book.coverUrl || null,
      link: ['/books/novel', book.slug],
      badge: 'Book',
    })),
    ...this.manga().map((item) => ({
      key: `manga:${item.id}`,
      title: item.title,
      subtitle: 'Manga & Comics',
      coverUrl: item.coverUrl || null,
      link: ['/books/manga', item.id],
      badge: 'Manga',
    })),
    ...this.music().map((track) => ({
      key: `music:${track.id}`,
      title: track.title,
      subtitle: track.artist || 'Music',
      coverUrl: track.thumbnailUrl || null,
      link: ['/music', track.slug],
      badge: 'Music',
    })),
  ].slice(0, 16));

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const q = (params.get('q') || '').trim();
      if (q.length >= 2) {
        this.query = q;
        this.submitted.set(true);
        this.runSearch(q);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.suggestionTimer) {
      clearTimeout(this.suggestionTimer);
      this.suggestionTimer = null;
    }
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    const q = this.query.trim();
    this.suggestions.set([]);
    this.suggestionLoading.set(false);
    this.submitted.set(true);
    this.searchHint.set('');

    if (q.length < 2) {
      this.movies.set([]);
      this.tvShows.set([]);
      this.books.set([]);
      this.music.set([]);
      this.manga.set([]);
      this.searchHint.set('Type at least 2 characters to search all catalogs.');
      this.loading.set(false);
      return;
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });

    this.runSearch(q);
  }

  onQueryInput(value: string): void {
    this.query = value;
    const q = value.trim();

    if (this.suggestionTimer) {
      clearTimeout(this.suggestionTimer);
      this.suggestionTimer = null;
    }

    if (q.length < 2) {
      this.suggestions.set([]);
      this.suggestionLoading.set(false);
      return;
    }

    this.suggestionLoading.set(true);
    this.suggestionTimer = setTimeout(() => {
      this.fetchSuggestions(q);
    }, 260);
  }

  onSearchFocus(): void {
    const q = this.query.trim();
    if (q.length >= 2 && this.suggestions().length === 0 && !this.suggestionLoading()) {
      this.fetchSuggestions(q);
    }
  }

  onSuggestionClick(): void {
    this.suggestions.set([]);
    this.suggestionLoading.set(false);
  }

  onTvKeyPress(value: string): void {
    if (value === 'BACKSPACE') {
      this.query = this.query.slice(0, -1);
    } else {
      this.query += value;
    }
    this.onQueryInput(this.query);
  }

  clearQuery(): void {
    this.query = '';
    this.movies.set([]);
    this.tvShows.set([]);
    this.books.set([]);
    this.music.set([]);
    this.manga.set([]);
    this.submitted.set(false);
    this.searchHint.set('');
    this.suggestions.set([]);
  }

  submitTvSearch(): void {
    const fakeEvent = { preventDefault() {} } as Event;
    this.onSubmit(fakeEvent);
  }

  private runSearch(q: string): void {
    this.loading.set(true);

    this.http
      .get<{
        success?: boolean;
        data?: {
          movies?: MovieSummary[];
          tvShows?: TvShowSummary[];
          books?: BookSummary[];
          music?: MusicVideoSummary[];
          manga?: MangaResult[];
        };
      }>('/api/v1/search', {
        params: {
          q,
          movieLimit: '12',
          tvLimit: '8',
          bookLimit: '8',
          musicLimit: '8',
          mangaLimit: '12',
        },
      })
      .subscribe({
      next: (result) => {
        const movies = result.data?.movies || [];
        const tvShows = result.data?.tvShows || [];
        const books = result.data?.books || [];
        const music = result.data?.music || [];
        const manga = result.data?.manga || [];

        this.movies.set(movies);
        this.tvShows.set(tvShows);
        this.books.set(books);
        this.music.set(music);
        this.manga.set(manga);

        if (movies.length + tvShows.length + books.length + music.length + manga.length === 0) {
          this.searchHint.set('No matches yet. Try a different title, artist, or keyword.');
        } else {
          this.searchHint.set('');
        }
        this.loading.set(false);
      },
      error: () => {
        this.movies.set([]);
        this.tvShows.set([]);
        this.books.set([]);
        this.music.set([]);
        this.manga.set([]);
        this.searchHint.set('Search is temporarily unavailable. Please try again.');
        this.loading.set(false);
      },
    });
  }

  private fetchSuggestions(q: string): void {
    const token = ++this.suggestionRequestToken;

    this.http
      .get<{
        success?: boolean;
        data?: {
          movies?: MovieSummary[];
          books?: BookSummary[];
          music?: MusicVideoSummary[];
          manga?: MangaResult[];
        };
      }>('/api/v1/search', {
        params: {
          q,
          movieLimit: '3',
          tvLimit: '3',
          bookLimit: '2',
          musicLimit: '2',
          mangaLimit: '3',
        },
      })
      .subscribe({
        next: (result) => {
          if (token !== this.suggestionRequestToken) return;

          const movies = result.data?.movies || [];
          const tvShows = (result.data as Record<string, unknown> & { tvShows?: TvShowSummary[] })?.tvShows || [];
          const books = result.data?.books || [];
          const music = result.data?.music || [];
          const manga = result.data?.manga || [];

          const mapped: SearchSuggestion[] = [
            ...movies.map((movie) => ({
              key: `movie:${movie.id}`,
              title: movie.title,
              subtitle: `Movie${movie.year ? ` - ${movie.year}` : ''}`,
              coverUrl: movie.thumbnailUrl || movie.posterUrl || movie.coverUrl || null,
              link: ['/movies', movie.slug || movie.id],
            })),
            ...tvShows.map((show) => ({
              key: `tv:${show.id}`,
              title: show.title,
              subtitle: `TV Show${show.year ? ` - ${show.year}` : ''}`,
              coverUrl: show.posterUrl || show.thumbnailUrl || null,
              link: ['/tv-shows', show.slug],
            })),
            ...books.map((book) => ({
              key: `book:${book.id}`,
              title: book.title,
              subtitle: `Book${book.author ? ` - ${book.author}` : ''}`,
              coverUrl: book.coverUrl || null,
              link: ['/books/novel', book.slug],
            })),
            ...manga.map((item) => ({
              key: `manga:${item.id}`,
              title: item.title,
              subtitle: 'Manga/Comics',
              coverUrl: item.coverUrl || null,
              link: ['/books/manga', item.id],
            })),
            ...music.map((track) => ({
              key: `music:${track.id}`,
              title: track.title,
              subtitle: `Music${track.artist ? ` - ${track.artist}` : ''}`,
              coverUrl: track.thumbnailUrl || null,
              link: ['/music', track.slug],
            })),
          ].slice(0, 10);

          this.suggestions.set(mapped);
          this.suggestionLoading.set(false);
        },
        error: () => {
          if (token !== this.suggestionRequestToken) return;
          this.suggestions.set([]);
          this.suggestionLoading.set(false);
        },
      });
  }
}
