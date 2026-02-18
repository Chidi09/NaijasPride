import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MoviesApiService } from '../../../movies/services/movies-api.service';
import { ToastService } from '../../../../core/services/toast.service';
import { Movie } from '@naijaspride/types';

@Component({
  selector: 'app-admin-movie-edit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-8">
        <div class="flex items-center gap-4">
          <a 
            routerLink="/admin/movies" 
            class="text-[#9f7d73] hover:text-white transition-colors"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <div>
            <h1 class="text-2xl font-bold text-white">Edit Movie</h1>
            <p class="text-[#9f7d73] text-sm">{{ movie?.title }}</p>
          </div>
        </div>
        
        <button
          (click)="deleteMovie()"
          [disabled]="deleting"
          class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition flex items-center gap-2 disabled:opacity-50"
        >
          @if (deleting) {
            <span class="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full"></span>
          }
          Delete Movie
        </button>
      </div>

      @if (loading) {
        <div class="flex justify-center py-12">
          <span class="animate-spin h-12 w-12 border-4 border-[#800020] border-t-transparent rounded-full"></span>
        </div>
      }

      @if (error) {
        <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <p class="text-red-600 dark:text-red-400">{{ error }}</p>
        </div>
      }

      @if (!loading && movie) {
        <form [formGroup]="movieForm" (ngSubmit)="onSubmit()" class="space-y-6">
          <!-- Basic Info -->
          <div class="bg-[#140d11] border border-[#2d1a21] rounded-xl p-6">
            <h2 class="text-lg font-semibold text-white mb-4">Basic Information</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="md:col-span-2">
                <label class="block text-sm text-[#9f7d73] mb-2">Title</label>
                <input
                  type="text"
                  formControlName="title"
                  class="w-full px-4 py-2 bg-[#0f0f11] border border-[#2d1a21] rounded-lg text-white focus:outline-none focus:border-[#800020]"
                  placeholder="Movie title"
                >
              </div>

              <div class="md:col-span-2">
                <label class="block text-sm text-[#9f7d73] mb-2">Description</label>
                <textarea
                  formControlName="description"
                  rows="4"
                  class="w-full px-4 py-2 bg-[#0f0f11] border border-[#2d1a21] rounded-lg text-white focus:outline-none focus:border-[#800020]"
                  placeholder="Movie description"
                ></textarea>
              </div>

              <div>
                <label class="block text-sm text-[#9f7d73] mb-2">Year</label>
                <input
                  type="number"
                  formControlName="year"
                  class="w-full px-4 py-2 bg-[#0f0f11] border border-[#2d1a21] rounded-lg text-white focus:outline-none focus:border-[#800020]"
                  placeholder="2024"
                >
              </div>

              <div>
                <label class="block text-sm text-[#9f7d73] mb-2">Language</label>
                <input
                  type="text"
                  formControlName="language"
                  class="w-full px-4 py-2 bg-[#0f0f11] border border-[#2d1a21] rounded-lg text-white focus:outline-none focus:border-[#800020]"
                  placeholder="English"
                >
              </div>

              <div>
                <label class="block text-sm text-[#9f7d73] mb-2">Duration (minutes)</label>
                <input
                  type="number"
                  formControlName="durationMinutes"
                  class="w-full px-4 py-2 bg-[#0f0f11] border border-[#2d1a21] rounded-lg text-white focus:outline-none focus:border-[#800020]"
                  placeholder="120"
                >
              </div>

              <div>
                <label class="block text-sm text-[#9f7d73] mb-2">Rating</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  formControlName="rating"
                  class="w-full px-4 py-2 bg-[#0f0f11] border border-[#2d1a21] rounded-lg text-white focus:outline-none focus:border-[#800020]"
                  placeholder="8.5"
                >
              </div>
            </div>
          </div>

          <!-- Streaming Info -->
          <div class="bg-[#140d11] border border-[#2d1a21] rounded-xl p-6">
            <h2 class="text-lg font-semibold text-white mb-4">Streaming Information</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label class="block text-sm text-[#9f7d73] mb-2">YouTube Video ID</label>
                <input
                  type="text"
                  formControlName="youtubeId"
                  class="w-full px-4 py-2 bg-[#0f0f11] border border-[#2d1a21] rounded-lg text-white focus:outline-none focus:border-[#800020]"
                  placeholder="dQw4w9WgXcQ"
                >
              </div>

              <div class="flex items-end">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    formControlName="isStreamOnly"
                    class="w-4 h-4 rounded border-[#2d1a21] bg-[#0f0f11] text-[#800020] focus:ring-[#800020]"
                  >
                  <span class="text-white">Stream Only (no downloads)</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Media URLs -->
          <div class="bg-[#140d11] border border-[#2d1a21] rounded-xl p-6">
            <h2 class="text-lg font-semibold text-white mb-4">Media URLs</h2>
            
            <div class="space-y-4">
              <div>
                <label class="block text-sm text-[#9f7d73] mb-2">Thumbnail URL</label>
                <input
                  type="url"
                  formControlName="thumbnailUrl"
                  class="w-full px-4 py-2 bg-[#0f0f11] border border-[#2d1a21] rounded-lg text-white focus:outline-none focus:border-[#800020]"
                  placeholder="https://example.com/thumb.jpg"
                >
              </div>

              <div>
                <label class="block text-sm text-[#9f7d73] mb-2">Cover URL</label>
                <input
                  type="url"
                  formControlName="coverUrl"
                  class="w-full px-4 py-2 bg-[#0f0f11] border border-[#2d1a21] rounded-lg text-white focus:outline-none focus:border-[#800020]"
                  placeholder="https://example.com/cover.jpg"
                >
              </div>

              <div>
                <label class="block text-sm text-[#9f7d73] mb-2">Poster URL</label>
                <input
                  type="url"
                  formControlName="posterUrl"
                  class="w-full px-4 py-2 bg-[#0f0f11] border border-[#2d1a21] rounded-lg text-white focus:outline-none focus:border-[#800020]"
                  placeholder="https://example.com/poster.jpg"
                >
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex gap-4">
            <button
              type="submit"
              [disabled]="saving || movieForm.invalid"
              class="px-6 py-3 bg-[#800020] hover:bg-[#660019] text-white rounded-lg transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              @if (saving) {
                <span class="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full"></span>
              }
              Save Changes
            </button>

            <a
              routerLink="/admin/movies"
              class="px-6 py-3 border border-[#2d1a21] text-[#9f7d73] hover:text-white hover:border-[#9f7d73] rounded-lg transition"
            >
              Cancel
            </a>
          </div>
        </form>
      }
    </div>
  `
})
export class AdminMovieEditComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private moviesApi = inject(MoviesApiService);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);

  movie: Movie | null = null;
  loading = true;
  saving = false;
  deleting = false;
  error: string | null = null;

  movieForm = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    year: [2024, Validators.required],
    language: ['English'],
    durationMinutes: [null as number | null],
    rating: [null as number | null],
    youtubeId: [''],
    isStreamOnly: [false],
    thumbnailUrl: [''],
    coverUrl: [''],
    posterUrl: [''],
  });

  ngOnInit() {
    const movieId = this.route.snapshot.paramMap.get('id');
    if (!movieId) {
      this.error = 'Movie ID not provided';
      this.loading = false;
      return;
    }

    this.loadMovie(movieId);
  }

  loadMovie(id: string) {
    this.loading = true;
    this.moviesApi.getMovieBySlug(id).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.data) {
          this.movie = response.data;
          this.movieForm.patchValue({
            title: response.data.title,
            description: response.data.description || '',
            year: response.data.year,
            language: response.data.language,
            durationMinutes: response.data.durationMinutes,
            rating: response.data.rating,
            youtubeId: response.data.youtubeId || '',
            isStreamOnly: response.data.isStreamOnly,
            thumbnailUrl: response.data.thumbnailUrl || '',
            coverUrl: response.data.coverUrl || '',
            posterUrl: response.data.posterUrl || '',
          });
        } else {
          this.error = 'Movie not found';
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.message || 'Failed to load movie';
      }
    });
  }

  onSubmit() {
    if (this.movieForm.invalid || !this.movie) return;

    this.saving = true;
    const data = this.movieForm.value as Partial<Movie>;

    this.moviesApi.updateMovie(this.movie.id, data).subscribe({
      next: () => {
        this.saving = false;
        this.toast.success('Movie updated successfully');
        this.router.navigate(['/admin/movies']);
      },
      error: (err) => {
        this.saving = false;
        this.toast.error(err.error?.message || 'Failed to update movie');
      }
    });
  }

  deleteMovie() {
    if (!this.movie) return;
    
    const confirmed = confirm(`Are you sure you want to delete "${this.movie.title}"? This action cannot be undone.`);
    if (!confirmed) return;

    this.deleting = true;
    this.moviesApi.deleteMovie(this.movie.id).subscribe({
      next: () => {
        this.deleting = false;
        this.toast.success('Movie deleted successfully');
        this.router.navigate(['/admin/movies']);
      },
      error: (err) => {
        this.deleting = false;
        this.toast.error(err.error?.message || 'Failed to delete movie');
      }
    });
  }
}
