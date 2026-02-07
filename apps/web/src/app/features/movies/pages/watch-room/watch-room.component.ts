import { Component, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MoviesQueryService } from '../../services/movies-query.service';
import { VideoPlayerComponent } from '../../../../shared/components/video-player/video-player.component';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-watch-room',
  standalone: true,
  imports: [CommonModule, VideoPlayerComponent, RouterLink],
  template: `
    <div class="min-h-screen bg-cinema-900 flex flex-col">
      <header class="p-4 flex items-center gap-4 bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <a [routerLink]="['/movies', slug()]" class="text-gray-400 hover:text-white transition-colors">
          ← Back to Details
        </a>
        @if (query.data()?.data; as movie) {
          <h1 class="text-white font-serif text-lg">{{ movie.title }}</h1>
        }
      </header>

      <div class="flex-grow flex items-center justify-center p-4 md:p-10">
        <div class="w-full max-w-6xl">
          @if (query.isSuccess()) {
            @if (query.data()?.data; as movie) {
              <app-video-player [youtubeId]="movie.youtubeId"></app-video-player>
              
              <div class="mt-6 text-center">
                <p class="text-gray-500 text-sm">
                  Streaming via YouTube • Support the creators by subscribing to their channel.
                </p>
              </div>
            }
          }
        </div>
      </div>
    </div>
  `
})
export class WatchRoomComponent {
  slug = input.required<string>();
  query = inject(MoviesQueryService).getMovieDetailQuery(this.slug);
}
