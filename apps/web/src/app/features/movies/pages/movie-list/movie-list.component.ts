import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MoviesQueryService } from '../../services/movies-query.service';
import { MovieCardComponent } from '../../components/movie-card/movie-card.component';
import { FilterBarComponent } from '../../components/filter-bar/filter-bar.component';
import { MovieSearchParams } from '@naijaspride/types';

@Component({
  selector: 'app-movie-list',
  standalone: true,
  imports: [CommonModule, MovieCardComponent, FilterBarComponent],
  template: `
    <div class="space-y-4">
      <app-filter-bar 
        [activeFilters]="searchParams()"
        (filterChange)="onFilterChange($event)"
      />

      @if (query.isPending()) {
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 animate-pulse">
          @for (i of [1,2,3,4,5,6,7,8,9,10]; track i) {
            <div class="bg-gray-100 rounded-xl aspect-[2/3]"></div>
          }
        </div>
      }

      @if (query.isError()) {
        <div class="flex flex-col items-center justify-center py-20 text-center">
          <div class="bg-red-100 text-red-600 p-4 rounded-full mb-4">⚠️</div>
          <h3 class="text-lg font-bold text-gray-900">Oops! Something went wrong.</h3>
          <p class="text-gray-500 mb-4">{{ query.error()?.message }}</p>
          <button (click)="query.refetch()" class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark">
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
            <span class="text-6xl mb-4">🕵️‍♀️</span>
            <p class="text-lg">No movies found matching your filters.</p>
            <button 
              (click)="onFilterChange({ q: undefined, genre: undefined, year: undefined, quality: undefined })"
              class="mt-4 text-primary font-semibold hover:underline"
            >
              Clear Filters
            </button>
          </div>
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
    this.searchParams.update(current => ({
      ...current,
      ...changes,
      page: 1 // Always reset to page 1 when filtering
    }));
  }
}
