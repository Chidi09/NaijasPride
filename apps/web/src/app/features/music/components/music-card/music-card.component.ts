import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MusicVideoSummary } from '@naijaspride/types';
import { MusicPlayerService } from '../../services/music-player.service';

@Component({
  selector: 'app-music-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styles: [`
    .vinyl-ring {
      position: absolute;
      inset: 0;
      border-radius: 9999px;
      border: 3px solid rgba(255,255,255,0.15);
      transform: scale(0.7);
      opacity: 0;
      transition: all 0.3s ease;
    }
    .group:hover .vinyl-ring {
      opacity: 1;
      animation: spin 4s linear infinite;
    }
    @keyframes spin {
      from { transform: scale(0.7) rotate(0deg); }
      to   { transform: scale(0.7) rotate(360deg); }
    }
  `],
  template: `
    <div
      class="group relative bg-gray-900 rounded-lg overflow-hidden cursor-pointer
             transition-transform duration-300 ease-out hover:scale-[1.03] hover:shadow-2xl hover:shadow-black/40"
    >
      <!-- 1:1 square thumbnail -->
      <div class="aspect-square relative overflow-hidden">
        @if (video.thumbnailUrl) {
          <img
            [src]="video.hdThumbnailUrl || video.thumbnailUrl"
            [alt]="video.title"
            class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          >
        } @else {
          <div class="w-full h-full flex items-center justify-center bg-gray-800">
            <svg class="w-12 h-12 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
          </div>
        }

        <!-- Vinyl badge on hover -->
        <div class="vinyl-ring"></div>

        <!-- Dark overlay + play button on hover -->
        <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <button
            (click)="onPlay($event)"
            class="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center
                   hover:bg-white hover:scale-110 transition-all duration-200 shadow-xl"
            [attr.aria-label]="'Play ' + video.title"
          >
            <svg class="w-5 h-5 text-gray-900 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
        </div>

        <!-- Official/Explicit badges -->
        <div class="absolute top-2 left-2 flex gap-1">
          @if (!video.isOfficial) {
            <span class="bg-orange-500/90 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">FAN</span>
          }
          @if (video.isExplicit) {
            <span class="bg-gray-700/90 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">E</span>
          }
        </div>
      </div>

      <!-- Title + artist — always visible at bottom -->
      <div
        [routerLink]="['/music', video.slug]"
        class="px-3 py-2.5 bg-gray-900"
      >
        <p class="text-white text-sm font-semibold leading-tight truncate">{{ video.title }}</p>
        <p class="text-gray-400 text-xs mt-0.5 truncate">
          <a
            [routerLink]="['/music/artist', video.artistSlug]"
            class="hover:text-gray-200 transition-colors"
            (click)="$event.stopPropagation()"
          >{{ video.artist }}</a>
          @if (video.featuring.length > 0) {
            <span class="text-gray-500"> ft. {{ video.featuring.join(', ') }}</span>
          }
        </p>
      </div>
    </div>
  `
})
export class MusicCardComponent {
  @Input({ required: true }) video!: MusicVideoSummary;

  private player = inject(MusicPlayerService);

  onPlay(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.player.play(this.video);
  }
}
