import { Component, Input } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MovieSummary } from '@naijaspride/types';

/**
 * YouTube-style movie card component
 * - 16:9 aspect ratio for thumbnails
 - Title always visible below poster
 * - Quality badges always visible
 * - Better for stream-only content
 */
@Component({
  selector: 'app-movie-card-youtube',
  standalone: true,
  imports: [CommonModule, RouterLink, NgOptimizedImage],
  template: `
    <div 
      [routerLink]="['/movies', movie.slug]" 
      class="group cursor-pointer transition-transform duration-200 ease-out hover:scale-105"
    >
      <!-- Thumbnail Container - 16:9 Aspect Ratio -->
      <div class="aspect-video relative rounded-lg overflow-hidden bg-cinema-800">
        @if (movie.thumbnailUrl || movie.coverUrl || movie.posterUrl) {
          <img 
            [ngSrc]="movie.thumbnailUrl || movie.coverUrl || movie.posterUrl!" 
            [alt]="movie.title"
            fill
            sizes="(min-width: 1024px) 20vw, (min-width: 768px) 33vw, 50vw"
            class="w-full h-full object-cover"
          >
        } @else {
          <div class="w-full h-full flex items-center justify-center bg-cinema-700">
            <span class="text-4xl text-cinema-500">🎬</span>
          </div>
        }
        
        <!-- Quality Badge - Always Visible -->
        @if (movie.quality?.includes('4K')) {
          <div class="absolute top-2 right-2 bg-black/80 text-white text-[10px] font-bold px-2 py-1 rounded">
            4K
          </div>
        } @else if (movie.quality?.includes('Q1080p')) {
          <div class="absolute top-2 right-2 bg-black/80 text-white text-[10px] font-bold px-2 py-1 rounded">
            HD
          </div>
        }

        <!-- Duration Badge -->
        @if (movie.durationMinutes) {
          <div class="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-medium px-2 py-1 rounded">
            {{ formatDuration(movie.durationMinutes) }}
          </div>
        }

        <!-- Watch Progress Bar -->
        @if (progressPercent > 0) {
          <div class="absolute inset-x-0 bottom-0 h-1 bg-black/60">
            <div
              class="h-full bg-red-600"
              [style.width.%]="progressPercent"
            ></div>
          </div>
        }
      </div>

      <!-- Movie Info - Always Visible -->
      <div class="mt-2 space-y-1">
        <!-- Title -->
        <h3 class="text-white text-sm font-medium line-clamp-2 leading-tight group-hover:text-cinema-300 transition-colors">
          {{ movie.title }}
        </h3>
        
        <!-- Meta Row -->
        <div class="flex items-center gap-2 text-xs text-gray-400">
          @if (movie.rating) {
            <span class="text-green-400 font-medium">{{ movie.rating }}% Match</span>
          }
          <span>{{ movie.year }}</span>
          
          @if (movie.genre?.length > 0) {
            <span class="text-gray-500">•</span>
            <span class="truncate max-w-[100px]">{{ movie.genre[0] }}</span>
          }
          
          @if (movie.isStreamOnly) {
            <span class="text-gray-500">•</span>
            <span class="text-blue-400">YouTube</span>
          }
        </div>

        <!-- Channel/Source -->
        @if (movie.uploadedBy || movie.channel) {
          <div class="text-xs text-gray-500 truncate">
            {{ movie.uploadedBy || movie.channel }}
          </div>
        }
      </div>
    </div>
  `
})
export class MovieCardYoutubeComponent {
  @Input({ required: true }) movie!: MovieSummary & { isStreamOnly?: boolean; channel?: string };
  @Input() progress: number | null = null;

  get progressPercent() {
    if (this.progress === null || Number.isNaN(this.progress)) {
      return 0;
    }
    return Math.max(0, Math.min(100, this.progress));
  }

  formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:00`;
    }
    return `${mins}:00`;
  }
}
