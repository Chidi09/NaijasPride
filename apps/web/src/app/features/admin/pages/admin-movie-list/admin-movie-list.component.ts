import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MovieSummary } from '@naijaspride/types';
import { AdminMoviesService } from '../../services/admin-movies.service';

@Component({
  selector: 'app-admin-movie-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="max-w-5xl mx-auto bg-white rounded-xl shadow-md overflow-hidden">
      <div class="p-6 border-b border-gray-100 flex items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-bold text-gray-800">Movies</h2>
          <p class="text-sm text-gray-500 mt-1">Sync posters, backdrops, cast, and ratings from TMDB.</p>
        </div>
        <a
          routerLink="/admin/movies/new"
          class="inline-flex items-center px-4 py-2 rounded-lg bg-primary text-white font-semibold hover:bg-primary-dark"
        >
          + Add Movie
        </a>
      </div>

      <div class="p-6 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
        <p class="text-sm text-gray-600">Use <span class="font-semibold">Auto-Fill Info</span> after upload.</p>
        <button
          type="button"
          (click)="loadMovies()"
          [disabled]="moviesLoading()"
          class="text-sm px-3 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-white disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <div class="p-6">
        @if (moviesLoading()) {
          <p class="text-sm text-gray-500">Loading movies...</p>
        } @else if (movies().length === 0) {
          <p class="text-sm text-gray-500">No movies found. Add one to get started.</p>
        } @else {
          <div class="space-y-3">
            @for (movie of movies(); track movie.id) {
              <div class="flex items-center justify-between gap-4 border border-gray-200 rounded-lg p-4">
                <div class="min-w-0">
                  <p class="font-semibold text-gray-900 truncate">{{ movie.title }}</p>
                  <p class="text-xs text-gray-500">{{ movie.year }} • {{ movie.genre.join(', ') }}</p>
                </div>

                <button
                  type="button"
                  (click)="syncMetadata(movie)"
                  [disabled]="syncMutation.isPending()"
                  class="px-4 py-2 text-xs font-bold bg-cinema-900 text-white rounded-md hover:bg-cinema-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  @if (syncMutation.isPending() && syncingMovieId() === movie.id) {
                    <span class="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1"></span>
                    Syncing...
                  } @else {
                    Auto-Fill Info
                  }
                </button>
              </div>
            }
          </div>
        }

        @if (syncMessage()) {
          <p class="mt-4 text-sm text-green-700">{{ syncMessage() }}</p>
        }
        @if (syncError()) {
          <p class="mt-4 text-sm text-red-600">{{ syncError() }}</p>
        }
      </div>
    </div>
  `,
})
export class AdminMovieListComponent {
  private adminService = inject(AdminMoviesService);

  syncMutation = this.adminService.syncMetadataMutation();
  movies = signal<MovieSummary[]>([]);
  moviesLoading = signal(false);
  syncMessage = signal('');
  syncError = signal('');
  syncingMovieId = signal<string | null>(null);

  constructor() {
    this.loadMovies();
  }

  loadMovies() {
    this.moviesLoading.set(true);
    this.adminService.getMovies({ page: 1, limit: 50, sortBy: 'newest' }).subscribe({
      next: (res) => {
        this.movies.set(res.data);
        this.moviesLoading.set(false);
      },
      error: () => {
        this.moviesLoading.set(false);
      },
    });
  }

  syncMetadata(movie: MovieSummary) {
    this.syncMessage.set('');
    this.syncError.set('');
    this.syncingMovieId.set(movie.id);

    this.syncMutation.mutate(movie.id, {
      onSuccess: () => {
        this.syncMessage.set(`Metadata updated for "${movie.title}".`);
        this.syncingMovieId.set(null);
      },
      onError: (error: Error) => {
        this.syncError.set(error.message || `Failed to sync metadata for "${movie.title}".`);
        this.syncingMovieId.set(null);
      }
    });
  }
}
