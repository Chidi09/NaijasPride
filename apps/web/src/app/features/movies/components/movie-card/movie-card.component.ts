import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MovieSummary } from '@naijaspride/types';

@Component({
  selector: 'app-movie-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div 
      [routerLink]="['/movies', movie.slug]" 
      class="group relative bg-cinema-800 rounded-sm overflow-hidden cursor-pointer transition-all duration-300 ease-out hover:z-10 hover:scale-105 hover:shadow-2xl hover:shadow-black/50"
    >
      <div class="aspect-[2/3] relative">
        @if (movie.thumbnailUrl) {
          <img 
            [src]="movie.thumbnailUrl" 
            [alt]="movie.title"
            class="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
            loading="lazy"
          >
        } @else {
          <div class="w-full h-full flex items-center justify-center bg-cinema-700">
            <span class="text-4xl text-cinema-500">🎬</span>
          </div>
        }
        
        @if (movie.quality?.includes('4K')) {
          <div class="absolute top-0 right-0 bg-cinema-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-bl-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            4K UHD
          </div>
        }
      </div>

      <div class="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-4">
        
        <h3 class="font-serif text-white text-lg leading-tight mb-1 drop-shadow-md">{{ movie.title }}</h3>
        
        <div class="flex items-center gap-3 text-[10px] text-gray-300 font-medium">
          <span class="text-green-400">{{ movie.rating || 95 }}% Match</span>
          <span class="border border-gray-500 px-1 rounded-sm">{{ movie.year }}</span>
          <span>{{ movie.durationMinutes ? (movie.durationMinutes + 'm') : '' }}</span>
          <span class="border border-gray-500 px-1 rounded-sm uppercase text-[9px]">HD</span>
        </div>

        <div class="mt-3 flex gap-2">
           <button class="bg-white text-black rounded-full p-1.5 hover:bg-cinema-100 transition-colors" (click)="$event.stopPropagation()">
             <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
           </button>
           <button class="border border-gray-400 rounded-full p-1.5 hover:border-white transition-colors" (click)="$event.stopPropagation()">
             <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
           </button>
        </div>
      </div>
    </div>
  `
})
export class MovieCardComponent {
  @Input({ required: true }) movie!: MovieSummary;
}
