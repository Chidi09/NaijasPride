import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { BookSummary, MovieSummary, MusicVideoSummary } from '@naijaspride/types';

type MangaResult = {
  id: string;
  title: string;
  coverUrl?: string | null;
  sourceId?: string | null;
};

@Component({
  selector: 'app-global-search',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(128,0,32,0.12),_transparent_52%),var(--bg-primary)] text-[var(--text-primary)] pb-24">
      <div class="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <div class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-sm md:p-6">
          <p class="text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Global Search</p>
          <h1 class="mt-1 text-2xl font-semibold">Find Nollywood, Bollywood, Hollywood, books, manga, and music</h1>
          <p class="mt-2 text-sm text-[var(--text-muted)]">One query searches every catalog currently indexed in NaijasPride.</p>

          <form class="mt-4 flex flex-col gap-2 sm:flex-row" (submit)="onSubmit($event)">
            <input
              type="text"
              [(ngModel)]="query"
              name="q"
              placeholder="Search everything..."
              class="h-12 flex-1 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 outline-none transition focus:border-[#800020]"
            />
            <button
              type="submit"
              [disabled]="loading() || !hasValidQuery()"
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
                <a routerLink="/movies/downloads" class="text-sm text-[#800020] hover:underline">Open Downloads</a>
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
  `,
})
export class GlobalSearchComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  query = '';
  loading = signal(false);
  submitted = signal(false);
  searchHint = signal('');

  movies = signal<MovieSummary[]>([]);
  books = signal<BookSummary[]>([]);
  music = signal<MusicVideoSummary[]>([]);
  manga = signal<MangaResult[]>([]);

  hasValidQuery = computed(() => this.query.trim().length >= 2);

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

  onSubmit(event: Event): void {
    event.preventDefault();
    const q = this.query.trim();
    this.submitted.set(true);
    this.searchHint.set('');

    if (q.length < 2) {
      this.movies.set([]);
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

  private runSearch(q: string): void {
    this.loading.set(true);

    forkJoin({
      movies: this.http
        .get<{ success?: boolean; data?: MovieSummary[] }>('/api/v1/movies', {
          params: { q, page: '1', limit: '12', sortBy: 'popular' },
        })
        .pipe(catchError(() => of({ data: [] }))),
      books: this.http
        .get<{ status?: string; data?: BookSummary[] }>('/api/v1/books', {
          params: { q, page: '1', limit: '8' },
        })
        .pipe(catchError(() => of({ data: [] }))),
      music: this.http
        .get<{ success?: boolean; videos?: MusicVideoSummary[] }>('/api/v1/music', {
          params: { q, page: '1', limit: '8' },
        })
        .pipe(catchError(() => of({ videos: [] }))),
      manga: this.http
        .get<{ status?: string; data?: MangaResult[] }>('/api/v1/books/manga/search', {
          params: { q, limit: '12' },
        })
        .pipe(catchError(() => of({ data: [] }))),
    }).subscribe({
      next: (result) => {
        this.movies.set(result.movies.data || []);
        this.books.set(result.books.data || []);
        this.music.set(result.music.videos || []);
        this.manga.set(result.manga.data || []);
        if ((result.movies.data || []).length + (result.books.data || []).length + (result.music.videos || []).length + (result.manga.data || []).length === 0) {
          this.searchHint.set('No matches yet. Try a different title, artist, or keyword.');
        } else {
          this.searchHint.set('');
        }
        this.loading.set(false);
      },
      error: () => {
        this.movies.set([]);
        this.books.set([]);
        this.music.set([]);
        this.manga.set([]);
        this.searchHint.set('Search is temporarily unavailable. Please try again.');
        this.loading.set(false);
      },
    });
  }
}
