import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { WatchApiService, WatchHistoryItem } from '../watch/services/watch-api.service';
import { BookSummary, MusicFeaturedSections, MovieSummary } from '@naijaspride/types';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <!-- Welcome Header -->
      <div class="bg-gradient-to-br from-[#800020] to-[#4a0014] px-4 py-8 text-white md:px-8 md:py-12">
        <div class="mx-auto max-w-7xl">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs uppercase tracking-[0.2em] text-white/70">{{ getGreeting() }}</p>
              <h1 class="mt-1 text-2xl font-bold md:text-3xl">{{ userName() }}</h1>
            </div>
            <div class="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold">
              {{ userInitials() }}
            </div>
          </div>
          
          <!-- Quick Actions Row -->
          <div class="mt-6 flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            <a routerLink="/movies" class="flex-shrink-0 rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm transition hover:bg-white/20">
              <svg class="mx-auto mb-1 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="2" y="2" width="20" height="20" rx="2.18" stroke-width="1.5"/>
                <line x1="7" y1="2" x2="7" y2="22" stroke-width="1.5"/>
                <line x1="17" y1="2" x2="17" y2="22" stroke-width="1.5"/>
                <line x1="2" y1="12" x2="22" y2="12" stroke-width="1.5"/>
              </svg>
              <span class="text-xs">Movies</span>
            </a>
            <a routerLink="/books" class="flex-shrink-0 rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm transition hover:bg-white/20">
              <svg class="mx-auto mb-1 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke-width="1.5"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" stroke-width="1.5"/>
                <line x1="10" y1="2" x2="10" y2="22" stroke-width="1.5"/>
              </svg>
              <span class="text-xs">Books</span>
            </a>
            <a routerLink="/music" class="flex-shrink-0 rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm transition hover:bg-white/20">
              <svg class="mx-auto mb-1 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke-width="1.5"/>
                <circle cx="12" cy="12" r="3" stroke-width="1.5"/>
                <path d="M12 2v3" stroke-width="1.5"/>
                <path d="M12 19v3" stroke-width="1.5"/>
                <path d="M2 12h3" stroke-width="1.5"/>
                <path d="M19 12h3" stroke-width="1.5"/>
              </svg>
              <span class="text-xs">Music</span>
            </a>
            <a routerLink="/search" class="flex-shrink-0 rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm transition hover:bg-white/20">
              <svg class="mx-auto mb-1 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" stroke-width="1.5"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65" stroke-width="1.5"/>
              </svg>
              <span class="text-xs">Search</span>
            </a>
            <a routerLink="/profile" class="flex-shrink-0 rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm transition hover:bg-white/20">
              <svg class="mx-auto mb-1 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke-width="1.5"/>
                <circle cx="12" cy="7" r="4" stroke-width="1.5"/>
              </svg>
              <span class="text-xs">Profile</span>
            </a>
          </div>
        </div>
      </div>

      <div class="px-4 py-6 md:px-8 md:py-8">
        <div class="mx-auto max-w-7xl space-y-8">
          
          <!-- Continue Watching -->
          @if (continueWatching().length > 0 || isLoadingContinue()) {
            <section>
              <div class="mb-4 flex items-center justify-between">
                <h2 class="text-lg font-semibold">Continue Watching</h2>
                <a routerLink="/profile" class="text-sm text-[var(--brand)]">View all</a>
              </div>
              @if (isLoadingContinue()) {
                <div class="flex gap-3 overflow-x-auto pb-2">
                  @for (i of [1,2,3,4]; track i) {
                    <div class="flex-shrink-0 w-32">
                      <div class="aspect-[2/3] animate-pulse rounded-lg bg-[var(--bg-elevated)]"></div>
                    </div>
                  }
                </div>
              } @else {
                <div class="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                  @for (item of continueWatching(); track item.id) {
                    <a [routerLink]="['/watch', item.movie.slug || item.movie.id]" class="flex-shrink-0 w-32 group">
                      <div class="relative aspect-[2/3] overflow-hidden rounded-lg">
                        <img [src]="item.movie.thumbnailUrl || ''" [alt]="item.movie.title" class="h-full w-full object-cover transition group-hover:scale-105" referrerpolicy="no-referrer">
                        <div class="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                          <div class="h-full bg-[var(--brand)]" [style.width.%]="item.progressPercentage"></div>
                        </div>
                      </div>
                      <p class="mt-2 truncate text-xs font-medium">{{ item.movie.title }}</p>
                      <p class="text-[10px] text-[var(--text-muted)]">{{ item.progressPercentage | number:'1.0-0' }}% watched</p>
                    </a>
                  }
                </div>
              }
            </section>
          }

          <!-- Recently Added Movies -->
          @if (recentMovies().length > 0) {
            <section>
              <div class="mb-4 flex items-center justify-between">
                <h2 class="text-lg font-semibold">New on NaijasPride</h2>
                <a routerLink="/movies" class="text-sm text-[var(--brand)]">See all</a>
              </div>
              <div class="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                @for (movie of recentMovies(); track movie.id) {
                  <a [routerLink]="['/movies', movie.slug]" class="flex-shrink-0 w-28 group">
                    <div class="relative aspect-[2/3] overflow-hidden rounded-lg">
                      <img [src]="movie.thumbnailUrl || ''" [alt]="movie.title" class="h-full w-full object-cover transition group-hover:scale-105" referrerpolicy="no-referrer">
                      @if (movie.isStreamOnly) {
                        <div class="absolute top-1 right-1 rounded bg-blue-600 px-1.5 py-0.5 text-[8px] font-bold text-white">STREAM</div>
                      }
                    </div>
                    <p class="mt-2 truncate text-xs font-medium">{{ movie.title }}</p>
                    <p class="text-[10px] text-[var(--text-muted)]">{{ movie.year }}</p>
                  </a>
                }
              </div>
            </section>
          }

          <!-- Featured Books -->
          <section class="grid gap-6 lg:grid-cols-2">
            <div>
              <div class="mb-4 flex items-center justify-between">
                <h2 class="text-lg font-semibold">Trending Books</h2>
                <a routerLink="/books" class="text-sm text-[var(--brand)]">Browse</a>
              </div>
              <div class="space-y-3">
                @for (book of books(); track book.id) {
                  <a [routerLink]="['/books', book.slug]" class="flex items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3 transition hover:border-[var(--brand)]">
                    <div class="h-16 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--bg-elevated)]">
                      <img [src]="book.coverUrl || ''" [alt]="book.title" class="h-full w-full object-cover" referrerpolicy="no-referrer">
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium">{{ book.title }}</p>
                      <p class="truncate text-xs text-[var(--text-muted)]">{{ book.author || 'Unknown author' }}</p>
                    </div>
                    <svg class="h-5 w-5 flex-shrink-0 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M9 5l7 7-7 7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </a>
                }
              </div>
            </div>

            <!-- Trending Music -->
            <div>
              <div class="mb-4 flex items-center justify-between">
                <h2 class="text-lg font-semibold">Trending Music</h2>
                <a routerLink="/music" class="text-sm text-[var(--brand)]">Explore</a>
              </div>
              <div class="space-y-2">
                @for (video of musicTrending(); track video.id) {
                  <a [routerLink]="['/music', video.slug]" class="flex items-center gap-3 rounded-xl p-2 transition hover:bg-[var(--bg-secondary)]">
                    <div class="relative h-14 w-20 flex-shrink-0 overflow-hidden rounded-lg">
                      <img [src]="video.thumbnailUrl || ''" [alt]="video.title" class="h-full w-full object-cover" referrerpolicy="no-referrer">
                      <div class="absolute inset-0 flex items-center justify-center bg-black/30">
                        <svg class="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </div>
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium">{{ video.title }}</p>
                      <p class="truncate text-xs text-[var(--text-muted)]">{{ video.artist }}</p>
                    </div>
                  </a>
                }
              </div>
            </div>
          </section>

          <!-- Your Lists -->
          <section>
            <h2 class="mb-4 text-lg font-semibold">Your Library</h2>
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <a routerLink="/profile" class="rounded-xl bg-gradient-to-br from-purple-600 to-purple-800 p-4 text-white">
                <svg class="mb-2 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke-width="1.5"/>
                </svg>
                <span class="text-sm font-medium">Watchlist</span>
              </a>
              <a routerLink="/profile" class="rounded-xl bg-gradient-to-br from-green-600 to-green-800 p-4 text-white">
                <svg class="mb-2 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" stroke-width="1.5"/>
                </svg>
                <span class="text-sm font-medium">Favorites</span>
              </a>
              <a routerLink="/downloads" class="rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 p-4 text-white">
                <svg class="mb-2 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" stroke-width="1.5"/>
                </svg>
                <span class="text-sm font-medium">Downloads</span>
              </a>
              <a routerLink="/books" class="rounded-xl bg-gradient-to-br from-orange-600 to-orange-800 p-4 text-white">
                <svg class="mb-2 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" stroke-width="1.5"/>
                </svg>
                <span class="text-sm font-medium">Reading</span>
              </a>
            </div>
          </section>

        </div>
      </div>
    </div>
  `,
  styles: [`
    .scrollbar-hide {
      -ms-overflow-style: none;
      scrollbar-width: none;
    }
    .scrollbar-hide::-webkit-scrollbar {
      display: none;
    }
  `]
})
export class HomeComponent implements OnInit {
  private http = inject(HttpClient);
  private watchApi = inject(WatchApiService);
  private authService = inject(AuthService);

  isLoadingContinue = signal(true);
  continueWatching = signal<WatchHistoryItem[]>([]);
  recentMovies = signal<MovieSummary[]>([]);
  books = signal<BookSummary[]>([]);
  musicTrending = signal<MusicFeaturedSections['trending']>([]);

  userName = signal('Guest');
  userInitials = signal('G');

  ngOnInit(): void {
    // Set user info
    const user = this.authService.currentUser();
    if (user) {
      this.userName.set(user.name || user.email?.split('@')[0] || 'Guest');
      this.userInitials.set(this.userName().charAt(0).toUpperCase());
    }

    // Continue watching
    this.watchApi.getWatchHistory({ page: 1, limit: 10 }).subscribe({
      next: (res) => {
        const rows = (res.data || []).filter((item) => item.progressPercentage > 0 && item.progressPercentage < 95);
        this.continueWatching.set(rows);
        this.isLoadingContinue.set(false);
      },
      error: () => this.isLoadingContinue.set(false),
    });

    // Recent movies
    this.http.get<{ success?: boolean; data?: MovieSummary[] }>('/api/v1/movies', {
      params: { page: '1', limit: '10', sortBy: 'newest' },
    }).subscribe({
      next: (res) => this.recentMovies.set((res.data || []).slice(0, 10)),
    });

    // Books
    this.http.get<{ success?: boolean; data?: BookSummary[] }>('/api/v1/books', {
      params: { page: '1', limit: '4', kind: 'book' },
    }).subscribe({
      next: (res) => this.books.set((res.data || []).slice(0, 4)),
    });

    // Music
    this.http.get<{ success: boolean; data: MusicFeaturedSections }>('/api/v1/music/featured').subscribe({
      next: (res) => this.musicTrending.set((res.data?.trending || []).slice(0, 5)),
    });
  }

  getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }
}
