import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MovieSummary } from '@naijaspride/types';

@Component({
  selector: 'app-movie-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div [routerLink]="['/movies', movie.slug]" class="group relative bg-white rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden cursor-pointer">
      <div class="aspect-[2/3] bg-gray-200 relative overflow-hidden">
        @if (movie.thumbnailUrl) {
          <img 
            [src]="movie.thumbnailUrl" 
            [alt]="movie.title"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          >
        } @else {
          <div class="w-full h-full flex items-center justify-center text-gray-400">
            <span class="text-4xl">🎬</span>
          </div>
        }
        
        @if (movie.nollywood) {
          <div class="absolute top-2 left-2 bg-green-600 text-white text-xs font-bold px-2 py-1 rounded-md shadow-sm">
            Nollywood
          </div>
        }
      </div>

      <div class="p-3">
        <h3 class="font-bold text-gray-900 truncate" [title]="movie.title">
          {{ movie.title }}
        </h3>
        <div class="flex items-center justify-between mt-1 text-sm text-gray-600">
          <span>{{ movie.year }}</span>
          <div class="flex items-center text-amber-500">
            <span class="mr-1">★</span>
            <span>{{ movie.rating || '-' }}</span>
          </div>
        </div>
        <div class="mt-2 text-xs text-gray-500 flex flex-wrap gap-1">
          @for (q of movie.quality; track q) {
            <span class="border border-gray-200 px-1.5 py-0.5 rounded text-gray-400">
              {{ q }}
            </span>
          }
        </div>
      </div>
    </div>
  `
})
export class MovieCardComponent {
  @Input({ required: true }) movie!: MovieSummary;
}
