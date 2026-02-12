import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Genre, Quality, MovieSearchParams } from '@naijaspride/types';

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="sticky top-20 z-30 bg-[#f9efe8]/95 dark:bg-cinema-900/95 backdrop-blur-sm border-b border-[#d8c2b8]/60 dark:border-white/5 py-3 mb-6 transition-all">
      <div class="flex flex-wrap gap-3 items-center">
        
        <div class="relative group">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg class="w-4 h-4 text-[#8a756e] dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>
          <input
            type="text"
            [ngModel]="activeFilters.q"
            (ngModelChange)="onQueryChange($event)"
            aria-label="Search movies"
            placeholder="Search..."
            class="pl-9 pr-4 py-2 bg-white dark:bg-cinema-800 border border-[#d8c2b8] dark:border-white/10 rounded-sm text-sm text-[#2a1c1f] dark:text-white focus:ring-2 focus:ring-cinema-500/30 focus:border-cinema-500 outline-none w-full sm:w-56 md:w-40 md:focus:w-60 transition-all placeholder-[#8f7a72] dark:placeholder-gray-600"
          />
        </div>

        <div class="h-6 w-px bg-[#d8c2b8] dark:bg-white/10 hidden md:block"></div>

        <select
          [ngModel]="activeFilters.genre?.[0] || ''" 
          (ngModelChange)="updateFilter('genre', $event ? [$event] : undefined)"
          aria-label="Filter by genre"
          class="appearance-none bg-white dark:bg-cinema-800 border border-[#d8c2b8] dark:border-white/10 text-[#5f4d47] dark:text-gray-300 py-2 px-4 rounded-sm text-sm leading-tight focus:outline-none focus:ring-2 focus:ring-cinema-500/30 focus:border-cinema-500 cursor-pointer hover:border-[#b99f92] dark:hover:border-white/20 transition-colors"
        >
          <option value="">All Genres</option>
          @for (g of genres; track g) {
            <option [value]="g">{{ g }}</option>
          }
        </select>

        <select
          [ngModel]="activeFilters.year || ''"
          (ngModelChange)="updateFilter('year', $event ? +$event : undefined)"
          aria-label="Filter by year"
          class="appearance-none bg-white dark:bg-cinema-800 border border-[#d8c2b8] dark:border-white/10 text-[#5f4d47] dark:text-gray-300 py-2 px-4 rounded-sm text-sm leading-tight focus:outline-none focus:ring-2 focus:ring-cinema-500/30 focus:border-cinema-500 cursor-pointer hover:border-[#b99f92] dark:hover:border-white/20 transition-colors"
        >
          <option value="">All Years</option>
          @for (y of years; track y) {
            <option [value]="y">{{ y }}</option>
          }
        </select>

        <select
          [ngModel]="activeFilters.quality || ''"
          (ngModelChange)="updateFilter('quality', $event || undefined)"
          aria-label="Filter by quality"
          class="appearance-none bg-white dark:bg-cinema-800 border border-[#d8c2b8] dark:border-white/10 text-[#5f4d47] dark:text-gray-300 py-2 px-4 rounded-sm text-sm leading-tight focus:outline-none focus:ring-2 focus:ring-cinema-500/30 focus:border-cinema-500 cursor-pointer hover:border-[#b99f92] dark:hover:border-white/20 transition-colors"
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
          aria-label="Sort movies"
          class="appearance-none bg-white dark:bg-cinema-800 border border-[#d8c2b8] dark:border-white/10 text-[#6f5b54] dark:text-gray-400 py-2 px-4 rounded-sm text-sm leading-tight focus:outline-none focus:ring-2 focus:ring-cinema-500/30 focus:border-cinema-500 cursor-pointer hover:border-[#b99f92] dark:hover:border-white/20 transition-colors"
        >
          <option value="latest">Latest</option>
          <option value="popular">Popular</option>
          <option value="rating">Top Rated</option>
          <option value="title">A-Z</option>
        </select>
      </div>

      @if (hasActiveFilters()) {
        <div class="flex flex-wrap gap-2 mt-3 pt-2 border-t border-dashed border-[#d8c2b8] dark:border-white/10">
          <span class="text-xs text-[#8a756e] dark:text-gray-500 self-center uppercase font-bold tracking-wider mr-1">Active:</span>
          
          @if (activeFilters.genre) {
            <button (click)="updateFilter('genre', undefined)" class="inline-flex items-center gap-1 bg-cinema-500/20 text-[#4f0f21] dark:text-cinema-100 text-xs px-2 py-1 rounded-sm hover:bg-cinema-500/30 transition-colors" aria-label="Remove genre filter">
              {{ activeFilters.genre[0] }} ✕
            </button>
          }
          @if (activeFilters.year) {
            <button (click)="updateFilter('year', undefined)" class="inline-flex items-center gap-1 bg-cinema-500/20 text-[#4f0f21] dark:text-cinema-100 text-xs px-2 py-1 rounded-sm hover:bg-cinema-500/30 transition-colors" aria-label="Remove year filter">
              {{ activeFilters.year }} ✕
            </button>
          }
          @if (activeFilters.quality) {
            <button (click)="updateFilter('quality', undefined)" class="inline-flex items-center gap-1 bg-cinema-500/20 text-[#4f0f21] dark:text-cinema-100 text-xs px-2 py-1 rounded-sm hover:bg-cinema-500/30 transition-colors" aria-label="Remove quality filter">
              {{ activeFilters.quality }} ✕
            </button>
          }
          
          <button (click)="resetAll()" class="text-xs text-cinema-500 hover:text-[#4f0f21] dark:hover:text-cinema-100 font-medium ml-auto transition-colors" aria-label="Clear all active filters">
            Clear All
          </button>
        </div>
      }
    </div>
  `,
})
export class FilterBarComponent {
  @Input({ required: true }) activeFilters!: MovieSearchParams;
  @Output() filterChange = new EventEmitter<Partial<MovieSearchParams>>();

  private queryDebounce?: ReturnType<typeof setTimeout>;

  // Enum to Array conversion for templates
  genres = Object.values(Genre);
  qualities = Object.values(Quality);
  
  // Generate last 20 years dynamically
  currentYear = new Date().getFullYear();
  years = Array.from({ length: 20 }, (_, i) => this.currentYear - i);

  updateFilter(key: keyof MovieSearchParams, value: unknown) {
    this.filterChange.emit({ [key]: value });
  }

  onQueryChange(nextValue: string) {
    if (this.queryDebounce) {
      clearTimeout(this.queryDebounce);
    }
    this.queryDebounce = setTimeout(() => {
      this.updateFilter('q', nextValue);
    }, 250);
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

