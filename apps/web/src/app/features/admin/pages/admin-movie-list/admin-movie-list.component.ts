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
    <div class="max-w-5xl mx-auto bg-[#140d11] border border-[#2d1a21] rounded-xl shadow-2xl overflow-hidden">
      <div class="p-6 border-b border-[#2d1a21] flex items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-bold text-white">Movie Management</h2>
          <p class="text-sm text-[#9f7d73] mt-1">Manage, edit, and sync metadata for all movies.</p>
        </div>
        <div class="flex gap-3">
          <a
            routerLink="/admin/movies/upload"
            class="inline-flex items-center px-4 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-500 transition-colors shadow-lg shadow-green-900/20"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
            Upload File
          </a>
          <a
            routerLink="/admin/movies/new"
            class="inline-flex items-center px-4 py-2 rounded-lg border border-[#5f1327] bg-[#1b1014] text-[#d6b87a] font-semibold hover:bg-[#2a131a] transition-colors"
          >
            + Manual Link
          </a>
        </div>
      </div>

      <!-- User Instructions -->
      <div class="px-6 py-4 bg-blue-900/10 border-b border-[#2d1a21] flex items-center gap-4">
        <div class="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <p class="text-xs text-blue-200/70 leading-relaxed">
          <strong>Tip:</strong> If a movie is missing its poster or details, click <span class="text-white font-bold italic">"Auto-Fill Info"</span>. We use TMDB to automatically fetch the best quality assets based on the title and year you provided.
        </p>
      </div>

      <div class="p-6 border-b border-[#2d1a21] bg-[#1b1014] flex items-center justify-between gap-3">
        <p class="text-sm text-[#c5aea5]">Use <span class="font-semibold text-[#d6b87a]">Auto-Fill Info</span> after upload.</p>
        <button
          type="button"
          (click)="loadMovies()"
          [disabled]="moviesLoading()"
          class="text-sm px-3 py-2 rounded-md border border-[#5f1327] text-[#d6b87a] hover:bg-[#2a131a] disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <div class="p-6">
        @if (moviesLoading()) {
          <p class="text-sm text-[#9f7d73]">Loading movies...</p>
        } @else if (movies().length === 0) {
          <p class="text-sm text-[#9f7d73]">No movies found. Add one to get started.</p>
        } @else {
          <div class="space-y-3">
            @for (movie of movies(); track movie.id) {
              <div class="flex items-center justify-between gap-4 border border-[#2d1a21] bg-[#1b1014] rounded-lg p-4">
                <div class="min-w-0">
                  <p class="font-semibold text-white truncate">{{ movie.title }}</p>
                  <p class="text-xs text-[#9f7d73]">{{ movie.year }} • {{ movie.genre.join(', ') }}</p>
                </div>

                <div class="flex items-center gap-2">
                  <a
                    [routerLink]="['/admin/movies', movie.id, 'edit']"
                    class="px-4 py-2 text-xs font-bold border border-[#5f1327] text-[#d6b87a] rounded-md hover:bg-[#2a131a]"
                  >
                    Edit
                  </a>
                  
                  <button
                    type="button"
                    (click)="syncMetadata(movie)"
                    [disabled]="syncMutation.isPending()"
                    class="px-4 py-2 text-xs font-bold bg-cinema-500 text-white rounded-md hover:bg-cinema-400 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    @if (syncMutation.isPending() && syncingMovieId() === movie.id) {
                      <span class="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1"></span>
                      Syncing...
                    } @else {
                      Auto-Fill Info
                    }
                  </button>
                </div>
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
