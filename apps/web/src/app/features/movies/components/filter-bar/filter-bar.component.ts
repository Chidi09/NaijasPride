import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Genre, Quality, MovieSearchParams } from '@naijaspride/types';

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="sticky top-16 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-100 py-3 mb-6 transition-all">
      <div class="flex flex-wrap gap-3 items-center">
        
        <div class="relative group">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span class="text-gray-400">🔍</span>
          </div>
          <input
            type="text"
            [ngModel]="activeFilters.q"
            (ngModelChange)="updateFilter('q', $event)"
            placeholder="Search..."
            class="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-full text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none w-40 focus:w-60 transition-all"
          />
        </div>

        <div class="h-6 w-px bg-gray-200 hidden md:block"></div>

        <select
          [ngModel]="activeFilters.genre?.[0] || ''" 
          (ngModelChange)="updateFilter('genre', $event ? [$event] : undefined)"
          class="form-select"
        >
          <option value="">All Genres</option>
          @for (g of genres; track g) {
            <option [value]="g">{{ g }}</option>
          }
        </select>

        <select
          [ngModel]="activeFilters.year || ''"
          (ngModelChange)="updateFilter('year', $event ? +$event : undefined)"
          class="form-select"
        >
          <option value="">All Years</option>
          @for (y of years; track y) {
            <option [value]="y">{{ y }}</option>
          }
        </select>

        <select
          [ngModel]="activeFilters.quality || ''"
          (ngModelChange)="updateFilter('quality', $event || undefined)"
          class="form-select"
        >
          <option value="">All Qualities</option>
          @for (q of qualities; track q) {
            <option [value]="q">{{ q }}</option>
          }
        </select>

        <div class="flex-grow"></div>

        <select
          [ngModel]="activeFilters.sortBy || 'latest'"
          (ngModelChange)="updateFilter('sortBy', $event)"
          class="form-select text-gray-600 font-medium"
        >
          <option value="latest">Latest</option>
          <option value="popular">Popular</option>
          <option value="rating">Top Rated</option>
          <option value="title">A-Z</option>
        </select>
      </div>

      @if (hasActiveFilters()) {
        <div class="flex flex-wrap gap-2 mt-3 pt-2 border-t border-dashed border-gray-200">
          <span class="text-xs text-gray-500 self-center uppercase font-bold tracking-wider mr-1">Active:</span>
          
          @if (activeFilters.genre) {
            <button (click)="updateFilter('genre', undefined)" class="chip">
              {{ activeFilters.genre[0] }} ✕
            </button>
          }
          @if (activeFilters.year) {
            <button (click)="updateFilter('year', undefined)" class="chip">
              {{ activeFilters.year }} ✕
            </button>
          }
          @if (activeFilters.quality) {
            <button (click)="updateFilter('quality', undefined)" class="chip">
              {{ activeFilters.quality }} ✕
            </button>
          }
          
          <button (click)="resetAll()" class="text-xs text-red-600 hover:text-red-800 font-medium ml-auto">
            Clear All
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .form-select {
      @apply appearance-none bg-gray-50 border border-gray-200 text-gray-700 py-2 px-4 pr-8 rounded-full text-sm leading-tight focus:outline-none focus:bg-white focus:border-primary cursor-pointer hover:border-gray-300 transition-colors;
      background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
      background-position: right 0.5rem center;
      background-repeat: no-repeat;
      background-size: 1.5em 1.5em;
    }
    .chip {
      @apply bg-primary/10 text-primary-700 text-xs px-2 py-1 rounded-md hover:bg-red-100 hover:text-red-700 transition-colors cursor-pointer flex items-center gap-1;
    }
  `]
})
export class FilterBarComponent {
  @Input({ required: true }) activeFilters!: MovieSearchParams;
  @Output() filterChange = new EventEmitter<Partial<MovieSearchParams>>();

  // Enum to Array conversion for templates
  genres = Object.values(Genre);
  qualities = Object.values(Quality);
  
  // Generate last 20 years dynamically
  currentYear = new Date().getFullYear();
  years = Array.from({ length: 20 }, (_, i) => this.currentYear - i);

  updateFilter(key: keyof MovieSearchParams, value: any) {
    this.filterChange.emit({ [key]: value });
  }

  resetAll() {
    this.filterChange.emit({
      q: undefined,
      genre: undefined,
      year: undefined,
      quality: undefined,
      sortBy: 'latest'
    });
  }

  hasActiveFilters(): boolean {
    const { genre, year, quality, q } = this.activeFilters;
    return !!(genre?.length || year || quality || q);
  }
}
