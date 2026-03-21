import {
  Component,
  inject,
  effect,
  signal,
  OnDestroy,
  PLATFORM_ID,
  ElementRef,
  ViewChild,
  HostBinding,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MusicPlayerService } from '../../services/music-player.service';
import { MusicApiService } from '../../services/music-api.service';
import ColorThief from 'colorthief';

@Component({
  selector: 'app-mini-player',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styles: [`
    .progress-track {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: rgba(255,255,255,0.1);
      overflow: hidden;
    }
    .progress-bar {
      height: 100%;
      width: 40%;
      background: var(--now-playing-color, #800020);
      border-radius: 1px;
      animation: none;
    }
    .progress-bar.playing {
      animation: music-scan 2.4s ease-in-out infinite;
    }
    @keyframes music-scan {
      0%   { transform: translateX(-100%); opacity: 0.7; }
      50%  { opacity: 1; }
      100% { transform: translateX(300%); opacity: 0.7; }
    }
    .thumbnail-glow {
      box-shadow: 0 0 16px 2px var(--now-playing-color-alpha, rgba(128,0,32,0.4));
      transition: box-shadow 0.6s ease;
    }
    .queue-dot {
      width: 3px; height: 3px;
      border-radius: 50%;
      background: var(--now-playing-color, #800020);
      display: inline-block;
    }
  `],
  template: `
    @if (player.currentTrack()) {
      <div
        class="fixed left-0 right-0 z-[51] backdrop-blur-xl border-t
               flex items-center gap-3 px-4 shadow-2xl
               bottom-[92px] md:bottom-0 md:left-20"
        style="background: rgba(10,10,10,0.96); border-color: rgba(255,255,255,0.08); padding-top: 10px; padding-bottom: 10px;"
      >
        <!-- Progress scrubber bar at very top -->
        <div class="progress-track">
          <div
            class="progress-bar"
            [ngClass]="player.isPlaying() ? 'playing' : ''"
          ></div>
        </div>

        <!-- Hidden YouTube iframe — actual audio engine -->
        @if (iframeSrc()) {
          <iframe
            #ytFrame
            [src]="iframeSrc()!"
            width="0"
            height="0"
            frameborder="0"
            allow="autoplay; encrypted-media"
            style="position:absolute;pointer-events:none;opacity:0;"
            title="Music player"
          ></iframe>
        }

        <!-- Thumbnail + link to watch page -->
        <a
          [routerLink]="['/music', player.currentTrack()!.slug]"
          class="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden thumbnail-glow"
        >
          <img
            #thumbImg
            [src]="player.currentTrack()!.thumbnailUrl || ''"
            [alt]="player.currentTrack()!.title"
            class="w-full h-full object-cover transition-opacity duration-300"
            loading="lazy"
            crossorigin="anonymous"
            (load)="onThumbnailLoad(thumbImg)"
          >
        </a>

        <!-- Title + artist + queue position -->
        <div class="flex-1 min-w-0">
          <p class="text-white text-sm font-semibold truncate leading-tight tracking-tight">
            {{ player.currentTrack()!.title }}
          </p>
          <div class="flex items-center gap-1.5 mt-0.5">
            <p class="text-gray-400 text-xs truncate">{{ player.currentTrack()!.artist }}</p>
            @if (player.queue().length > 1) {
              <span class="queue-dot flex-shrink-0"></span>
              <span class="text-gray-600 text-xs flex-shrink-0">
                {{ player.queueIndex() + 1 }}&thinsp;/&thinsp;{{ player.queue().length }}
              </span>
            }
          </div>
        </div>

        <!-- Controls -->
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <!-- Prev -->
          <button
            (click)="player.prev()"
            [disabled]="!player.hasPrev()"
            class="w-8 h-8 rounded-full flex items-center justify-center text-gray-400
                   hover:text-white hover:bg-white/10 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
            aria-label="Previous"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
            </svg>
          </button>

          <!-- Play / Pause -->
          <button
            (click)="togglePlay()"
            class="w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg"
            style="background: var(--now-playing-color, #800020);"
            [attr.aria-label]="player.isPlaying() ? 'Pause' : 'Play'"
          >
            @if (player.isPlaying()) {
              <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
            } @else {
              <svg class="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            }
          </button>

          <!-- Next -->
          <button
            (click)="player.next()"
            [disabled]="!player.hasNext()"
            class="w-8 h-8 rounded-full flex items-center justify-center text-gray-400
                   hover:text-white hover:bg-white/10 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
            aria-label="Next"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
            </svg>
          </button>

          <!-- Shuffle -->
          <button
            (click)="player.toggleShuffle()"
            class="w-8 h-8 rounded-full flex items-center justify-center transition-all hidden sm:flex"
            [ngClass]="player.isShuffle() ? 'text-[#800020]' : 'text-gray-600 hover:text-white'"
            aria-label="Shuffle"
          >
            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>
            </svg>
          </button>

          <!-- Repeat -->
          <button
            (click)="player.cycleRepeat()"
            class="w-8 h-8 rounded-full flex items-center justify-center transition-all hidden sm:flex"
            [ngClass]="player.repeatMode() !== 'none' ? 'text-[#800020]' : 'text-gray-600 hover:text-white'"
            aria-label="Repeat"
          >
            @if (player.repeatMode() === 'one') {
              <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"/>
              </svg>
            } @else {
              <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
              </svg>
            }
          </button>

          <!-- Close -->
          <button
            (click)="player.clearQueue()"
            class="w-8 h-8 rounded-full flex items-center justify-center text-gray-600
                   hover:text-white hover:bg-white/10 transition-all ml-1"
            aria-label="Close player"
          >
            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
      </div>
    }
  `
})
export class MiniPlayerComponent implements OnDestroy {
  @ViewChild('ytFrame') private ytFrame?: ElementRef<HTMLIFrameElement>;

