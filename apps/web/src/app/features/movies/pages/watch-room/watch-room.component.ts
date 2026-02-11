import { Component, inject, input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MoviesQueryService } from "../../services/movies-query.service";
import { VideoPlayerComponent } from "../../../../shared/components/video-player/video-player.component";
import { BrandedIntroComponent } from "../../../../shared/components/branded-intro/branded-intro.component";
import { RouterLink } from "@angular/router";

@Component({
  selector: "app-watch-room",
  standalone: true,
  imports: [
    CommonModule,
    VideoPlayerComponent,
    BrandedIntroComponent,
    RouterLink,
  ],
  template: `
    <div class="min-h-screen bg-[#0a0a0a] dark:bg-cinema-900 flex flex-col">
      <!-- Branded Intro -->
      @if (showIntro) {
        <app-branded-intro (introFinished)="onIntroFinished()">
        </app-branded-intro>
      }

      <header
        class="p-4 flex items-center gap-4 bg-black/50 backdrop-blur-md sticky top-0 z-50"
      >
        <a
          [routerLink]="['/movies', slug()]"
          class="text-[#9a857d] dark:text-gray-400 hover:text-[#24181b] dark:hover:text-white transition-colors"
        >
          ← Back to Details
        </a>
        @if (movie(); as m) {
          <h1 class="text-[#24181b] dark:text-white font-serif text-lg">{{ m.title }}</h1>
        }
      </header>

      <div class="flex-grow flex items-center justify-center p-4 md:p-10">
        <div class="w-full max-w-6xl">
          @if (movie(); as m) {
            <app-video-player
              [youtubeId]="m.youtubeId"
              [movieId]="m.id"
              [movie]="m"
              [config]="playerConfig"
              (playerReady)="onPlayerReady()"
            >
            </app-video-player>

            <div
              class="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4"
            >
              <p class="text-[#9a857d] dark:text-gray-500 text-sm text-center sm:text-left">
                Streaming via YouTube • Support the creators by subscribing to
                their channel.
              </p>

              <!-- Keyboard Shortcuts Hint -->
              <div class="flex items-center gap-4 text-[#9a857d] dark:text-gray-600 text-xs">
                <span class="flex items-center gap-1">
                  <kbd class="bg-[#2a2a2a] dark:bg-gray-800 px-2 py-1 rounded">←</kbd>
                  <kbd class="bg-[#2a2a2a] dark:bg-gray-800 px-2 py-1 rounded">→</kbd>
                  Skip
                </span>
                <span class="flex items-center gap-1">
                  <kbd class="bg-[#2a2a2a] dark:bg-gray-800 px-2 py-1 rounded">Space</kbd>
                  Play/Pause
                </span>
              </div>
            </div>
          } @else {
            <div class="flex items-center justify-center h-64">
              <div
                class="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"
              ></div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class WatchRoomComponent {
  slug = input.required<string>();
  private movieQuery = inject(MoviesQueryService);
  query = this.movieQuery.getMovieDetailQuery(this.slug);

  showIntro = true;

  playerConfig = {
    showSkipButtons: true,
    autoResume: true,
    saveProgress: true,
  };

  movie() {
    return this.query.data()?.data;
  }

  onIntroFinished() {
    this.showIntro = false;
  }

  onPlayerReady() {
    // Player is ready to play
    console.log("Player ready");
  }
}
