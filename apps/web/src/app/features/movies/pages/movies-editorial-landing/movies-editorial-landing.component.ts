import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { MovieSummary } from '@naijaspride/types';
import { MovieCardYoutubeComponent } from '../../components/movie-card-youtube/movie-card-youtube.component';
import { MovieCardComponent } from '../../components/movie-card/movie-card.component';
import { WatchApiService } from '../../../watch/services/watch-api.service';

const PlayIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
const InfoIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;
const ArrowRightIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
const DownloadIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

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
  imports: [CommonModule, RouterLink, MovieCardYoutubeComponent, MovieCardComponent],
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      --c-bg: #f5f0ea;
      --c-surface: #ffffff;
      --c-surface2: #ede6de;
      --c-text: #1a1210;
      --c-muted: #7a6457;
      --c-border: #d6c8bc;
      --c-accent: #8a1c1c;
      --c-yt: #ff0000;
      background: var(--c-bg);
      color: var(--c-text);
      font-family: 'DM Sans', 'Inter', system-ui, sans-serif;
    }

    :host-context(.dark) {
      --c-bg: #0c0b0a;
      --c-surface: #1a1816;
      --c-surface2: #111009;
      --c-text: #ede6dc;
      --c-muted: #9a8878;
      --c-border: #2e2822;
      --c-accent: #b02020;
    }

    /* scrollbars */
    .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
    .no-scrollbar::-webkit-scrollbar { display: none; }

    /* hero */
    .hero-fade { background: linear-gradient(to top, var(--c-bg) 0%, rgba(0,0,0,0) 60%); }
    .hero-side { background: linear-gradient(to right, var(--c-bg) 0%, transparent 55%); }

    /* section divider */
    .section-divider {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 0 32px;
      margin: 8px 0;
    }
    .section-divider-line {
      flex: 1;
      height: 1px;
      background: linear-gradient(to right, var(--c-border), transparent);
    }
    .section-divider-line.reverse {
      background: linear-gradient(to left, var(--c-border), transparent);
    }

    /* section header pill */
    .section-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 14px;
      border-radius: 2px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .pill-download {
      background: var(--c-accent);
      color: #fff;
    }
    .pill-yt {
      background: var(--c-yt);
      color: #fff;
    }

    /* "view all" link */
    .view-all {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--c-muted);
      transition: color 0.2s, gap 0.2s;
      text-decoration: none;
    }
    .view-all:hover { color: var(--c-accent); gap: 10px; }

    /* section bg bands */
    .band-download {
      background: var(--c-bg);
    }
    .band-yt {
      background: var(--c-surface2);
      border-top: 1px solid var(--c-border);
      border-bottom: 1px solid var(--c-border);
    }

    /* card scale on hover */
    .card-wrap { transition: transform 0.4s cubic-bezier(0.16,1,0.3,1); }
    .card-wrap:hover { transform: scale(1.04); z-index: 10; }

    /* hero btn */
    .btn-primary {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 12px 28px;
      background: var(--c-text);
      color: var(--c-bg);
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      border-radius: 2px;
      text-decoration: none;
      transition: opacity 0.2s;
    }
    .btn-primary:hover { opacity: 0.85; }
    .btn-ghost {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 12px 28px;
      background: color-mix(in srgb, var(--c-surface) 65%, transparent);
      border: 1px solid color-mix(in srgb, var(--c-border) 70%, transparent);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      color: var(--c-text);
      font-weight: 600;
      font-size: 13px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      border-radius: 2px;
      text-decoration: none;
      transition: background 0.2s;
    }
    .btn-ghost:hover { background: var(--c-surface); }

    /* skeleton loader */
    @keyframes shimmer {
      0% { background-position: -400px 0; }
      100% { background-position: 400px 0; }
    }
    .skeleton {
      background: linear-gradient(90deg, var(--c-surface2) 25%, var(--c-border) 50%, var(--c-surface2) 75%);
      background-size: 800px 100%;
      animation: shimmer 1.6s infinite;
      border-radius: 2px;
    }
  `],
  template: `
    <!-- ═══════════════════ HERO ═══════════════════ -->
    <section class="relative overflow-hidden" style="height: 82vh; min-height: 480px;">
      <div class="absolute inset-0 z-0">
        @if (heroMovie()?.backdropUrl || heroMovie()?.posterUrl || heroMovie()?.thumbnailUrl; as img) {
          <img [src]="img" alt="" class="w-full h-full object-cover" referrerpolicy="no-referrer">
        } @else {
          <div class="w-full h-full" style="background: linear-gradient(135deg, var(--c-surface2) 0%, var(--c-bg) 100%);"></div>
        }
        <div class="hero-fade absolute inset-0"></div>
        <div class="hero-side absolute inset-0"></div>
      </div>

      <div class="relative z-10 h-full flex flex-col justify-end pb-20 px-8 md:px-16 max-w-4xl">
        <!-- meta -->
        <div class="flex flex-wrap items-center gap-3 mb-4" style="font-size:11px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; opacity:0.9;">
          @if (heroMovie()?.isStreamOnly) {
            <span style="background: var(--c-yt); color:#fff; padding: 3px 10px; border-radius:2px;">YouTube</span>
          } @else {
            <span style="background: var(--c-accent); color:#fff; padding: 3px 10px; border-radius:2px;">Download</span>
          }
          @if (heroMovie()?.year) { <span style="color:var(--c-text)">{{ heroMovie()!.year }}</span> }
          @if (heroMovie()?.quality?.[0]) {
            <span style="border:1px solid var(--c-border); padding:2px 8px; border-radius:2px; color:var(--c-text)">{{ heroMovie()!.quality![0] }}</span>
          }
          @if (heroMovie()?.durationMinutes) {
            <span style="color:var(--c-muted)">{{ formatDuration(heroMovie()!.durationMinutes!) }}</span>
          }
        </div>

        <h1 style="font-family:'Playfair Display','Georgia',serif; font-weight:700; line-height:0.92; margin-bottom:20px;"
            class="text-5xl md:text-7xl" [style.color]="'var(--c-text)'">
          {{ heroMovie()?.title || 'Featured Movie' }}
        </h1>

        <div class="flex flex-wrap gap-3">
          @if (heroMovie()?.isStreamOnly && heroMovie()?.slug) {
            <a [routerLink]="['/watch', heroMovie()!.slug]" class="btn-primary">
              <span [innerHTML]="playIcon"></span> Play Now
            </a>
          }
          @if (heroMovie()?.slug) {
            <a [routerLink]="['/movies', heroMovie()!.slug]" class="btn-ghost">
              <span [innerHTML]="infoIcon"></span> More Info
            </a>
          }
        </div>
      </div>
    </section>

    <!-- ═══════════════════ SECTION A — DOWNLOAD MOVIES ═══════════════════ -->
    <section class="band-download py-10 -mt-16 relative z-10">
      <!-- Section header -->
      <div class="flex items-center justify-between px-8 md:px-16 mb-6">
        <div class="flex items-center gap-3">
          <span class="section-pill pill-download">
            <span [innerHTML]="downloadIcon"></span>
            Download Movies
          </span>
          <span style="font-family:'Playfair Display',Georgia,serif; font-size:22px; color:var(--c-text); font-weight:600;">
            Movies & TV Shows
          </span>
        </div>
        <a routerLink="/movies/downloads" class="view-all">
          View All <span [innerHTML]="arrowIcon"></span>
        </a>
      </div>

      <!-- Cards row -->
      @if (isLoading() && downloadOnly().length === 0) {
        <div class="flex gap-4 px-8 md:px-16 overflow-hidden">
          @for (i of skeletons; track i) {
            <div class="flex-shrink-0 w-[180px] md:w-[220px]">
              <div class="skeleton w-full rounded" style="aspect-ratio:2/3;"></div>
              <div class="skeleton mt-2 h-3 w-3/4 rounded"></div>
              <div class="skeleton mt-1.5 h-2.5 w-1/2 rounded"></div>
            </div>
          }
        </div>
      } @else if (downloadOnly().length > 0) {
        <div class="flex overflow-x-auto no-scrollbar pb-4 gap-4 px-8 md:px-16">
          @for (movie of downloadOnly(); track movie.id) {
            <div class="card-wrap flex-shrink-0 w-[180px] md:w-[220px]">
              <app-movie-card [movie]="movie" [progress]="getMovieProgress(movie.id)" />
            </div>
          }
          <!-- "View All" end cap -->
          <a routerLink="/movies/downloads"
             class="flex-shrink-0 w-[180px] md:w-[220px] rounded flex flex-col items-center justify-center gap-2 border border-dashed"
             style="aspect-ratio:2/3; border-color:var(--c-border); color:var(--c-muted); text-decoration:none; transition:border-color 0.2s, color 0.2s;"
             onmouseenter="this.style.borderColor='var(--c-accent)';this.style.color='var(--c-accent)'"
             onmouseleave="this.style.borderColor='var(--c-border)';this.style.color='var(--c-muted)'">
            <span [innerHTML]="arrowIcon" style="transform:scale(1.4)"></span>
            <span style="font-size:11px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase;">View All</span>
          </a>
        </div>
      }
    </section>

    <!-- ═══════════════════ DIVIDER ═══════════════════ -->
    <div style="display:flex; align-items:center; padding:0 32px; gap:16px; margin: 4px 0;">
      <div style="flex:1; height:1px; background:linear-gradient(to right, var(--c-border), transparent);"></div>
      <span style="font-size:10px; letter-spacing:0.2em; text-transform:uppercase; color:var(--c-muted); font-weight:600; white-space:nowrap;">Also on NaijasPride</span>
      <div style="flex:1; height:1px; background:linear-gradient(to left, var(--c-border), transparent);"></div>
    </div>

    <!-- ═══════════════════ SECTION B — YOUTUBE MOVIES ═══════════════════ -->
    <section class="band-yt py-10">
      <!-- Section header -->
      <div class="flex items-center justify-between px-8 md:px-16 mb-6">
        <div class="flex items-center gap-3">
          <!-- YouTube logo SVG -->
          <span class="section-pill pill-yt" style="padding:4px 10px;">
            <svg width="18" height="13" viewBox="0 0 90 63" fill="white" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
              <path d="M88.16 9.86A11.26 11.26 0 0 0 80.25 1.9C73.24 0 45 0 45 0S16.76 0 9.75 1.9A11.26 11.26 0 0 0 1.84 9.86 117.88 117.88 0 0 0 0 31.5a117.88 117.88 0 0 0 1.84 21.64 11.26 11.26 0 0 0 7.91 7.96C16.76 63 45 63 45 63s28.24 0 35.25-1.9a11.26 11.26 0 0 0 7.91-7.96A117.88 117.88 0 0 0 90 31.5a117.88 117.88 0 0 0-1.84-21.64z"/>
              <polygon points="36,45 59,31.5 36,18" fill="#ff0000"/>
            </svg>
            YouTube
          </span>
          <span style="font-family:'Playfair Display',Georgia,serif; font-size:22px; color:var(--c-text); font-weight:600;">
            Stream-Only Movies
          </span>
        </div>
        <a routerLink="/movies/stream" class="view-all">
          View All <span [innerHTML]="arrowIcon"></span>
        </a>
      </div>

      <!-- Cards row (16:9 landscape) -->
      @if (isLoading() && streamOnly().length === 0) {
        <div class="flex gap-4 px-8 md:px-16 overflow-hidden">
          @for (i of skeletons; track i) {
            <div class="flex-shrink-0 w-[260px] md:w-[320px]">
              <div class="skeleton w-full rounded" style="aspect-ratio:16/9;"></div>
              <div class="skeleton mt-2 h-3 w-3/4 rounded"></div>
              <div class="skeleton mt-1.5 h-2.5 w-1/2 rounded"></div>
            </div>
          }
        </div>
      } @else if (streamOnly().length > 0) {
        <div class="flex overflow-x-auto no-scrollbar pb-4 gap-4 px-8 md:px-16">
          @for (movie of streamOnly(); track movie.id) {
            <div class="card-wrap flex-shrink-0 w-[260px] md:w-[320px]">
              <app-movie-card-youtube [movie]="movie" [progress]="getMovieProgress(movie.id)" />
            </div>
          }
          <!-- "View All" end cap -->
          <a routerLink="/movies/stream"
             class="flex-shrink-0 w-[260px] md:w-[320px] rounded flex flex-col items-center justify-center gap-2 border border-dashed"
             style="aspect-ratio:16/9; border-color:var(--c-border); color:var(--c-muted); text-decoration:none; transition:border-color 0.2s, color 0.2s;"
             onmouseenter="this.style.borderColor='var(--c-yt)';this.style.color='var(--c-yt)'"
             onmouseleave="this.style.borderColor='var(--c-border)';this.style.color='var(--c-muted)'">
            <span [innerHTML]="arrowIcon" style="transform:scale(1.4)"></span>
            <span style="font-size:11px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase;">View All</span>
          </a>
        </div>
      }

      <!-- bottom spacer -->
      <div class="h-10"></div>
    </section>
  `,
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

  // unused signals kept for compat (computed rows were disabled)
  trending = signal<MovieSummary[]>([]);
  latestUploads = signal<MovieSummary[]>([]);
  newReleases = signal<MovieSummary[]>([]);
  mostWatched = signal<MovieSummary[]>([]);
  comingSoon = signal<Array<MovieSummary & { _count?: { notifications: number } }>>([]);

  trendingDownload = computed(() => this.trending().filter((m) => !m.isStreamOnly));
  latestUploadsDownload = computed(() => this.latestUploads().filter((m) => !m.isStreamOnly));
  newReleasesDownload = computed(() => this.newReleases().filter((m) => !m.isStreamOnly));

  skeletons = [1, 2, 3, 4, 5, 6];

  playIcon = PlayIcon;
  infoIcon = InfoIcon;
  arrowIcon = ArrowRightIcon;
  downloadIcon = DownloadIcon;

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
        const preferredHero = res.data.mostWatched.find((m) => !m.isStreamOnly) || res.data.mostWatched[0] || null;
        if (preferredHero) this.heroMovie.set(preferredHero);
        this.isLoading.set(false);
      },
      error: () => { this.isLoading.set(false); }
    });

    this.http.get<{ success: boolean; data: MovieSummary[] }>('/api/v1/movies?isStreamOnly=true&limit=6').subscribe({
      next: (res) => { this.streamOnly.set(res.data); }
    });

    this.http.get<{ success: boolean; data: MovieSummary[] }>('/api/v1/movies?isStreamOnly=false&limit=6&sortBy=latest').subscribe({
      next: (res) => {
        this.downloadOnly.set(res.data);
        if (!this.heroMovie() && res.data.length > 0) this.heroMovie.set(res.data[0]);
      },
      error: () => { this.downloadOnly.set([]); }
    });
  }

  formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
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
