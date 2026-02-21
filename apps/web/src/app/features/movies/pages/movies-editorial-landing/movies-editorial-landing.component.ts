import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { MovieSummary } from '@naijaspride/types';
import { MovieCardYoutubeComponent } from '../../components/movie-card-youtube/movie-card-youtube.component';
import { MovieCardComponent } from '../../components/movie-card/movie-card.component';

// Icons
const PlayIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
const InfoIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;
const ChevronRightIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>`;

interface FeaturedResponse {
  success: boolean;
  data: {
    mostWatched: MovieSummary[];
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
      --movies-bg: #f6f1eb;
      --movies-surface: #ffffff;
      --movies-surface-strong: #ece3db;
      --movies-text: #1f1715;
      --movies-text-muted: #6c5a50;
      --movies-border: #d8c9bf;
      --movies-border-strong: #bca99c;
      --movies-contrast: #121212;
      background: var(--movies-bg);
      color: var(--movies-text);
      font-family: 'Space Grotesk', system-ui, sans-serif;
    }

    :host-context(.dark) {
      --movies-bg: #050505;
      --movies-surface: #1f1f1f;
      --movies-surface-strong: #121212;
      --movies-text: #e6e0d4;
      --movies-text-muted: #bcae9e;
      --movies-border: #2a2a2a;
      --movies-border-strong: #3a3a3a;
      --movies-contrast: #f4ede4;
    }

    .display-text { font-family: 'Cinzel', 'Playfair Display', Georgia, serif; font-weight: 400; letter-spacing: 0.05em; }
    .serif-text { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 400; }
    .sans-text { font-family: 'Space Grotesk', system-ui, sans-serif; font-weight: 300; }
    
    .grain-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 9999; opacity: 0.04; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E"); }
    .glass-panel { background: color-mix(in srgb, var(--movies-surface) 75%, transparent); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid color-mix(in srgb, var(--movies-border) 70%, transparent); }
    .hero-gradient { background: linear-gradient(to top, var(--movies-bg) 10%, transparent 100%); }
    .side-gradient { background: linear-gradient(to right, var(--movies-bg) 0%, transparent 100%); }
    
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: var(--movies-bg); }
    ::-webkit-scrollbar-thumb { background: #800020; }
    
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
    
    .reveal { opacity: 0; transform: translateY(30px); transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1); }
    .reveal.visible { opacity: 1; transform: translateY(0); }
    
    .movie-card { transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), z-index 0s; }
    .movie-card:hover { transform: scale(1.05); z-index: 20; }
    .movie-card .poster-overlay { opacity: 0; transition: opacity 0.3s ease; }
    .movie-card:hover .poster-overlay { opacity: 1; }
    .movie-card img { transition: opacity 0.5s ease; }
  `],
  template: `
    <!-- Hero Section -->
    <section class="relative h-[85vh] w-full overflow-hidden">
      <div class="absolute inset-0 z-0">
        @if (heroMovie()?.backdropUrl || heroMovie()?.posterUrl || heroMovie()?.thumbnailUrl; as img) {
          <img [src]="img" alt="Hero Background" class="w-full h-full object-cover opacity-60" referrerpolicy="no-referrer">
        } @else {
          <div class="w-full h-full bg-gradient-to-br from-[var(--movies-surface)] to-[var(--movies-bg)]"></div>
        }
        <div class="absolute inset-0 hero-gradient"></div>
        <div class="absolute inset-0 side-gradient w-1/2"></div>
      </div>

      <div class="relative z-10 h-full flex flex-col justify-end pb-24 px-8 md:px-16 max-w-5xl">
        <div class="reveal visible">
          <div class="flex items-center gap-4 mb-4 text-xs font-bold sans-text tracking-widest text-[var(--movies-text)] opacity-85">
            @if (heroMovie()?.isStreamOnly) {
              <span class="bg-[#4a0404] px-2 py-1 text-white rounded-sm">STREAM</span>
            }
            <span>{{ heroMovie()?.year }}</span>
            <span class="border border-[var(--movies-border-strong)] px-2 py-[2px] rounded-sm text-[10px]">{{ heroMovie()?.quality?.[0] || 'HD' }}</span>
            @if (heroMovie()?.durationMinutes) {
              <span>{{ formatDuration(heroMovie()!.durationMinutes!) }}</span>
            }
          </div>

          <h1 class="display-text text-5xl md:text-7xl lg:text-8xl text-[var(--movies-contrast)] mb-6 leading-[0.9]">
            {{ heroMovie()?.title || 'Featured Movie' }}
          </h1>

          <p class="sans-text text-lg md:text-xl text-[var(--movies-text)] opacity-90 max-w-2xl mb-8 leading-relaxed">
            {{ heroMovie()?.description || 'Experience the best of Nollywood and African cinema.' }}
          </p>

          <div class="flex flex-wrap items-center gap-4">
            @if (heroMovie()?.isStreamOnly && heroMovie()?.slug) {
              <a [routerLink]="['/watch', heroMovie()!.slug]" class="flex items-center gap-3 px-8 py-4 bg-[var(--movies-contrast)] text-[var(--movies-bg)] rounded-sm hover:opacity-90 transition-all font-bold tracking-wider">
                <span [innerHTML]="playIcon"></span>
                <span>PLAY NOW</span>
              </a>
            }
            
            @if (heroMovie()?.slug) {
              <a [routerLink]="['/movies', heroMovie()!.slug]" class="flex items-center gap-3 px-8 py-4 glass-panel text-[var(--movies-text)] rounded-sm hover:bg-[var(--movies-surface)] transition-all tracking-wider">
                <span [innerHTML]="infoIcon"></span>
                <span>MORE INFO</span>
              </a>
            }
          </div>
        </div>
      </div>
    </section>

    <!-- Content Rows -->
    <div class="relative z-20 -mt-24 md:-mt-32 pb-12">
      
      <!-- Download Library -->
      @if (downloadOnly().length > 0) {
        <div class="py-8 pl-8 md:pl-16 relative group/row">
          <div class="flex items-center justify-between mb-6 pr-8">
            <div class="flex items-center gap-2 cursor-pointer w-fit group-hover/row:text-[#800020] transition-colors">
              <h2 class="serif-text text-2xl md:text-3xl text-[var(--movies-text)]">Available to Download</h2>
              <span [innerHTML]="chevronIcon" class="opacity-0 group-hover/row:opacity-100 -translate-x-2 group-hover/row:translate-x-0 transition-all"></span>
            </div>
            <a [routerLink]="['/browse']" class="sans-text text-xs tracking-[0.18em] uppercase text-[var(--movies-text-muted)] hover:text-[#800020] transition-colors">View More</a>
          </div>

          <div class="flex overflow-x-auto no-scrollbar pb-8 pr-8 gap-4">
            @for (movie of downloadOnly(); track movie.id) {
              <div class="w-[200px] md:w-[280px] flex-shrink-0">
                <app-movie-card [movie]="movie" />
              </div>
            }
          </div>
        </div>
      }

      <!-- Trending Now — Netflix-style wide landscape cards -->
      @if (trendingDownload().length > 0) {
        <div class="py-8 pl-8 md:pl-16 relative group/row">
          <div class="flex items-center justify-between mb-6 pr-8">
            <div class="flex items-center gap-2 cursor-pointer w-fit group-hover/row:text-[#800020] transition-colors">
              <h2 class="serif-text text-2xl md:text-3xl text-[var(--movies-text)]">Trending Now</h2>
              <span [innerHTML]="chevronIcon" class="opacity-0 group-hover/row:opacity-100 -translate-x-2 group-hover/row:translate-x-0 transition-all"></span>
            </div>
            <a [routerLink]="['/browse']" class="sans-text text-xs tracking-[0.18em] uppercase text-[var(--movies-text-muted)] hover:text-[#800020] transition-colors">View More</a>
          </div>

          <div class="flex overflow-x-auto no-scrollbar pb-8 pr-8 gap-4">
            @for (movie of trendingDownload(); track movie.id; let i = $index) {
              <a [routerLink]="['/movies', movie.slug]" class="flex-shrink-0 w-[300px] md:w-[400px] group/card relative rounded-sm overflow-hidden block">
                <!-- Landscape thumbnail (16:9) -->
                <div class="aspect-video w-full relative overflow-hidden bg-[var(--movies-surface)]">
                  <img
                    [src]="movie.backdropUrl || movie.thumbnailUrl || movie.coverUrl || ''"
                    [alt]="movie.title"
                    class="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-105"
                    referrerpolicy="no-referrer"
                  />
                  <!-- Rank number -->
                  <div class="absolute bottom-0 left-0 text-[100px] font-black text-white/10 select-none pointer-events-none leading-none" style="font-family: serif; margin-left: -6px; margin-bottom: -12px">{{ i + 1 }}</div>
                  <!-- Gradient overlay -->
                  <div class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent"></div>
                  <!-- Quality badge -->
                  @if (movie.quality?.[0]) {
                    <div class="absolute top-2 right-2">
                      <span class="bg-black/70 text-white text-[10px] font-bold px-2 py-0.5 rounded-sm tracking-wider">{{ movie.quality[0] }}</span>
                    </div>
                  }
                </div>
                <!-- Info bar -->
                <div class="bg-[var(--movies-surface)] px-3 py-2.5">
                  <p class="text-[var(--movies-text)] text-sm font-semibold truncate">{{ movie.title }}</p>
                  <p class="text-[var(--movies-text-muted)] text-xs mt-0.5 sans-text">{{ movie.year }}@if (movie.genre?.[0]) { &middot; {{ movie.genre[0] }}}</p>
                </div>
              </a>
            }
          </div>
        </div>
      }

      <!-- Most Watched -->
      @if (mostWatchedDownload().length > 0) {
        <div class="py-8 pl-8 md:pl-16 relative group/row">
          <div class="flex items-center justify-between mb-6 pr-8">
            <div class="flex items-center gap-2 cursor-pointer w-fit group-hover/row:text-[#800020] transition-colors">
              <h2 class="serif-text text-2xl md:text-3xl text-[var(--movies-text)]">Most Watched</h2>
              <span [innerHTML]="chevronIcon" class="opacity-0 group-hover/row:opacity-100 -translate-x-2 group-hover/row:translate-x-0 transition-all"></span>
            </div>
            <a [routerLink]="['/browse']" class="sans-text text-xs tracking-[0.18em] uppercase text-[var(--movies-text-muted)] hover:text-[#800020] transition-colors">View More</a>
          </div>
          
          <div class="flex overflow-x-auto no-scrollbar pb-8 pr-8 gap-4">
            @for (movie of mostWatchedDownload(); track movie.id) {
              <div class="w-[200px] md:w-[280px] flex-shrink-0">
                <app-movie-card [movie]="movie" />
              </div>
            }
          </div>
        </div>
      }

      <!-- Coming Soon -->
      @if (comingSoonDownload().length > 0) {
        <div class="py-8 pl-8 md:pl-16 relative group/row">
          <div class="flex items-center justify-between mb-6 pr-8">
            <div class="flex items-center gap-2 cursor-pointer w-fit group-hover/row:text-[#800020] transition-colors">
              <h2 class="serif-text text-2xl md:text-3xl text-[var(--movies-text)]">Coming Soon</h2>
              <span [innerHTML]="chevronIcon" class="opacity-0 group-hover/row:opacity-100 -translate-x-2 group-hover/row:translate-x-0 transition-all"></span>
            </div>
            <a [routerLink]="['/browse']" class="sans-text text-xs tracking-[0.18em] uppercase text-[var(--movies-text-muted)] hover:text-[#800020] transition-colors">View More</a>
          </div>
          
          <div class="flex overflow-x-auto no-scrollbar pb-8 pr-8 gap-4">
            @for (movie of comingSoonDownload(); track movie.id) {
              <div class="w-[200px] md:w-[280px] flex-shrink-0">
                <app-movie-card [movie]="movie" />
              </div>
            }
          </div>
        </div>
      }

      <!-- Stream Only Movies -->
      @if (streamOnly().length > 0) {
        <div class="py-8 pl-8 md:pl-16 relative group/row">
          <div class="flex items-center justify-between mb-6 pr-8">
            <div class="flex items-center gap-2 cursor-pointer w-fit group-hover/row:text-[#800020] transition-colors">
              <h2 class="serif-text text-2xl md:text-3xl text-[var(--movies-text)]">Available to Stream</h2>
              <span [innerHTML]="chevronIcon" class="opacity-0 group-hover/row:opacity-100 -translate-x-2 group-hover/row:translate-x-0 transition-all"></span>
            </div>
            <a [routerLink]="['/movies/stream']" class="sans-text text-xs tracking-[0.18em] uppercase text-[var(--movies-text-muted)] hover:text-[#800020] transition-colors">View More</a>
          </div>
          
          <div class="flex overflow-x-auto no-scrollbar pb-8 pr-8 gap-4">
            @for (movie of streamOnly(); track movie.id) {
              <div class="w-[220px] md:w-[320px] flex-shrink-0">
                <app-movie-card-youtube [movie]="movie" />
              </div>
            }
          </div>
        </div>
      }
    </div>

  `,
})
export class MoviesEditorialLandingComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private destroy$ = new Subject<void>();

  // Data
  heroMovie = signal<MovieSummary | null>(null);
  trending = signal<MovieSummary[]>([]);
  mostWatched = signal<MovieSummary[]>([]);
  comingSoon = signal<Array<MovieSummary & { _count?: { notifications: number } }>>([]);
  streamOnly = signal<MovieSummary[]>([]);
  downloadOnly = signal<MovieSummary[]>([]);

  trendingDownload = computed(() => this.trending().filter((movie) => !movie.isStreamOnly));
  mostWatchedDownload = computed(() => this.mostWatched().filter((movie) => !movie.isStreamOnly));
  comingSoonDownload = computed(() => this.comingSoon().filter((movie) => !movie.isStreamOnly));
  
  // UI State
  isLoading = signal(true);
  
  // Icons
  playIcon = PlayIcon;
  infoIcon = InfoIcon;
  chevronIcon = ChevronRightIcon;

  ngOnInit() {
    this.loadMovies();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadMovies() {
    this.isLoading.set(true);
    
    // Load featured (most watched + coming soon)
    this.http.get<FeaturedResponse>('/api/v1/movies/featured').subscribe({
      next: (res) => {
        this.mostWatched.set(res.data.mostWatched);
        this.comingSoon.set(res.data.comingSoon);
        
        // Prefer download movies for hero, then fallback to stream-only.
        const preferredHero = res.data.mostWatched.find((movie) => !movie.isStreamOnly) || res.data.mostWatched[0] || null;
        if (preferredHero) {
          this.heroMovie.set(preferredHero);
        }
        
        // Set trending as first 10 most watched entries
        this.trending.set(res.data.mostWatched.slice(0, 10));
        
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      }
    });
    
    // Load stream-only movies
    this.http.get<{ success: boolean; data: MovieSummary[] }>('/api/v1/movies?isStreamOnly=true&limit=12').subscribe({
      next: (res) => {
        this.streamOnly.set(res.data);
      }
    });

    // Load download-ready (non-stream) movies for dedicated row.
    this.http.get<{ success: boolean; data: MovieSummary[] }>('/api/v1/movies?isStreamOnly=false&limit=12&sortBy=latest').subscribe({
      next: (res) => {
        this.downloadOnly.set(res.data);
        if (!this.heroMovie() && res.data.length > 0) {
          this.heroMovie.set(res.data[0]);
        }
      },
      error: () => {
        this.downloadOnly.set([]);
      }
    });
  }

  formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
}