  player = inject(MusicPlayerService);
  private musicApi = inject(MusicApiService);
  private sanitizer = inject(DomSanitizer);
  private platformId = inject(PLATFORM_ID);

  iframeSrc = signal<SafeResourceUrl | null>(null);
  private boundMessageHandler?: (e: MessageEvent) => void;
  // Track the youtubeId currently loaded so we don't reload for play/pause
  private loadedYoutubeId: string | null = null;

  @HostBinding('style.--now-playing-color') nowPlayingColor = '#800020';
  @HostBinding('style.--now-playing-color-alpha') nowPlayingColorAlpha = 'rgba(128,0,32,0.4)';

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.boundMessageHandler = this.onYtMessage.bind(this);
      window.addEventListener('message', this.boundMessageHandler);
    }

    // React to track changes — load new iframe src
    effect(() => {
      const track = this.player.currentTrack();
      if (!track?.youtubeId || !isPlatformBrowser(this.platformId)) return;

      if (this.loadedYoutubeId === track.youtubeId) {
        // Same track — just play/pause
        if (this.player.isPlaying()) {
          this.sendCommand('playVideo');
        } else {
          this.sendCommand('pauseVideo');
        }
        return;
      }

      // New track — set iframe src (autoplay=1 starts playback immediately)
      this.loadedYoutubeId = track.youtubeId;
      const url = `https://www.youtube.com/embed/${track.youtubeId}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1&origin=${encodeURIComponent(window.location.origin)}`;
      this.iframeSrc.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
      this.player.isPlaying.set(true);

      // Fire play count
      this.musicApi.incrementPlay(track.id).subscribe();
    }, { allowSignalWrites: true });

    // React to isPlaying changes when track is already loaded
    effect(() => {
      const playing = this.player.isPlaying();
      const track = this.player.currentTrack();
      if (!track || !isPlatformBrowser(this.platformId)) return;
      if (this.loadedYoutubeId !== track.youtubeId) return; // let track-change effect handle it

      if (playing) {
        this.sendCommand('playVideo');
      } else {
        this.sendCommand('pauseVideo');
      }
    });
  }

  togglePlay(): void {
    this.player.togglePlay();
  }

  onThumbnailLoad(img: HTMLImageElement): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const ct = new ColorThief();
      const [r, g, b] = ct.getColor(img);
      this.nowPlayingColor = `rgb(${r},${g},${b})`;
      this.nowPlayingColorAlpha = `rgba(${r},${g},${b},0.45)`;
    } catch {
      // fallback to brand crimson
      this.nowPlayingColor = '#800020';
      this.nowPlayingColorAlpha = 'rgba(128,0,32,0.4)';
    }
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId) && this.boundMessageHandler) {
      window.removeEventListener('message', this.boundMessageHandler);
    }
  }

  private sendCommand(func: string): void {
    const frame = this.ytFrame?.nativeElement;
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func, args: '' }),
      '*'
    );
  }

  private onYtMessage(event: MessageEvent): void {
    if (!event.origin.includes('youtube.com')) return;

    let data: Record<string, unknown>;
    try {
      data = typeof event.data === 'string'
        ? (JSON.parse(event.data) as Record<string, unknown>)
        : (event.data as Record<string, unknown>);
    } catch {
      return;
    }

    if (data['event'] !== 'infoDelivery') return;

    const info = data['info'] as Record<string, unknown> | undefined;
    if (!info) return;

    // playerState: 0 = ended, 1 = playing, 2 = paused
    const state = info['playerState'];
    if (state === 0) {
      this.player.onTrackEnd();
    } else if (state === 1) {
      this.player.isPlaying.set(true);
    } else if (state === 2) {
      this.player.isPlaying.set(false);
    }
  }
}
