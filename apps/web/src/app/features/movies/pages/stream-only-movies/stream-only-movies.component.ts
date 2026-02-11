import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { MovieCardYoutubeComponent } from '../../../movies/components/movie-card-youtube/movie-card-youtube.component';
import { MovieSummary } from '@naijaspride/types';

/**
 * Stream-only movies page (YouTube Nollywood movies)
 * Dedicated section for YouTube-imported movies
 */
@Component({
  selector: 'app-stream-only-movies',
  standalone: true,
  imports: [CommonModule, RouterLink, MovieCardYoutubeComponent],
  template: `
    <div class="min-h-screen bg-cinema-900 pb-20">
      <!-- Header -->
      <div class="bg-gradient-to-b from-cinema-800 to-cinema-900 py-12 px-6">
        <div class="max-w-7xl mx-auto">
          <div class="flex items-center gap-4 mb-4">
            <a 
              routerLink="/movies" 
              class="text-gray-400 hover:text-white text-sm flex items-center gap-2 transition-colors"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
              </svg>
              Back to All Movies
            </a>
          </div>
          
          <h1 class="text-3xl md:text-4xl font-serif text-white mb-3">
            Nollywood YouTube Movies
          </h1>
          <p class="text-gray-400 max-w-2xl">
            Watch the latest Nigerian movies streamed directly from YouTube. 
            All movies are free to watch with no downloads required.
          </p>
        </div>
      </div>

      <!-- Content -->
      <div class="max-w-7xl mx-auto px-6 py-8">
        <!-- Loading State -->
        @if (isLoading()) {
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            @for (i of [1,2,3,4,5,6,7,8]; track i) {
              <div class="animate-pulse">
                <div class="aspect-video bg-cinema-800 rounded-lg"></div>
                <div class="mt-2 h-4 bg-cinema-800 rounded w-3/4"></div>
                <div class="mt-1 h-3 bg-cinema-800 rounded w-1/2"></div>
              </div>
            }
          </div>
        }

        <!-- Movies Grid -->
        @if (!isLoading() && movies().length > 0) {
          <div class="mb-8">
            <div class="flex items-center justify-between mb-6">
              <h2 class="text-xl font-semibold text-white">
                Latest Additions
                <span class="text-gray-500 text-sm ml-2">({{ movies().length }} movies)</span>
              </h2>
              
              <!-- Sort Options -->
              <select 
                (change)="changeSort($event)"
                class="bg-cinema-800 text-white text-sm rounded px-3 py-2 border border-cinema-700 focus:border-[#800020] focus:outline-none"
              >
                <option value="latest">Latest Added</option>
                <option value="popular">Most Viewed</option>
                <option value="year">Release Year</option>
              </select>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              @for (movie of movies(); track movie.id) {
                <app-movie-card-youtube [movie]="movie" />
              }
            </div>
          </div>
        }

        <!-- Empty State -->
        @if (!isLoading() && movies().length === 0) {
          <div class="text-center py-20">
            <div class="text-6xl mb-4">🎬</div>
            <h3 class="text-xl text-white mb-2">No YouTube movies yet</h3>
            <p class="text-gray-400 mb-6">
              Import movies from YouTube channels to see them here.
            </p>
            <a 
              routerLink="/admin/discovery" 
              class="inline-block bg-[#800020] hover:bg-[#660019] text-white px-6 py-3 rounded font-semibold transition-colors"
            >
              Import Movies from YouTube
            </a>
          </div>
        }
      </div>
    </div>
  `
})
export class StreamOnlyMoviesComponent implements OnInit {
  private http = inject(HttpClient);
  
  movies = signal<MovieSummary[]>([]);
  isLoading = signal(true);
  sortBy = signal('latest');

  ngOnInit() {
    this.loadMovies();
  }

  loadMovies() {
    this.isLoading.set(true);
    
    // Fetch stream-only movies
    this.http.get<{ 
      status: string; 
      data: { 
        movies: MovieSummary[]; 
        pagination: { total: number } 
      } 
    }>('/api/v1/movies', {
      params: {
        isStreamOnly: 'true',
        sortBy: this.sortBy(),
        limit: '50'
      }
    }).subscribe({
      next: (response) => {
        this.movies.set(response.data.movies);
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading stream-only movies:', error);
        this.isLoading.set(false);
      }
    });
  }

  changeSort(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.sortBy.set(select.value);
    this.loadMovies();
  }
}
