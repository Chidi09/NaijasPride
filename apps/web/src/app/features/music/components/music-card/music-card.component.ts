import { Component, Input, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { MusicVideoSummary } from "@naijaspride/types";
import { MusicPlayerService } from "../../services/music-player.service";

@Component({
  selector: "app-music-card",
  standalone: true,
  imports: [CommonModule, RouterLink],
  styles: [
    `
      .vinyl-ring {
        position: absolute;
        inset: 0;
        border-radius: 9999px;
        border: 3px solid rgba(255, 255, 255, 0.15);
        transform: scale(0.7);
        opacity: 0;
        transition: all 0.3s ease;
      }
      .group:hover .vinyl-ring {
        opacity: 1;
        animation: spin 4s linear infinite;
      }
      @keyframes spin {
        from {
          transform: scale(0.7) rotate(0deg);
        }
        to {
          transform: scale(0.7) rotate(360deg);
        }
      }
    `,
  ],
  template: `
    <div
      [routerLink]="['/music', video.slug]"
      class="group relative bg-[var(--music-surface)] border border-[var(--music-border)] rounded-lg overflow-hidden cursor-pointer
             transition-transform duration-300 ease-out hover:scale-[1.03] hover:shadow-2xl hover:shadow-black/20"
    >
      <!-- 1:1 square thumbnail -->
      <div class="aspect-square relative overflow-hidden">
        @if (video.thumbnailUrl) {
          <img
            [src]="thumbnailUrl(video)"
            [alt]="video.title"
            class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            referrerpolicy="no-referrer"
            (error)="onImageError($event, video)"
          />
        } @else {
          <div
            class="w-full h-full flex items-center justify-center bg-[var(--music-surface-strong)]"
          >
            <svg
              class="w-12 h-12 text-[var(--music-text-muted)]"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
              />
            </svg>
          </div>
        }

        <!-- Vinyl badge on hover -->
        <div class="vinyl-ring"></div>

        <!-- Dark overlay + play button on hover -->
        <div
          class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center"
        >
          <button
            (click)="onPlay($event)"
            class="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center
                   hover:bg-white hover:scale-110 transition-all duration-200 shadow-xl"
            [attr.aria-label]="'Play ' + video.title"
          >
            <svg
              class="w-5 h-5 text-gray-900 ml-0.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        </div>

        <!-- Official/Explicit badges -->
        <div class="absolute top-2 left-2 flex gap-1">
          @if (!video.isOfficial) {
            <span
              class="bg-orange-500/90 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full"
              >FAN</span
            >
          }
          @if (video.isExplicit) {
            <span
              class="bg-gray-700/90 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full"
              >E</span
            >
          }
        </div>
      </div>

      <!-- Title + artist — always visible at bottom -->
      <div class="px-3 py-2.5 bg-[var(--music-surface)]">
        <p
          class="text-[var(--music-text)] text-sm font-semibold leading-tight truncate"
        >
          {{ video.title }}
        </p>
        <p class="text-[var(--music-text-muted)] text-xs mt-0.5 truncate">
          <a
            [routerLink]="['/music/artist', video.artistSlug]"
            class="hover:text-[#800020] transition-colors"
            (click)="$event.stopPropagation()"
            >{{ video.artist }}</a
          >
          @if (video.featuring.length > 0) {
            <span class="text-[var(--music-text-muted)]">
              ft. {{ video.featuring.join(", ") }}</span
            >
          }
        </p>
        <div
          class="mt-1 flex items-center gap-2 text-[10px] text-[var(--music-text-muted)] sans-text"
        >
          <span>{{ video.year }}</span>
          <span>•</span>
          @if (video.ytViewCount > 0) {
            <span class="flex items-center gap-1 text-red-400">
              <svg
                class="w-2.5 h-2.5"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"
                />
              </svg>
              {{ formatCount(video.ytViewCount) }}
            </span>
          } @else {
            <span>{{ formatCount(video.viewCount) }} views</span>
          }
        </div>
      </div>
    </div>
  `,
})
export class MusicCardComponent {
  @Input({ required: true }) video!: MusicVideoSummary;

  private player = inject(MusicPlayerService);

  onPlay(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.player.play(this.video);
  }

  thumbnailUrl(video: MusicVideoSummary): string {
    return (
      video.hdThumbnailUrl ||
      video.thumbnailUrl ||
      `https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg`
    );
  }

  onImageError(event: Event, video: MusicVideoSummary): void {
    const img = event.target as HTMLImageElement | null;
    if (!img || !video.youtubeId) return;

    const fallbackCandidates = [
      `https://i.ytimg.com/vi/${video.youtubeId}/mqdefault.jpg`,
      `https://i.ytimg.com/vi/${video.youtubeId}/default.jpg`,
    ];

    const currentIndex = Number.parseInt(img.dataset.fallbackIndex || "0", 10);
    const nextIndex = Number.isFinite(currentIndex) ? currentIndex : 0;

    if (nextIndex >= fallbackCandidates.length) {
      img.onerror = null;
      return;
    }

    img.dataset.fallbackIndex = String(nextIndex + 1);
    img.src = fallbackCandidates[nextIndex];
  }

  formatCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }
}
