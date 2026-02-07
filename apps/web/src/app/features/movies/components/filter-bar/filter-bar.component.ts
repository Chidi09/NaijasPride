import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Genre, Quality, MovieSearchParams } from '@naijaspride/types';

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="sticky top-20 z-30 bg-cinema-900/95 backdrop-blur-sm border-b border-white/5 py-3 mb-6 transition-all">
      <div class="flex flex-wrap gap-3 items-center">
        
        <div class="relative group">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>
          <input
            type="text"
            [ngModel]="activeFilters.q"
            (ngModelChange)="updateFilter('q', $event)"
            placeholder="Search..."
            class="pl-9 pr-4 py-2 bg-cinema-800 border border-white/10 rounded-sm text-sm text-white focus:ring-2 focus:ring-cinema-500 focus:border-transparent outline-none w-40 focus:w-60 transition-all placeholder-gray-600"
          />
        </div>

        <div class="h-6 w-px bg-white/10 hidden md:block"></div>

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
          class="form-select text-gray-400"
        >
          <option value="latest">Latest</option>
          <option value="popular">Popular</option>
          <option value="rating">Top Rated</option>
          <option value="title">A-Z</option>
        </select>
      </div>

      @if (hasActiveFilters()) {
        <div class="flex flex-wrap gap-2 mt-3 pt-2 border-t border-dashed border-white/10">
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
          
          <button (click)="resetAll()" class="text-xs text-cinema-500 hover:text-cinema-100 font-medium ml-auto transition-colors">
            Clear All
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .form-select {
      @apply appearance-none bg-cinema-800 border border-white/10 text-gray-300 py-2 px-4 pr-8 rounded-sm text-sm leading-tight focus:outline-none focus:border-cinema-500 cursor-pointer hover:border-white/20 transition-colors;
      background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%239ca3af' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
      background-position: right 0.5rem center;
      background-repeat: no-repeat;
      background-size: 1.5em 1.5em;
    }
    .chip {
      @apply bg-cinema-500/20 text-cinema-100 text-xs px-2 py-1 rounded-sm hover:bg-cinema-500/40 transition-colors cursor-pointer flex items-center gap-1;
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
