import { Component, effect, inject, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { MoviesQueryService } from '../../services/movies-query.service';
import { ProfileQueryService } from '../../../profile/services/profile-query.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { Quality, Movie } from '@naijaspride/types';

@Component({
  selector: 'app-movie-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (query.isPending()) {
      <div class="animate-pulse">
        <div class="h-[400px] bg-cinema-800 w-full mb-8"></div>
        <div class="container mx-auto px-4">
          <div class="h-8 bg-cinema-800 w-1/3 mb-4"></div>
          <div class="h-4 bg-cinema-800 w-1/2 mb-8"></div>
        </div>
      </div>
    }

    @if (query.isError()) {
      <div class="container mx-auto px-4 py-20 text-center">
        <h2 class="text-2xl font-serif font-bold text-white">Movie not found</h2>
        <a routerLink="/movies" class="text-cinema-500 hover:text-cinema-100 mt-4 block">← Back to Movies</a>
      </div>
    }

    @if (query.isSuccess(); as success) {
      @if (query.data()?.data; as movie) {
        
        <div class="relative w-full bg-cinema-900 text-white overflow-hidden mb-8">
          
          <div 
            class="absolute inset-0 bg-cover bg-center opacity-20 blur-xl scale-110"
            [style.backgroundImage]="'url(' + (movie.coverUrl || movie.thumbnailUrl) + ')'"
          ></div>
          <div class="absolute inset-0 bg-gradient-to-t from-cinema-900 via-cinema-900/60 to-transparent"></div>

          <div class="relative container mx-auto px-4 py-12 md:py-20 flex flex-col md:flex-row gap-8 items-center md:items-end">
            
            <div class="w-48 md:w-64 flex-shrink-0 rounded-sm shadow-2xl overflow-hidden border-2 border-white/10">
              <img [src]="movie.thumbnailUrl" [alt]="movie.title" class="w-full h-auto">
            </div>

            <div class="flex-grow text-center md:text-left space-y-4">
              <div class="flex flex-wrap gap-2 justify-center md:justify-start">
                @if (movie.metadata?.nollywood) {
                  <span class="bg-cinema-500 text-white text-xs font-bold px-2 py-1 rounded-sm">Nollywood</span>
                }
                <span class="bg-white/10 text-white text-xs font-bold px-2 py-1 rounded-sm">{{ movie.year }}</span>
                <span class="bg-green-500/20 text-green-400 text-xs font-bold px-2 py-1 rounded-sm">{{ movie.rating }}% Match</span>
                @if (movie.isStreamOnly) {
                  <span class="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-sm">STREAM ONLY</span>
                }
              </div>

              <h1 class="text-3xl md:text-5xl font-serif font-bold leading-tight">{{ movie.title }}</h1>
              
              <div class="text-gray-400 text-sm md:text-base flex flex-wrap gap-x-4 gap-y-1 justify-center md:justify-start">
                <span>{{ getDuration(movie.durationMinutes) }}</span>
                <span>•</span>
                <span>{{ movie.genre.join(', ') }}</span>
                <span>•</span>
                <span>{{ movie.language }}</span>
              </div>

              <!-- Action Buttons -->
              <div class="flex flex-wrap gap-3 pt-4">
                @if (movie.youtubeId) {
                  <a 
                    [routerLink]="['/watch', slug()]" 
                    class="inline-flex items-center gap-2 bg-white text-cinema-900 px-6 py-3 rounded-full font-bold hover:bg-gray-100 transition-colors"
                  >
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                    Watch Stream
                  </a>
                }
                
                @if (auth.currentUser()) {
                  <button 
                    (click)="toggleWatchlist()"
                    [disabled]="watchlistMutation.isPending()"
                    class="inline-flex items-center gap-2 border border-white/30 text-white px-6 py-3 rounded-full font-bold hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    @if (watchlistMutation.isPending()) {
                      <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    } @else {
                      <svg class="w-5 h-5" [class.text-red-500]="isInWatchlist(movie.id)" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd" />
                      </svg>
                    }
                    {{ isInWatchlist(movie.id) ? 'In Watchlist' : 'Add to Watchlist' }}
                  </button>
                }
              </div>
            </div>
          </div>
        </div>

        <div class="container mx-auto px-4 pb-20 grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div class="lg:col-span-2 space-y-8">
            <section>
              <h3 class="text-xl font-serif font-bold text-white mb-3">Synopsis</h3>
              <p class="text-gray-400 leading-relaxed">{{ movie.description || 'No description available.' }}</p>
            </section>

            <section class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 class="font-bold text-white mb-2">Director</h4>
                <p class="text-gray-500">{{ movie.metadata?.director || 'Unknown' }}</p>
              </div>
              <div>
                <h4 class="font-bold text-white mb-2">Cast</h4>
                <div class="flex flex-wrap gap-2">
                  @for (actor of movie.metadata?.cast || []; track actor) {
                    <span class="bg-cinema-800 text-gray-300 text-sm px-3 py-1 rounded-sm">{{ actor }}</span>
                  }
                </div>
              </div>
            </section>
          </div>

          <div class="lg:col-span-1">
            <div class="bg-cinema-800/50 backdrop-blur-sm border border-white/5 p-6 sticky top-24">
              @if (movie.isStreamOnly) {
                <!-- Stream Only Card -->
                <div class="text-center py-6">
                  <div class="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg class="w-8 h-8 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                  </div>
                  <h3 class="text-lg font-serif font-bold text-white mb-2">Stream Only</h3>
                  <p class="text-gray-400 text-sm mb-4">This movie is available for streaming only.</p>
                  @if (movie.youtubeId) {
                    <a 
                      [routerLink]="['/watch', slug()]" 
                      class="inline-block bg-cinema-500 hover:bg-cinema-400 text-white font-bold px-6 py-3 rounded-full transition-colors w-full"
                    >
                      ▶ Watch Now
                    </a>
                  }
                </div>
              } @else {
                <!-- Download Options Card -->
                <h3 class="text-lg font-serif font-bold text-white mb-4 flex items-center gap-2">
                  <svg class="w-5 h-5 text-cinema-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                  </svg>
                  Download Options
                </h3>

                <div class="space-y-3">
                  @for (q of movie.quality; track q) {
                    <div class="flex items-center justify-between p-3 rounded-sm border border-white/10 hover:border-cinema-500/50 hover:bg-cinema-500/10 transition-colors group">
                      <div>
                        <div class="font-bold text-white">{{ q }}</div>
                        <div class="text-xs text-gray-500">
                          {{ getFileSize(movie.fileSizes, q) }}
                        </div>
                      </div>
                      
                      <a 
                        [href]="movie.fileUrls[q]" 
                        target="_blank"
                        class="bg-cinema-500 hover:bg-cinema-400 text-white text-xs font-bold px-4 py-2 rounded-sm transition-colors"
                      >
                        Download
                      </a>
                    </div>
                  }
                </div>

                <div class="mt-6 pt-4 border-t border-white/5 text-center">
                   <p class="text-xs text-gray-500 mb-2">Premium Quality Downloads</p>
                   <div class="flex justify-center gap-4 text-gray-600 text-xs">
                      <span>🔒 Secure</span>
                      <span>⚡ Fast</span>
                      <span>🎬 4K</span>
                   </div>
                </div>
              }
            </div>
          </div>

        </div>
      }
    }
  `
})
export class MovieDetailComponent {
  slug = input.required<string>();
  
  private moviesService = inject(MoviesQueryService);
  private profileService = inject(ProfileQueryService);
  private meta = inject(Meta);
  private title = inject(Title);
  auth = inject(AuthService);
  
  query = this.moviesService.getMovieDetailQuery(this.slug);
  watchlistMutation = this.profileService.toggleWatchlistMutation();
  profileQuery = this.profileService.getProfileQuery();

  constructor() {
    // Automatically update SEO tags when data arrives
    effect(() => {
      const movie = this.query.data()?.data;
      if (movie) {
        // 1. Browser Title
        this.title.setTitle(`${movie.title} (${movie.year}) | NaijasPride`);

        // 2. OpenGraph (Facebook/WhatsApp)
        this.meta.updateTag({ property: 'og:title', content: movie.title });
        this.meta.updateTag({ property: 'og:description', content: movie.description || 'Watch now on NaijasPride.' });
        this.meta.updateTag({ property: 'og:image', content: movie.thumbnailUrl || '' });
        this.meta.updateTag({ property: 'og:url', content: `https://naijaspride.com/movies/${movie.slug}` });
        this.meta.updateTag({ property: 'og:type', content: 'video.movie' });

        // 3. Twitter Card
        this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
        this.meta.updateTag({ name: 'twitter:title', content: movie.title });
        this.meta.updateTag({ name: 'twitter:description', content: movie.description || '' });
        this.meta.updateTag({ name: 'twitter:image', content: movie.thumbnailUrl || '' });
      }
    });
  }

  isInWatchlist(movieId: string): boolean {
    const profile = this.profileQuery.data()?.data;
    if (!profile) return false;
    return profile.watchlist.some((movie: { id: string }) => movie.id === movieId);
  }

  toggleWatchlist() {
    const movie = this.query.data()?.data;
    if (movie) {
      this.watchlistMutation.mutate(movie.id);
    }
  }

  getDuration(mins: number | null) {
    if (!mins) return 'Unknown';
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  getFileSize(sizes: Record<string, number>, quality: string) {
    const size = sizes[quality];
    if (!size) return 'Unknown size';
    const gb = size / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = size / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  }
}
