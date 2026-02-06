import { Component, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MoviesQueryService } from '../../services/movies-query.service';
import { Quality, Movie } from '@naijaspride/types';

@Component({
  selector: 'app-movie-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (query.isPending()) {
      <div class="animate-pulse">
        <div class="h-[400px] bg-gray-200 w-full mb-8"></div>
        <div class="container mx-auto px-4">
          <div class="h-8 bg-gray-200 w-1/3 mb-4"></div>
          <div class="h-4 bg-gray-200 w-1/2 mb-8"></div>
        </div>
      </div>
    }

    @if (query.isError()) {
      <div class="container mx-auto px-4 py-20 text-center">
        <h2 class="text-2xl font-bold text-gray-900">Movie not found</h2>
        <a routerLink="/movies" class="text-primary hover:underline mt-4 block">← Back to Movies</a>
      </div>
    }

    @if (query.isSuccess(); as success) {
      @if (query.data()?.data; as movie) {
        
        <div class="relative w-full bg-gray-900 text-white overflow-hidden mb-8">
          
          <div 
            class="absolute inset-0 bg-cover bg-center opacity-30 blur-xl scale-110"
            [style.backgroundImage]="'url(' + (movie.coverUrl || movie.thumbnailUrl) + ')'"
          ></div>
          <div class="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent"></div>

          <div class="relative container mx-auto px-4 py-12 md:py-20 flex flex-col md:flex-row gap-8 items-center md:items-end">
            
            <div class="w-48 md:w-64 flex-shrink-0 rounded-lg shadow-2xl overflow-hidden border-4 border-white/10">
              <img [src]="movie.thumbnailUrl" [alt]="movie.title" class="w-full h-auto">
            </div>

            <div class="flex-grow text-center md:text-left space-y-4">
              <div class="flex flex-wrap gap-2 justify-center md:justify-start">
                @if (movie.metadata?.nollywood) {
                  <span class="bg-green-600 text-white text-xs font-bold px-2 py-1 rounded">Nollywood</span>
                }
                <span class="bg-white/20 text-white text-xs font-bold px-2 py-1 rounded">{{ movie.year }}</span>
                <span class="bg-amber-500 text-black text-xs font-bold px-2 py-1 rounded">★ {{ movie.rating }}</span>
              </div>

              <h1 class="text-3xl md:text-5xl font-bold leading-tight">{{ movie.title }}</h1>
              
              <div class="text-gray-300 text-sm md:text-base flex flex-wrap gap-x-4 gap-y-1 justify-center md:justify-start">
                <span>{{ getDuration(movie.durationMinutes) }}</span>
                <span>•</span>
                <span>{{ movie.genre.join(', ') }}</span>
                <span>•</span>
                <span>{{ movie.language }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="container mx-auto px-4 pb-20 grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div class="lg:col-span-2 space-y-8">
            <section>
              <h3 class="text-xl font-bold text-gray-900 mb-3">Synopsis</h3>
              <p class="text-gray-700 leading-relaxed">{{ movie.description || 'No description available.' }}</p>
            </section>

            <section class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 class="font-bold text-gray-900 mb-2">Director</h4>
                <p class="text-gray-600">{{ movie.metadata?.director || 'Unknown' }}</p>
              </div>
              <div>
                <h4 class="font-bold text-gray-900 mb-2">Cast</h4>
                <div class="flex flex-wrap gap-2">
                  @for (actor of movie.metadata?.cast || []; track actor) {
                    <span class="bg-gray-100 text-gray-700 text-sm px-3 py-1 rounded-full">{{ actor }}</span>
                  }
                </div>
              </div>
            </section>
          </div>

          <div class="lg:col-span-1">
            <div class="bg-white rounded-xl shadow-lg border border-gray-100 p-6 sticky top-24">
              <h3 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span>⬇️</span> Download Options
              </h3>

              <div class="space-y-3">
                @for (q of movie.quality; track q) {
                  <div class="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-primary/50 hover:bg-green-50/50 transition-colors group">
                    <div>
                      <div class="font-bold text-gray-800">{{ q }}</div>
                      <div class="text-xs text-gray-500">
                        {{ getFileSize(movie.fileSizes, q) }}
                      </div>
                    </div>
                    
                    <a 
                      [href]="movie.fileUrls[q]" 
                      target="_blank"
                      class="bg-secondary hover:bg-secondary-dark text-white text-sm font-bold px-4 py-2 rounded-full shadow-sm transition-transform active:scale-95"
                    >
                      Download
                    </a>
                  </div>
                }
              </div>

              <div class="mt-6 pt-4 border-t border-gray-100 text-center">
                 <p class="text-xs text-gray-500 mb-2">Safe & Secure Downloads</p>
                 <div class="flex justify-center gap-4 text-gray-400">
                    <span>🔒 TLS</span>
                    <span>⚡ Fast</span>
                 </div>
              </div>
            </div>
          </div>

        </div>
      }
    }
  `
})
export class MovieDetailComponent {
  // Input comes from Router (Component Input Binding)
  slug = input.required<string>();
  
  private moviesService = inject(MoviesQueryService);
  
  // Computed signal to pass the slug to the query
  query = this.moviesService.getMovieDetailQuery(this.slug);

  // Helper wrappers for shared utils
  getDuration(mins: number | null) {
    if (!mins) return 'Unknown';
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  getFileSize(sizes: Record<string, number>, quality: string) {
    const size = sizes[quality];
    if (!size) return 'Unknown size';
    // Simple file size formatter
    const gb = size / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = size / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  }
}
