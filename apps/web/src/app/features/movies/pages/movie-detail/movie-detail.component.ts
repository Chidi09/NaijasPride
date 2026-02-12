import { Component, effect, inject, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Location } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { MoviesQueryService } from '../../services/movies-query.service';
import { ProfileQueryService } from '../../../profile/services/profile-query.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { CastMember, Quality, Movie } from '@naijaspride/types';

@Component({
  selector: 'app-movie-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (query.isPending()) {
      <div class="animate-pulse">
        <div class="h-[400px] bg-[#e5d2c6] dark:bg-cinema-800 w-full mb-8"></div>
        <div class="container mx-auto px-4">
          <div class="h-8 bg-[#e5d2c6] dark:bg-cinema-800 w-1/3 mb-4"></div>
          <div class="h-4 bg-[#e5d2c6] dark:bg-cinema-800 w-1/2 mb-8"></div>
        </div>
      </div>
    }

    @if (query.isError()) {
      <div class="container mx-auto px-4 py-20 text-center">
        <h2 class="text-2xl font-serif font-bold text-[#24181b] dark:text-white">Movie not found</h2>
        <button type="button" (click)="goBack()" class="text-cinema-500 hover:text-cinema-100 mt-4 block mx-auto">← Back</button>
      </div>
    }

    @if (query.isSuccess(); as success) {
      @if (query.data()?.data; as movie) {
        
        <div class="relative w-full bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-hidden mb-8">
          
          <div 
            class="absolute inset-0 bg-cover bg-center opacity-20 blur-xl scale-110"
            [style.backgroundImage]="'url(' + getHeroBackdrop(movie) + ')'"
          ></div>
          <div class="absolute inset-0 bg-gradient-to-t from-[#f8f0e9] via-[#f8f0e9]/70 to-white/20 dark:from-cinema-900 dark:via-cinema-900/70 dark:to-black/20"></div>

           <div class="relative container mx-auto px-4 py-12 md:py-20 flex flex-col md:flex-row gap-8 items-center md:items-end">
            <button
              type="button"
              (click)="goBack()"
              class="absolute top-4 left-4 inline-flex items-center gap-2 text-[#8a756e] hover:text-[#24181b] dark:text-gray-400 dark:hover:text-white text-sm transition-colors"
              aria-label="Go back"
            >
              <span aria-hidden="true">←</span>
              Back
            </button>
             
             <div class="w-48 md:w-64 flex-shrink-0 rounded-sm shadow-2xl overflow-hidden border-2 border-white/10">
               <img [src]="movie.posterUrl || movie.thumbnailUrl" [alt]="movie.title" class="w-full h-auto">
             </div>

            <div class="flex-grow text-center md:text-left space-y-4">
              <div class="flex flex-wrap gap-2 justify-center md:justify-start">
                @if (movie.metadata?.nollywood) {
                  <span class="bg-cinema-500 text-white text-xs font-bold px-2 py-1 rounded-sm">Nollywood</span>
                }
                <span class="bg-black/10 text-[#24181b] dark:bg-white/10 dark:text-white text-xs font-bold px-2 py-1 rounded-sm">{{ movie.year }}</span>
                <span class="bg-green-500/20 text-green-400 text-xs font-bold px-2 py-1 rounded-sm">{{ movie.rating }}% Match</span>
                @if (movie.isStreamOnly) {
                  <span class="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-sm">STREAM ONLY</span>
                }
              </div>

              <h1 class="text-3xl md:text-5xl font-serif font-bold leading-tight">{{ movie.title }}</h1>
              @if (movie.tagline) {
                <p class="text-base md:text-lg text-[#6f5b54] dark:text-gray-300 italic">{{ movie.tagline }}</p>
              }
              
              <div class="text-[#725f58] dark:text-gray-400 text-sm md:text-base flex flex-wrap gap-x-4 gap-y-1 justify-center md:justify-start">
                <span>{{ getDuration(movie.durationMinutes) }}</span>
                <span>•</span>
                <span>{{ movie.genre.join(', ') }}</span>
                <span>•</span>
                <span>{{ movie.language }}</span>
              </div>

              <div class="flex flex-wrap gap-2 justify-center md:justify-start">
                @if (movie.imdbRating) {
                  <span class="bg-yellow-400 text-black text-xs font-bold px-3 py-1 rounded-sm">IMDb {{ movie.imdbRating.toFixed(1) }}</span>
                }
                @if (movie.rottenTomatoes) {
                  <span class="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-sm">Tomatometer {{ movie.rottenTomatoes }}</span>
                }
                @if (movie.tmdbRating) {
                  <span class="bg-sky-500 text-white text-xs font-bold px-3 py-1 rounded-sm">TMDB {{ movie.tmdbRating.toFixed(1) }}</span>
                }
              </div>

              <!-- Action Buttons -->
              <div class="flex flex-wrap gap-3 pt-4">
                @if (movie.youtubeId) {
                  <a 
                    [routerLink]="['/watch', movie.id]" 
                    class="inline-flex items-center gap-2 bg-white text-cinema-900 px-6 py-3 rounded-full font-bold hover:bg-gray-100 transition-colors"
                  >
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                    Watch Stream
                  </a>
                }
                @if (movie.trailerUrl) {
                  <a
                    [href]="movie.trailerUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-2 border border-cinema-500/60 text-cinema-100 px-6 py-3 rounded-full font-bold hover:bg-cinema-500/15 transition-colors"
                  >
                    Watch Trailer
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
               <h3 class="text-xl font-serif font-bold text-[#24181b] dark:text-white mb-3">Synopsis</h3>
               <p class="text-[#725f58] dark:text-gray-400 leading-relaxed">{{ movie.overview || movie.description || 'No description available.' }}</p>
            </section>

            <section class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 class="font-bold text-[#24181b] dark:text-white mb-2">Director</h4>
                <p class="text-[#725f58] dark:text-gray-500">{{ movie.metadata?.director || 'Unknown' }}</p>
              </div>
              <div>
                <h4 class="font-bold text-[#24181b] dark:text-white mb-2">Top Cast</h4>
                @if ((movie.cast || []).length > 0) {
                  <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    @for (actor of movie.cast; track actor.id) {
                      <div class="bg-[#f0e4da] dark:bg-cinema-800/70 border border-[#d9c4b7] dark:border-white/10 rounded-lg p-3 text-center">
                        @if (actor.photoUrl) {
                          <img [src]="actor.photoUrl" [alt]="actor.name" class="w-14 h-14 rounded-full object-cover mx-auto mb-2 border border-[#d9c4b7] dark:border-white/10">
                        } @else {
                          <div class="w-14 h-14 rounded-full bg-[#dfc8bb] dark:bg-cinema-700 text-[#6b3d2e] dark:text-cinema-200 mx-auto mb-2 flex items-center justify-center text-xs font-bold">
                            {{ actorInitials(actor.name) }}
                          </div>
                        }
                        <p class="text-sm text-[#24181b] dark:text-white font-semibold leading-tight">{{ actor.name }}</p>
                        <p class="text-xs text-[#725f58] dark:text-gray-400 leading-tight">{{ actor.character || 'Cast' }}</p>
                      </div>
                    }
                  </div>
                } @else {
                  <div class="flex flex-wrap gap-2">
                    @for (actor of movie.metadata?.cast || []; track actor) {
                      <span class="bg-[#f0e4da] dark:bg-cinema-800 text-[#24181b] dark:text-gray-300 text-sm px-3 py-1 rounded-sm">{{ actor }}</span>
                    }
                  </div>
                }
              </div>
            </section>
          </div>

          <div class="lg:col-span-1">
            <div class="bg-[#f8f0e9] dark:bg-cinema-800/50 backdrop-blur-sm border border-[#d9c4b7] dark:border-white/5 p-6 sticky top-24">
              @if (movie.isStreamOnly) {
                <!-- Stream Only Card -->
                <div class="text-center py-6">
                  <div class="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg class="w-8 h-8 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                  </div>
                  <h3 class="text-lg font-serif font-bold text-[#24181b] dark:text-white mb-2">Stream Only</h3>
                  <p class="text-[#725f58] dark:text-gray-400 text-sm mb-4">This movie is available for streaming only.</p>
                  @if (movie.youtubeId) {
                    <a 
                      [routerLink]="['/watch', movie.id]" 
                      class="inline-block bg-cinema-500 hover:bg-cinema-400 text-white font-bold px-6 py-3 rounded-full transition-colors w-full"
                    >
                      ▶ Watch Now
                    </a>
                  }
                </div>
              } @else {
                <!-- Download Options Card -->
                <h3 class="text-lg font-serif font-bold text-[#24181b] dark:text-white mb-4 flex items-center gap-2">
                  <svg class="w-5 h-5 text-cinema-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                  </svg>
                  Download Options
                </h3>

                <div class="space-y-3">
                  @for (q of movie.quality; track q) {
                    <div class="flex items-center justify-between p-3 rounded-sm border border-[#d9c4b7] dark:border-white/10 hover:border-cinema-500/50 hover:bg-cinema-500/10 transition-colors group">
                      <div>
                        <div class="font-bold text-[#24181b] dark:text-white">{{ q }}</div>
                        <div class="text-xs text-[#725f58] dark:text-gray-500">
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

                <div class="mt-6 pt-4 border-t border-[#d9c4b7] dark:border-white/5 text-center">
                   <p class="text-xs text-[#725f58] dark:text-gray-500 mb-2">Premium Quality Downloads</p>
                   <div class="flex justify-center gap-4 text-[#a08070] dark:text-gray-600 text-xs">
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
  private location = inject(Location);
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

  goBack() {
    this.location.back();
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

  getHeroBackdrop(movie: Movie) {
    return movie.backdropUrl || movie.coverUrl || movie.posterUrl || movie.thumbnailUrl || '';
  }

  actorInitials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }
}
