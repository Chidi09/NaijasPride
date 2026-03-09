import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { MovieSummary } from '@naijaspride/types';
import { WatchApiService } from '../../../watch/services/watch-api.service';

interface FeaturedResponse {
  success: boolean;
  data: {
    mostWatched: MovieSummary[];
    trending?: MovieSummary[];
    latestUploads?: MovieSummary[];
    newReleases?: MovieSummary[];
    comingSoon: Array<MovieSummary & { _count?: { notifications: number } }>;
  };
}

@Component({
  selector: 'app-movies-editorial-landing',
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

    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: #0a0a0a; }
    ::-webkit-scrollbar-thumb { background: #2a0a12; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #800020; }

    .movie-card:hover .overlay-actions { opacity: 1; }
    .movie-card:hover .card-img { transform: scale(1.08); }
    .overlay-actions {
      opacity: 0;
      transition: opacity 0.25s ease;
    }
    .card-img {
      transition: transform 0.5s cubic-bezier(0.16,1,0.3,1);
    }

    .slide-btn {
      transform: translateY(14px);
      transition: transform 0.3s cubic-bezier(0.16,1,0.3,1), background 0.2s;
    }
    .movie-card:hover .slide-btn { transform: translateY(0); }
    .slide-btn-delay { transition-delay: 60ms; }

    .video-thumb:hover .play-circle { transform: scale(1.12); }
    .play-circle { transition: transform 0.2s ease; }

    .view-all-btn {
      font-size: 12px;
      font-weight: 600;
      color: #a88a78;
      background: rgba(128,0,32,0.12);
      border: 1px solid rgba(128,0,32,0.25);
      padding: 7px 16px;
      border-radius: 8px;
      text-decoration: none;
      transition: background 0.2s, color 0.2s, border-color 0.2s;
    }
    .view-all-btn:hover {
      background: rgba(128,0,32,0.28);
      color: #f9f9f2;
      border-color: #800020;
    }

    @keyframes shimmer {
      0%   { background-position: -600px 0; }
      100% { background-position:  600px 0; }
    }
    .skeleton {
      background: linear-gradient(90deg, #120a0d 25%, #1e1014 50%, #120a0d 75%);
      background-size: 1200px 100%;
      animation: shimmer 1.6s infinite;
      border-radius: 10px;
    }
  `],
  template: `
    <main style="max-width:1600px; margin:0 auto; padding:32px 24px;">

      <!-- ══════════ SECTION — STREAM CINEMA (Embed + YouTube) ══════════ -->
      <section style="margin-bottom:52px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
          <h2 style="font-size:22px; font-weight:700; letter-spacing:-0.01em; margin:0; color:#f9f9f2;">Stream Cinema</h2>
          <a routerLink="/movies/stream" class="view-all-btn">View All</a>
        </div>

        @if (isLoading() && streamOnly().length === 0) {
          <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:20px;">
            @for (i of skeletons.slice(0,4); track i) {
              <div>
                <div class="skeleton" style="aspect-ratio:16/9; width:100%;"></div>
                <div style="display:flex;gap:10px;margin-top:10px;">
                  <div class="skeleton" style="width:30px;height:30px;border-radius:50%;flex-shrink:0;"></div>
                  <div style="flex:1;">
                    <div class="skeleton" style="height:11px;width:90%;"></div>
                    <div class="skeleton" style="height:9px;width:55%;margin-top:7px;"></div>
                  </div>
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="youtube-grid">
            @for (movie of streamOnly(); track movie.id) {
              <div>
                <a [routerLink]="['/movies', movie.slug]" style="text-decoration:none;display:block;">

                  <!-- Thumbnail -->
                  <div class="video-thumb" style="position:relative;aspect-ratio:16/9;overflow:hidden;border-radius:12px;background:#120a0d;box-shadow:0 8px 24px rgba(0,0,0,0.6);">
                    @if (movie.thumbnailUrl) {
                      <img [src]="movie.thumbnailUrl" [alt]="movie.title"
                           style="width:100%;height:100%;object-fit:cover;transition:opacity 0.2s;"
                           referrerpolicy="no-referrer">
                    } @else {
                      <div style="width:100%;height:100%;background:linear-gradient(135deg,#1e1014,#120a0d);display:flex;align-items:center;justify-content:center;font-size:28px;">▶️</div>
                    }

                    <!-- Play button -->
                    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
                      <div class="play-circle" style="width:46px;height:46px;background:rgba(128,0,32,0.75);backdrop-filter:blur(6px);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(128,0,32,0.5);">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="white" style="margin-left:3px;">
                          <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.333-5.89a1.5 1.5 0 000-2.538L6.3 2.841z"/>
                        </svg>
                      </div>
                    </div>

                    <!-- Quality badge -->
                    @if (movie.quality?.[0]) {
                      <div style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.85);padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;color:#f9f9f2;letter-spacing:0.05em;">{{ movie.quality[0] }}</div>
                    }

                    <!-- Progress bar -->
                    @if (getMovieProgress(movie.id); as pct) {
                      <div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:rgba(0,0,0,0.5);">
                        <div style="height:100%;background:#800020;" [style.width.%]="pct"></div>
                      </div>
                    }
                  </div>

                  <!-- Info row -->
                  <div style="display:flex;gap:10px;margin-top:10px;align-items:flex-start;">
                    <div style="width:30px;height:30px;border-radius:50%;background:#1e1014;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;border:1px solid #5f1327;color:#a88a78;">
                      {{ getInitials(movie.title) }}
                    </div>
                    <div style="flex:1;min-width:0;">
                      <h4 style="font-size:13px;font-weight:700;margin:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.4;color:#f9f9f2;">{{ movie.title }}</h4>
                      <p style="font-size:11px;color:#a88a78;margin:4px 0 0;text-transform:uppercase;letter-spacing:0.05em;">
                        {{ movie.year }}@if (movie.genre?.[0]) { &bull; {{ movie.genre[0] }} }
                      </p>
                    </div>
                  </div>

                </a>
              </div>
            }
          </div>
        }
      </section>

      <!-- Load More -->
      <div style="display:flex;justify-content:center;padding-bottom:48px;">
        <a routerLink="/movies/stream"
           style="background:#120a0d;border:1px solid #5f1327;color:#f9f9f2;padding:12px 40px;border-radius:10px;font-weight:700;font-size:13px;text-decoration:none;transition:background 0.2s,border-color 0.2s;"
           onmouseenter="this.style.background='#1e1014';this.style.borderColor='#800020'"
           onmouseleave="this.style.background='#120a0d';this.style.borderColor='#5f1327'">
          Browse Stream Library
        </a>
      </div>

    </main>
  `,
  // Responsive grid via host styles (Tailwind doesn't work inside component styles)
  // We inject a <style> via global approach instead — use ngClass on the grids
})
export class MoviesEditorialLandingComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private watchApi = inject(WatchApiService);
  private destroy$ = new Subject<void>();

  heroMovie = signal<MovieSummary | null>(null);
  streamOnly = signal<MovieSummary[]>([]);
  downloadOnly = signal<MovieSummary[]>([]);
  movieProgressById = signal<Record<string, number>>({});
  isLoading = signal(true);

  // kept for compat
  trending = signal<MovieSummary[]>([]);
  latestUploads = signal<MovieSummary[]>([]);
  newReleases = signal<MovieSummary[]>([]);
  mostWatched = signal<MovieSummary[]>([]);
  comingSoon = signal<Array<MovieSummary & { _count?: { notifications: number } }>>([]);

  trendingDownload = computed(() => this.trending().filter((m) => !m.isStreamOnly));
  latestUploadsDownload = computed(() => this.latestUploads().filter((m) => !m.isStreamOnly));
  newReleasesDownload = computed(() => this.newReleases().filter((m) => !m.isStreamOnly));

  skeletons = [1, 2, 3, 4, 5, 6];

  ngOnInit() {
    this.loadWatchProgress();
    this.loadMovies();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadMovies() {
    this.isLoading.set(true);

    this.http.get<FeaturedResponse>('/api/v1/movies/featured').subscribe({
      next: (res) => {
        this.mostWatched.set(res.data.mostWatched);
        this.comingSoon.set(res.data.comingSoon);
        const hero = res.data.mostWatched.find((m) => !m.isStreamOnly) || res.data.mostWatched[0] || null;
        if (hero) this.heroMovie.set(hero);
        this.isLoading.set(false);
      },
      error: () => { this.isLoading.set(false); }
    });

    this.http.get<{ success: boolean; data: MovieSummary[] }>('/api/v1/movies?isStreamOnly=true&limit=6').subscribe({
      next: (res) => { this.streamOnly.set(res.data); }
    });

    this.downloadOnly.set([]);
  }

  getPosterUrl(movie: MovieSummary): string | null {
    return movie.thumbnailUrl || movie.posterUrl || movie.coverUrl || movie.backdropUrl || null;
  }

  getInitials(title: string): string {
    return (title || '?').slice(0, 2).toUpperCase();
  }

  getMovieProgress(movieId?: string): number | null {
    if (!movieId) return null;
    const v = this.movieProgressById()[movieId];
    if (typeof v !== 'number' || Number.isNaN(v) || v <= 0) return null;
    return Math.max(0, Math.min(100, v));
  }

  private loadWatchProgress() {
    this.watchApi.getWatchHistory({ page: 1, limit: 200 }).subscribe({
      next: (res) => {
        const map: Record<string, number> = {};
        for (const item of res.data || []) {
          if (!item.movie?.id || item.progressPercentage <= 0) continue;
          const b = Math.max(0, Math.min(100, item.progressPercentage));
          if (b > (map[item.movie.id] ?? 0)) map[item.movie.id] = b;
        }
        this.movieProgressById.set(map);
      },
      error: () => { this.movieProgressById.set({}); },
    });
  }
}
