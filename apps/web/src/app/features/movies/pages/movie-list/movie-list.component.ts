import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MoviesQueryService } from '../../services/movies-query.service';
import { MovieCardComponent } from '../../components/movie-card/movie-card.component';
import { FilterBarComponent } from '../../components/filter-bar/filter-bar.component';
import { PaginatorComponent } from '../../../../shared/components/paginator/paginator.component';
import { MovieSearchParams } from '@naijaspride/types';

@Component({
  selector: 'app-movie-list',
  standalone: true,
  imports: [CommonModule, MovieCardComponent, FilterBarComponent, PaginatorComponent],
  template: `
    <div class="space-y-4 min-h-screen">
      <app-filter-bar 
        [activeFilters]="searchParams()"
        (filterChange)="onFilterChange($event)"
      />

      @if (query.isPending()) {
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
          @for (i of [1,2,3,4,5,6,7,8,9,10]; track i) {
            <div class="bg-cinema-800 rounded-sm aspect-[2/3] animate-pulse"></div>
          }
        </div>
      }

      @if (query.isError()) {
        <div class="flex flex-col items-center justify-center py-20 text-center">
          <div class="bg-cinema-500/20 text-cinema-500 p-4 rounded-full mb-4">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
          </div>
          <h3 class="text-lg font-serif font-bold text-white">Oops! Something went wrong.</h3>
          <p class="text-gray-500 mb-4">{{ query.error()?.message }}</p>
          <button (click)="query.refetch()" class="px-6 py-2 bg-cinema-500 text-white text-sm tracking-widest uppercase hover:bg-cinema-400 transition-colors">
            Try Again
          </button>
        </div>
      }

      @if (query.isSuccess()) {
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
          @for (movie of query.data()?.data; track movie.id) {
            <app-movie-card [movie]="movie" />
          }
        </div>
        
        @if (query.data()?.data?.length === 0) {
          <div class="flex flex-col items-center justify-center py-24 text-gray-400">
            <span class="text-6xl mb-4">🎬</span>
            <p class="text-lg font-serif">No movies found matching your filters.</p>
            <button 
              (click)="onFilterChange({ q: undefined, genre: undefined, year: undefined, quality: undefined })"
              class="mt-4 text-cinema-500 font-medium hover:text-cinema-100 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        }
        
        <!-- Pagination -->
        @if (query.data()?.meta) {
          <app-paginator 
            [currentPage]="query.data()!.meta!.page"
            [totalPages]="query.data()!.meta!.totalPages"
            (pageChange)="onPageChange($event)"
          />
        }
      }
    </div>
  `
})
export class MovieListComponent {
  searchParams = signal<MovieSearchParams>({ 
    page: 1, 
    limit: 20,
    sortBy: 'latest'
  });

  private moviesService = inject(MoviesQueryService);
  query = this.moviesService.getMoviesQuery(this.searchParams);

  // Merge new filters into existing params
  onFilterChange(changes: Partial<MovieSearchParams>) {
    this.searchParams.update((current: MovieSearchParams) => ({
      ...current,
      ...changes,
      page: 1 // Always reset to page 1 when filtering
    }));
  }

  // Handle page changes
  onPageChange(page: number) {
    this.searchParams.update((current: MovieSearchParams) => ({
      ...current,
      page
    }));
    // Scroll to top of results
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
