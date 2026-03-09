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

/** A single row in the Recent Activity table */
interface ActivityRow {
  type: 'movie' | 'book' | 'manga';
  title: string;
  thumbnailUrl: string | null;
  meta: string;           // e.g. "Movie" or "Book"
  statusLabel: string;    // e.g. "Watching" / "Reading"
  statusColor: string;    // tailwind text colour class
  dotColor: string;       // tailwind bg colour class
  progress: number;       // 0–100
  link: string;
}

interface MangaHistoryRow {
  mangaId: string;
  chapterId: string;
  pageIndex: number;
  totalPages: number;
  isCompleted: boolean;
  title?: string | null;        // manga title (from favorite or stored mangaTitle)
  mangaTitle?: string | null;   // stored at save time
  chapterTitle?: string | null; // stored at save time
  coverUrl?: string | null;
}

@Component({
  selector: 'app-unified-library',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background: #0a0a0a;
      color: #f9f9f2;
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    }

    /* ── Glass cards ─────────────────────────────────────────────── */
    .glass-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      transition: background 0.25s, border-color 0.25s, transform 0.25s;
    }
    .glass-card:hover {
      background: rgba(255,255,255,0.06);
      border-color: rgba(128,0,32,0.35);
      transform: translateY(-4px);
    }

    /* ── Stat cards ──────────────────────────────────────────────── */
    .stat-card {
      background: #111;
      border: 1px solid #1e1e1e;
      transition: border-color 0.2s, transform 0.25s;
    }
    .stat-card:hover {
      border-color: rgba(128,0,32,0.4);
      transform: translateY(-3px);
    }

    /* ── Table ───────────────────────────────────────────────────── */
    .activity-table tr:hover td { background: rgba(255,255,255,0.03); }
    .activity-table td, .activity-table th {
      border-bottom: 1px solid #1a1a1a;
    }
    .activity-table tbody tr:last-child td { border-bottom: none; }

    /* ── Card image zoom ─────────────────────────────────────────── */
    .card-img-wrap img { transition: transform 0.5s cubic-bezier(0.16,1,0.3,1); }
    .glass-card:hover .card-img-wrap img { transform: scale(1.08); }

    /* ── Active nav accent ───────────────────────────────────────── */
    .nav-item-active {
      background: linear-gradient(90deg, rgba(128,0,32,0.18) 0%, transparent 100%);
      border-left: 3px solid #800020;
    }

    /* ── Scrollbar ───────────────────────────────────────────────── */
    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #2a0a12; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #800020; }

    @media (max-width: 1023px) {
      .page-body { padding-bottom: 88px; }
    }
  `],
  template: `
    <div class="page-body px-4 py-8 md:px-8 lg:px-10 max-w-[1400px] mx-auto">

      <!-- ── Page Header ──────────────────────────────────────────── -->
      <div class="mb-8 flex flex-col gap-1">
        <h1 class="text-3xl font-extrabold tracking-tight text-[#f9f9f2]">Your Media Universe</h1>
        <p class="text-sm text-[#a88a78] max-w-xl">
          Everything you're watching, reading and collecting — in one place.
          @if (!isLoading()) {
            You have
            <span class="text-[#800020] font-semibold">{{ watchlistCount() }} watchlisted</span>
            and
            <span class="text-[#800020] font-semibold">{{ (summary()?.bookFavCount || 0) + (summary()?.mangaFavCount || 0) }} favourite books</span>.
          }
        </p>
      </div>

      <!-- ── Stat Cards (4 col) ────────────────────────────────────── -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">

        <!-- Movie Watchlist -->
        <a routerLink="/profile" [queryParams]="{ tab: 'watchlist' }"
           class="glass-card rounded-2xl p-5 flex flex-col gap-4 group">
          <!-- Thumbnail area -->
          <div class="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-[#181818] card-img-wrap">
            @if (watchlistPreview(); as item) {
              <img [src]="item.movie.thumbnailUrl || ''" [alt]="item.movie.title"
                   class="w-full h-full object-cover opacity-80 group-hover:opacity-100"
                   referrerpolicy="no-referrer">
            } @else {
              <!-- Placeholder pattern -->
              <div class="w-full h-full flex items-center justify-center">
                <svg class="h-10 w-10 text-[#2a2a2a]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                  <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                </svg>
              </div>
            }
            <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent"></div>
            <div class="absolute top-2.5 left-2.5 bg-[#800020]/90 text-white text-[9px] font-black px-2 py-1 rounded tracking-widest uppercase">Watchlist</div>
          </div>
          <!-- Info -->
          <div>
            <div class="flex items-start justify-between">
              <h3 class="text-base font-bold text-[#f9f9f2] group-hover:text-[#c0304a] transition-colors leading-tight">Movie Watchlist</h3>
              <svg class="h-5 w-5 text-[#800020] flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
            <div class="flex items-center gap-2 mt-2">
              @if (isLoading()) {
                <div class="h-4 w-16 animate-pulse rounded bg-[#1e1e1e]"></div>
              } @else {
                <span class="px-2 py-0.5 rounded bg-white/8 text-[#f9f9f2] text-[10px] font-bold uppercase">{{ watchlistCount() }} ITEMS</span>
              }
            </div>
            <p class="text-[#a88a78] text-xs mt-2 line-clamp-1">Movies you plan to watch</p>
          </div>
        </a>

        <!-- Favourite Books -->
        <a routerLink="/books" [queryParams]="{ tab: 'favorites' }"
           class="glass-card rounded-2xl p-5 flex flex-col gap-4 group">
          <div class="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-[#181818] card-img-wrap">
            @if (readingPreview(); as book) {
              <img [src]="getBookCover(book.slug, book.coverUrl)" [alt]="book.title"
                   class="w-full h-full object-cover opacity-80 group-hover:opacity-100"
                   referrerpolicy="no-referrer">
            } @else {
              <div class="w-full h-full flex items-center justify-center">
                <svg class="h-10 w-10 text-[#2a2a2a]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                  <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
                </svg>
              </div>
            }
            <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent"></div>
          </div>
          <div>
            <div class="flex items-start justify-between">
              <h3 class="text-base font-bold text-[#f9f9f2] group-hover:text-[#c0304a] transition-colors leading-tight">Favourite Books</h3>
              <svg class="h-5 w-5 text-[#800020] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
              </svg>
            </div>
            <div class="flex items-center gap-2 mt-2">
              @if (isLoading()) {
                <div class="h-4 w-16 animate-pulse rounded bg-[#1e1e1e]"></div>
              } @else {
                <span class="px-2 py-0.5 rounded bg-white/8 text-[#f9f9f2] text-[10px] font-bold uppercase">{{ summary()?.bookFavCount || 0 }} SAVED</span>
                <span class="text-[#4a4a4a] text-[10px] font-bold uppercase">ACTIVE</span>
              }
            </div>
            <p class="text-[#a88a78] text-xs mt-2 line-clamp-1">Novels and light novels you love</p>
          </div>
        </a>

        <!-- Favourite Manga -->
        <a routerLink="/books/manga" [queryParams]="{ tab: 'favorites' }"
           class="glass-card rounded-2xl p-5 flex flex-col gap-4 group">
          <div class="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-[#181818] card-img-wrap">
            <div class="w-full h-full flex items-center justify-center">
              <svg class="h-10 w-10 text-[#2a2a2a]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
            </div>
            <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent"></div>
            <div class="absolute top-2.5 left-2.5 bg-white/15 text-white text-[9px] font-black px-2 py-1 rounded tracking-widest uppercase">Manga</div>
          </div>
          <div>
            <div class="flex items-start justify-between">
              <h3 class="text-base font-bold text-[#f9f9f2] group-hover:text-[#c0304a] transition-colors leading-tight">Favourite Manga</h3>
              <svg class="h-5 w-5 text-[#800020] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
            </div>
            <div class="flex items-center gap-2 mt-2">
              @if (isLoading()) {
                <div class="h-4 w-16 animate-pulse rounded bg-[#1e1e1e]"></div>
              } @else {
                <span class="px-2 py-0.5 rounded bg-white/8 text-[#f9f9f2] text-[10px] font-bold uppercase">{{ summary()?.mangaFavCount || 0 }} TITLES</span>
                <span class="text-[#4a4a4a] text-[10px] font-bold uppercase">{{ summary()?.chapterWatchCount || 0 }} WATCHING</span>
              }
            </div>
            <p class="text-[#a88a78] text-xs mt-2 line-clamp-1">Comics and manga you follow</p>
          </div>
        </a>

        <!-- Offline Downloads -->
        <a routerLink="/downloads"
           class="glass-card rounded-2xl p-5 flex flex-col gap-4 group">
          <div class="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-[#181818] card-img-wrap">
            <div class="w-full h-full flex items-center justify-center">
              <svg class="h-10 w-10 text-[#2a2a2a]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent"></div>
            <div class="absolute top-2.5 left-2.5 bg-white/15 text-white text-[9px] font-black px-2 py-1 rounded tracking-widest uppercase">Offline</div>
          </div>
          <div>
            <div class="flex items-start justify-between">
              <h3 class="text-base font-bold text-[#f9f9f2] group-hover:text-[#c0304a] transition-colors leading-tight">Offline Reading</h3>
              <svg class="h-5 w-5 text-[#800020] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="flex items-center gap-2 mt-2">
              @if (isLoading()) {
                <div class="h-4 w-16 animate-pulse rounded bg-[#1e1e1e]"></div>
              } @else {
                <span class="px-2 py-0.5 rounded bg-white/8 text-[#f9f9f2] text-[10px] font-bold uppercase">
                  {{ (summary()?.offlineMangaCount || 0) + (summary()?.offlineBookCount || 0) }} FILES
                </span>
              }
            </div>
            <p class="text-[#a88a78] text-xs mt-2 line-clamp-1">Downloaded books &amp; manga</p>
          </div>
        </a>

      </div>

      <!-- ── Recent Activity Table ──────────────────────────────────── -->
      <section>
        <div class="mb-5 flex items-center justify-between">
          <h2 class="text-xl font-bold text-[#f9f9f2] tracking-tight">Recent Activity</h2>
          <a routerLink="/profile" [queryParams]="{ tab: 'history' }"
             class="flex items-center gap-1.5 text-xs font-bold text-[#800020] hover:text-[#a0002a] uppercase tracking-widest transition">
            View All History
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </a>
        </div>

        <div class="rounded-2xl overflow-hidden border border-[#1a1a1a]">
          <table class="w-full text-left activity-table">
            <thead>
              <tr class="bg-white/5">
                <th class="px-5 py-4 text-[10px] font-bold text-[#4a4a4a] uppercase tracking-widest">Item</th>
                <th class="hidden sm:table-cell px-5 py-4 text-[10px] font-bold text-[#4a4a4a] uppercase tracking-widest">Type</th>
                <th class="px-5 py-4 text-[10px] font-bold text-[#4a4a4a] uppercase tracking-widest">Status</th>
                <th class="hidden md:table-cell px-5 py-4 text-[10px] font-bold text-[#4a4a4a] uppercase tracking-widest">Progress</th>
                <th class="hidden lg:table-cell px-5 py-4 text-[10px] font-bold text-[#4a4a4a] uppercase tracking-widest text-right">Go</th>
              </tr>
            </thead>
            <tbody>
              @if (isLoadingActivity()) {
                @for (i of [1,2,3,4,5]; track i) {
                  <tr>
                    <td class="px-5 py-4">
                      <div class="flex items-center gap-4">
                        <div class="h-12 w-9 animate-pulse rounded-lg bg-[#181818] flex-shrink-0"></div>
                        <div class="h-3 w-40 animate-pulse rounded bg-[#181818]"></div>
                      </div>
                    </td>
                    <td class="hidden sm:table-cell px-5 py-4"><div class="h-3 w-16 animate-pulse rounded bg-[#181818]"></div></td>
                    <td class="px-5 py-4"><div class="h-3 w-20 animate-pulse rounded bg-[#181818]"></div></td>
                    <td class="hidden md:table-cell px-5 py-4"><div class="h-1.5 w-24 animate-pulse rounded-full bg-[#181818]"></div></td>
                    <td class="hidden lg:table-cell px-5 py-4"></td>
                  </tr>
                }
              } @else if (activityRows().length === 0) {
                <tr>
                  <td colspan="5" class="px-5 py-12 text-center text-sm text-[#4a4a4a]">
                    No recent activity yet — start watching or reading!
                  </td>
                </tr>
              } @else {
                @for (row of activityRows(); track row.link) {
                  <tr class="cursor-pointer" [routerLink]="row.link">
                    <td class="px-5 py-4">
                      <div class="flex items-center gap-4">
                        <!-- Thumbnail -->
                        <div class="h-12 w-9 flex-shrink-0 overflow-hidden rounded-lg bg-[#181818]">
                          @if (row.thumbnailUrl) {
                            <img [src]="row.thumbnailUrl" [alt]="row.title"
                                 class="w-full h-full object-cover opacity-80"
                                 referrerpolicy="no-referrer">
                          } @else {
                            <div class="w-full h-full flex items-center justify-center">
                              <svg class="h-4 w-4 text-[#2a2a2a]" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z"/>
                              </svg>
                            </div>
                          }
                        </div>
                        <span class="text-sm font-semibold text-[#d4d0c8] line-clamp-1">{{ row.title }}</span>
                      </div>
                    </td>
                    <td class="hidden sm:table-cell px-5 py-4">
                      <span class="text-xs font-medium text-[#a88a78]">{{ row.meta }}</span>
                    </td>
                    <td class="px-5 py-4">
                      <div class="flex items-center gap-2">
                        <div class="h-1.5 w-1.5 rounded-full flex-shrink-0" [ngClass]="row.dotColor"></div>
                        <span class="text-xs font-semibold" [ngClass]="row.statusColor">{{ row.statusLabel }}</span>
                      </div>
                    </td>
                    <td class="hidden md:table-cell px-5 py-4">
                      @if (row.progress > 0) {
                        <div class="flex items-center gap-3">
                          <div class="flex-1 h-1.5 rounded-full bg-[#1e1e1e] max-w-[100px]">
                            <div class="h-full rounded-full bg-[#800020]" [style.width.%]="row.progress"></div>
                          </div>
                          <span class="text-[10px] text-[#a88a78] font-medium w-8">{{ row.progress | number:'1.0-0' }}%</span>
                        </div>
                      } @else {
                        <span class="text-[10px] text-[#4a4a4a]">—</span>
                      }
                    </td>
                    <td class="hidden lg:table-cell px-5 py-4 text-right">
                      <div class="flex justify-end">
                        <div class="h-8 w-8 rounded-lg border border-[#1e1e1e] flex items-center justify-center text-[#a88a78] hover:border-[#800020]/50 hover:text-[#800020] transition">
                          <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
                            <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                        </div>
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      </section>

      <!-- ── Continue Reading (books with progress) ────────────────── -->
      @if (isLoadingContinueReading() || continueReadingBooks().length > 0) {
        <section class="mt-10">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-base font-semibold text-[#f9f9f2]">Continue Reading</h2>
            <a routerLink="/books" class="text-xs font-medium text-[#800020] hover:text-[#a0002a] transition">Browse books</a>
          </div>
          <div class="flex gap-3 overflow-x-auto pb-1">
            @if (isLoadingContinueReading()) {
              @for (i of [1,2,3,4,5]; track i) {
                <div class="flex-shrink-0 w-28">
                  <div class="aspect-[2/3] animate-pulse rounded-xl bg-[#181818]"></div>
                  <div class="mt-2 h-3 w-3/4 animate-pulse rounded bg-[#181818]"></div>
                </div>
              }
            } @else {
              @for (book of continueReadingBooks(); track book.id) {
                <a [routerLink]="['/books/novel', book.slug]" class="flex-shrink-0 w-28 group">
                  <div class="relative aspect-[2/3] overflow-hidden rounded-xl bg-[#181818]">
                    <img [src]="getBookCover(book.slug, book.coverUrl)" [alt]="book.title"
                         class="h-full w-full object-cover transition group-hover:scale-105"
                         referrerpolicy="no-referrer">
                    @if (getBookProgress(book.slug); as progress) {
                      <div class="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                        <div class="h-full bg-[#800020]" [style.width.%]="getBookProgressWidth(progress)"></div>
                      </div>
                    }
                  </div>
                  <p class="mt-2 truncate text-xs font-medium text-[#f9f9f2]">{{ book.title }}</p>
                  @if (getBookProgress(book.slug); as progress) {
                    <p class="text-[10px] text-[#a88a78]">{{ progress | number:'1.0-0' }}% read</p>
                  }
                </a>
              }
            }
          </div>
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
  isLoadingMangaHistory = signal<boolean>(true);
  mangaHistory = signal<MangaHistoryRow[]>([]);

  watchlistCount = computed(() => this.profileQuery.data()?.data?.watchlist?.length || 0);

  /** First item in continue-watching — used as thumbnail for the Watchlist card */
  watchlistPreview = computed(() => this.continueWatching()[0] ?? null);

  /** First book in continue-reading — thumbnail for the Books card */
  readingPreview = computed(() => this.continueReadingBooks()[0] ?? null);

  /** Combined activity rows from watch + books + manga/comics progress */
  isLoadingActivity = computed(
    () => this.isLoadingWatchHistory() || this.isLoadingContinueReading() || this.isLoadingMangaHistory(),
  );

  activityRows = computed((): ActivityRow[] => {
    const rows: ActivityRow[] = [];

    for (const item of this.continueWatching().slice(0, 8)) {
      rows.push({
        type: 'movie',
        title: item.movie.title,
        thumbnailUrl: item.movie.thumbnailUrl,
        meta: 'Movie',
        statusLabel: item.progressPercentage >= 95 ? 'Completed' : 'Watching',
        statusColor: item.progressPercentage >= 95 ? 'text-emerald-400' : 'text-[#800020]',
        dotColor: item.progressPercentage >= 95 ? 'bg-emerald-500' : 'bg-[#800020]',
        progress: Math.round(item.progressPercentage),
        link: `/watch/${item.movie.slug || item.movie.id}`,
      });
    }

    for (const book of this.continueReadingBooks().slice(0, 5)) {
      const prog = this.bookProgressBySlug()[book.slug] ?? 0;
      rows.push({
        type: 'book',
        title: book.title,
        thumbnailUrl: this.getBookCover(book.slug, book.coverUrl),
        meta: 'Book',
        statusLabel: prog >= 95 ? 'Finished' : 'Reading',
        statusColor: prog >= 95 ? 'text-emerald-400' : 'text-sky-400',
        dotColor: prog >= 95 ? 'bg-emerald-500' : 'bg-sky-500',
        progress: Math.round(prog),
        link: `/books/novel/${book.slug}`,
      });
    }

    for (const item of this.mangaHistory().slice(0, 6)) {
      const pct = item.totalPages > 0
        ? Math.max(0, Math.min(100, Math.round(((item.pageIndex + 1) / item.totalPages) * 100)))
        : item.isCompleted
          ? 100
          : 0;

      rows.push({
        type: 'manga',
        title: item.title?.trim()
          || item.mangaTitle?.trim()
          || (item.chapterTitle?.trim() ? item.chapterTitle.trim() : null)
          || `Manga Chapter ${item.chapterId.slice(0, 8)}`,
        thumbnailUrl: item.coverUrl || null,
        meta: 'Manga / Comics',
        statusLabel: item.isCompleted || pct >= 95 ? 'Finished' : 'Reading',
        statusColor: item.isCompleted || pct >= 95 ? 'text-emerald-400' : 'text-violet-400',
        dotColor: item.isCompleted || pct >= 95 ? 'bg-emerald-500' : 'bg-violet-500',
        progress: pct,
        link: `/books/manga/${encodeURIComponent(item.mangaId)}/read/${encodeURIComponent(item.chapterId)}`,
      });
    }

    return rows;
  });

  async ngOnInit() {
    this.loadContinueWatching();
    this.loadContinueReading();
    this.loadMangaHistory();

    try {
      this.isLoading.set(true);
      const data = await this.libraryService.getSummary();
      this.summary.set(data);
    } catch {
      // summary stays null — counts show 0
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

  getBookProgressWidth(value: number): number {
    return Math.max(4, Math.min(100, value));
  }

  getBookCover(slug?: string, coverUrl?: string | null): string {
    if (coverUrl && coverUrl.trim().length > 0) return coverUrl;
    if (!slug) return '';
    return `/api/v1/books/cover/${encodeURIComponent(slug)}`;
  }

  private loadContinueWatching() {
    this.watchApi.getWatchHistory({ page: 1, limit: 12 }).subscribe({
      next: (res) => {
        const items = (res.data || []).filter((item) => item.progressPercentage > 0);
        this.continueWatching.set(items);
        this.isLoadingWatchHistory.set(false);
      },
      error: () => this.isLoadingWatchHistory.set(false),
    });
  }

  private loadContinueReading() {
    this.http.get<{ success?: boolean; data?: BookSummary[] }>('/api/v1/books', {
      params: { page: '1', limit: '12', kind: 'book' },
    }).subscribe({
      next: (res) => {
        const books = (res.data || []).slice(0, 12);
        this.loadBookProgress(books.map((b) => b.slug), (progressMap) => {
          const filtered = books.filter((b) => {
            const p = progressMap[b.slug];
            return typeof p === 'number' && p > 0;
          });
          this.continueReadingBooks.set(filtered);
          this.isLoadingContinueReading.set(false);
        });
      },
      error: () => this.isLoadingContinueReading.set(false),
    });
  }

  private loadMangaHistory() {
    this.http.get<{ status?: string; data?: MangaHistoryRow[] }>('/api/v1/books/manga/history', {
      params: { limit: '12' },
    }).subscribe({
      next: (res) => {
        const rows = (res.data || []).filter((item) => (item.pageIndex >= 0) || item.isCompleted);
        this.mangaHistory.set(rows);
        this.isLoadingMangaHistory.set(false);
      },
      error: () => {
        this.mangaHistory.set([]);
        this.isLoadingMangaHistory.set(false);
      },
    });
  }

  private loadBookProgress(slugs: string[], onDone?: (progressBySlug: Record<string, number>) => void) {
    const uniqueSlugs = Array.from(new Set(slugs.filter(Boolean))).slice(0, 20);
    if (uniqueSlugs.length === 0) { onDone?.({}); return; }

    const requests = uniqueSlugs.map((slug) =>
      this.http
        .get<BookProgressResponse>(`/api/v1/books/progress/${encodeURIComponent(slug)}`)
        .pipe(
          map((r) => ({ slug, percentage: Math.max(0, Math.min(100, r?.data?.page ?? 0)) })),
          catchError(() => of({ slug, percentage: 0 })),
        ),
    );

    forkJoin(requests).subscribe((entries) => {
      const next: Record<string, number> = {};
      for (const e of entries) {
        if (e.percentage > 0) next[e.slug] = e.percentage;
      }
      this.bookProgressBySlug.set(next);
      onDone?.(next);
    });
  }
}
