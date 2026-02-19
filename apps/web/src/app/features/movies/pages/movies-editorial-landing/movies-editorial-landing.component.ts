import { Component, OnInit, OnDestroy, inject, signal, computed, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { MovieSummary } from '@naijaspride/types';

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
  imports: [CommonModule, RouterLink],
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
    ::-webkit-scrollbar-thumb { background: #8a1c1c; }
    
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
        @if (heroMovie()?.backdropUrl || heroMovie()?.posterUrl; as img) {
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
      
      <!-- Trending Now -->
      @if (trending().length > 0) {
        <div class="py-8 pl-8 md:pl-16 relative group/row">
          <div class="flex items-center gap-2 mb-6 cursor-pointer w-fit group-hover/row:text-[#8a1c1c] transition-colors">
            <h2 class="serif-text text-2xl md:text-3xl text-[var(--movies-text)]">Trending Now</h2>
            <span [innerHTML]="chevronIcon" class="opacity-0 group-hover/row:opacity-100 -translate-x-2 group-hover/row:translate-x-0 transition-all"></span>
          </div>
          
          <div class="flex overflow-x-auto no-scrollbar pb-8 pr-8 gap-4">
            @for (movie of trending(); track movie.id) {
              <app-movie-card [movie]="movie" />
            }
          </div>
        </div>
      }

      <!-- Most Watched -->
      @if (mostWatched().length > 0) {
        <div class="py-8 pl-8 md:pl-16 relative group/row">
          <div class="flex items-center gap-2 mb-6 cursor-pointer w-fit group-hover/row:text-[#8a1c1c] transition-colors">
            <h2 class="serif-text text-2xl md:text-3xl text-[var(--movies-text)]">Most Watched</h2>
            <span [innerHTML]="chevronIcon" class="opacity-0 group-hover/row:opacity-100 -translate-x-2 group-hover/row:translate-x-0 transition-all"></span>
          </div>
          
          <div class="flex overflow-x-auto no-scrollbar pb-8 pr-8 gap-4">
            @for (movie of mostWatched(); track movie.id) {
              <app-movie-card [movie]="movie" />
            }
          </div>
        </div>
      }

      <!-- Coming Soon -->
      @if (comingSoon().length > 0) {
        <div class="py-8 pl-8 md:pl-16 relative group/row">
          <div class="flex items-center gap-2 mb-6 cursor-pointer w-fit group-hover/row:text-[#8a1c1c] transition-colors">
            <h2 class="serif-text text-2xl md:text-3xl text-[var(--movies-text)]">Coming Soon</h2>
            <span [innerHTML]="chevronIcon" class="opacity-0 group-hover/row:opacity-100 -translate-x-2 group-hover/row:translate-x-0 transition-all"></span>
          </div>
          
          <div class="flex overflow-x-auto no-scrollbar pb-8 pr-8 gap-4">
            @for (movie of comingSoon(); track movie.id) {
              <app-movie-card [movie]="movie" [showNotify]="true" />
            }
          </div>
        </div>
      }

      <!-- Stream Only Movies -->
      @if (streamOnly().length > 0) {
        <div class="py-8 pl-8 md:pl-16 relative group/row">
          <div class="flex items-center gap-2 mb-6 cursor-pointer w-fit group-hover/row:text-[#8a1c1c] transition-colors">
            <h2 class="serif-text text-2xl md:text-3xl text-[var(--movies-text)]">Available to Stream</h2>
            <span [innerHTML]="chevronIcon" class="opacity-0 group-hover/row:opacity-100 -translate-x-2 group-hover/row:translate-x-0 transition-all"></span>
          </div>
          
          <div class="flex overflow-x-auto no-scrollbar pb-8 pr-8 gap-4">
            @for (movie of streamOnly(); track movie.id) {
              <app-movie-card [movie]="movie" />
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
        
        // Set hero to first most watched
        if (res.data.mostWatched.length > 0) {
          this.heroMovie.set(res.data.mostWatched[0]);
        }
        
        // Set trending as first 10 most watched
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
  }

  formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
}

@Component({
  selector: 'app-movie-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styles: [`
    :host { display: block; }
    .movie-card { transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), z-index 0s; }
    .movie-card:hover { transform: scale(1.05); z-index: 20; }
    .poster-overlay { opacity: 0; transition: opacity 0.3s ease; }
    .movie-card:hover .poster-overlay { opacity: 1; }
  `],
  template: `
    <a [routerLink]="['/movies', movieValue.slug || movieValue.id]" class="movie-card relative flex-shrink-0 w-[200px] md:w-[280px] cursor-pointer mr-4">
      <div class="aspect-[2/3] w-full overflow-hidden rounded-sm relative bg-[var(--movies-surface)] border border-[var(--movies-border)]">
        @if (movieValue.posterUrl || movieValue.thumbnailUrl; as img) {
          <img [src]="img" [alt]="movieValue.title" class="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity duration-500" referrerpolicy="no-referrer">
        } @else {
          <div class="w-full h-full flex items-center justify-center text-4xl">🎬</div>
        }
        
        <!-- Stream Badge -->
        @if (movieValue.isStreamOnly) {
          <div class="absolute top-2 right-2 bg-[#4a0404] px-2 py-1 rounded-sm">
            <span class="text-[10px] font-bold tracking-wider text-white">▶ STREAM</span>
          </div>
        }
        
        <!-- Hover Overlay -->
        <div class="poster-overlay absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col justify-center items-center gap-4">
          @if (movieValue.isStreamOnly) {
            <button class="w-12 h-12 rounded-full bg-[var(--movies-contrast)] flex items-center justify-center hover:scale-110 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#000"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
          }
          <div class="flex gap-4">
            <button class="p-2 border border-[var(--movies-border-strong)] rounded-full hover:bg-[var(--movies-surface)] transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            </button>
          </div>
        </div>
      </div>

      <div class="mt-3">
        <h3 class="serif-text text-lg leading-tight text-[var(--movies-text)] truncate">{{ movieValue.title }}</h3>
        <div class="flex items-center gap-3 mt-1 text-[10px] sans-text tracking-widest text-[var(--movies-text-muted)]">
          <span>{{ movieValue.year }}</span>
          <span>•</span>
          <span>{{ movieValue.genre?.[0] || 'Movie' }}</span>
          @if (movieValue.rating) {
            <span class="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="#8a1c1c"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              {{ movieValue.rating }}%
            </span>
          }
        </div>
      </div>
    </a>
  `
})
class MovieCardComponent {
  private movieSignal = signal<MovieSummary | null>(null);
  private showNotifySignal = signal(false);
  
  @Input({ required: true }) set movie(value: MovieSummary) {
    this.movieSignal.set(value);
  }
  
  @Input() set showNotify(value: boolean) {
    this.showNotifySignal.set(value);
  }
  
  get movieValue() {
    return this.movieSignal()!;
  }
  
  get showNotifyValue() {
    return this.showNotifySignal();
  }
}
