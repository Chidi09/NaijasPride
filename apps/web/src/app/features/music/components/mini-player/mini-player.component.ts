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
} from "@angular/core";
import { CommonModule, isPlatformBrowser } from "@angular/common";
import { RouterLink } from "@angular/router";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { MusicPlayerService } from "../../services/music-player.service";
import { MusicApiService } from "../../services/music-api.service";

@Component({
  selector: "app-mini-player",
  standalone: true,
  imports: [CommonModule, RouterLink],
  styles: [
    `
      /* ─── Floating pill shell ─────────────────────────────── */
      .pill-player {
        position: fixed;
        z-index: 51;

        /* Mobile: full-width glass bar above bottom nav */
        left: 0;
        right: 0;
        bottom: 92px;
        border-radius: 0;

        /* Glass surface */
        background: rgba(18, 18, 22, 0.68);
        backdrop-filter: blur(40px) saturate(200%) brightness(115%);
        -webkit-backdrop-filter: blur(40px) saturate(200%) brightness(115%);
        border-top: 1px solid rgba(255, 255, 255, 0.12);
        border-bottom: 1px solid rgba(0, 0, 0, 0.3);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.18),
          0 -4px 32px rgba(0, 0, 0, 0.4),
          0 0 80px -20px var(--now-playing-color-alpha, rgba(128, 0, 32, 0.3));

        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        overflow: hidden;
        transition:
          box-shadow 0.6s ease,
          border-color 0.6s ease;
      }

      /* Desktop: floating pill, centered in content area */
      @media (min-width: 768px) {
        .pill-player {
          bottom: 20px;
          left: 50%;
          right: auto;
          transform: translateX(
            calc(-50% + 40px)
          ); /* +40px = half of 80px sidebar */
          width: 600px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.13);
          border-top: 1px solid rgba(255, 255, 255, 0.2); /* stronger top catch */
          border-bottom: 1px solid rgba(0, 0, 0, 0.25);
          padding: 8px 16px 8px 8px;
          box-shadow:
          /* specular top edge */
            inset 0 1.5px 0 rgba(255, 255, 255, 0.22),
            /* inner bottom shadow */ inset 0 -1px 0 rgba(0, 0, 0, 0.2),
            /* deep float shadow */ 0 24px 64px rgba(0, 0, 0, 0.6),
            0 8px 24px rgba(0, 0, 0, 0.4),
            /* color glow */ 0 0 60px -8px
              var(--now-playing-color-alpha, rgba(128, 0, 32, 0.25));
          transition:
            box-shadow 0.6s ease,
            transform 0.3s ease;
        }
      }

      /* ─── Specular shine layer (light refracting through glass) */
      .glass-shine {
        position: absolute;
        inset: 0;
        pointer-events: none;
        border-radius: inherit;
        background: linear-gradient(
          145deg,
          rgba(255, 255, 255, 0.13) 0%,
          rgba(255, 255, 255, 0.05) 20%,
          transparent 50%
        );
        z-index: 0;
      }

      /* All direct children sit above the shine layer */
      .pill-player > *:not(.glass-shine) {
        position: relative;
        z-index: 1;
      }

      /* ─── Album art ────────────────────────────────────────── */
      .pill-art {
        flex-shrink: 0;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        overflow: hidden;
        box-shadow:
          0 0 0 1.5px rgba(255, 255, 255, 0.15),
          0 4px 16px var(--now-playing-color-alpha, rgba(128, 0, 32, 0.5));
        transition: box-shadow 0.6s ease;
      }
      .pill-art img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.4s ease;
      }
      .pill-art:hover img {
        transform: scale(1.08);
      }

      /* ─── Track info ───────────────────────────────────────── */
      .pill-title {
        font-size: 0.82rem;
        font-weight: 650;
        color: rgba(255, 255, 255, 0.95);
        line-height: 1.2;
        letter-spacing: -0.01em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .pill-artist {
        font-size: 0.7rem;
        color: rgba(255, 255, 255, 0.42);
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .queue-pos {
        font-size: 0.65rem;
        color: rgba(255, 255, 255, 0.25);
        margin-top: 1px;
        font-variant-numeric: tabular-nums;
      }

      /* ─── Waveform equalizer ───────────────────────────────── */
      .waveform {
        flex-shrink: 0;
        display: flex;
        align-items: flex-end;
        gap: 2px;
        height: 18px;
        padding: 0 4px;
      }
      .waveform span {
        display: block;
        width: 2.5px;
        height: 18px;
        border-radius: 2px;
        background: var(--now-playing-color, #800020);
        transform-origin: bottom;
        transform: scaleY(0.2);
        opacity: 0.6;
      }
      .waveform.active span:nth-child(1) {
        animation: eq-bar 0.72s ease-in-out infinite;
      }
      .waveform.active span:nth-child(2) {
        animation: eq-bar 0.72s ease-in-out 0.12s infinite;
      }
      .waveform.active span:nth-child(3) {
        animation: eq-bar 0.72s ease-in-out 0.24s infinite;
      }
      .waveform.active span:nth-child(4) {
        animation: eq-bar 0.72s ease-in-out 0.08s infinite;
      }
      @keyframes eq-bar {
        0%,
        100% {
          transform: scaleY(0.2);
          opacity: 0.5;
        }
        50% {
          transform: scaleY(1);
          opacity: 1;
        }
      }

      /* ─── Control buttons ──────────────────────────────────── */
      .ctrl-btn {
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255, 255, 255, 0.45);
        background: transparent;
        border: none;
        cursor: pointer;
        transition:
          color 0.2s,
          background 0.2s;
      }
      .ctrl-btn:hover {
        color: rgba(255, 255, 255, 0.9);
        background: rgba(255, 255, 255, 0.09);
      }
      .ctrl-btn:disabled {
        opacity: 0.2;
        cursor: not-allowed;
      }
      .ctrl-btn.active-color {
        color: var(--now-playing-color, #800020);
      }

      /* Play/Pause — larger glass pill button */
      .play-btn {
        flex-shrink: 0;
        width: 38px;
        height: 38px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--now-playing-color, #800020);
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 16px
          var(--now-playing-color-alpha, rgba(128, 0, 32, 0.5));
        transition:
          background 0.5s ease,
          box-shadow 0.5s ease,
          transform 0.15s ease;
        color: #fff;
      }
      .play-btn:hover {
        transform: scale(1.08);
      }
      .play-btn:active {
        transform: scale(0.95);
      }

      /* Dismiss / close */
      .dismiss-btn {
        flex-shrink: 0;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255, 255, 255, 0.25);
        background: rgba(255, 255, 255, 0.06);
        border: none;
        cursor: pointer;
        transition:
          color 0.2s,
          background 0.2s;
        margin-left: 2px;
      }
      .dismiss-btn:hover {
        color: rgba(255, 255, 255, 0.8);
        background: rgba(255, 255, 255, 0.12);
      }
    `,
  ],
  template: `
    @if (player.currentTrack()) {
      <!-- Hidden YouTube iframe — actual audio engine -->
      @if (iframeSrc()) {
        <iframe
          #ytFrame
          [src]="iframeSrc()!"
          width="0"
          height="0"
          frameborder="0"
          allow="autoplay; encrypted-media"
          style="position:fixed;pointer-events:none;opacity:0;z-index:-1;"
          title="Music player"
        ></iframe>
      }

      <div class="pill-player">
        <!-- Specular glass shine -->
        <div class="glass-shine" aria-hidden="true"></div>

        <!-- Album art (circular) -->
        <a
          [routerLink]="['/music', player.currentTrack()!.slug]"
          class="pill-art"
          aria-label="Go to track page"
        >
          <img
            #thumbImg
            [src]="player.currentTrack()!.thumbnailUrl || ''"
            [alt]="player.currentTrack()!.title"
            loading="lazy"
            crossorigin="anonymous"
            (load)="onThumbnailLoad(thumbImg)"
          />
        </a>

        <!-- Track info -->
        <div class="flex-1 min-w-0">
          <p class="pill-title">{{ player.currentTrack()!.title }}</p>
          <p class="pill-artist">{{ player.currentTrack()!.artist }}</p>
          @if (player.queue().length > 1) {
            <p class="queue-pos">
              {{ player.queueIndex() + 1 }}&thinsp;/&thinsp;{{
                player.queue().length
              }}
            </p>
          }
        </div>

        <!-- Waveform equalizer — visible when playing -->
        <div
          class="waveform"
          [ngClass]="player.isPlaying() ? 'active' : ''"
          aria-hidden="true"
        >
          <span></span><span></span><span></span><span></span>
        </div>

        <!-- Prev -->
        <button
          class="ctrl-btn"
          (click)="player.prev()"
          [disabled]="!player.hasPrev()"
          aria-label="Previous"
        >
          <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
          </svg>
        </button>

        <!-- Play / Pause -->
        <button
          class="play-btn"
          (click)="togglePlay()"
          [attr.aria-label]="player.isPlaying() ? 'Pause' : 'Play'"
        >
          @if (player.isPlaying()) {
            <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          } @else {
            <svg
              width="14"
              height="14"
              fill="currentColor"
              viewBox="0 0 24 24"
              style="margin-left:1px"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          }
        </button>

        <!-- Next -->
        <button
          class="ctrl-btn"
          (click)="player.next()"
          [disabled]="!player.hasNext()"
          aria-label="Next"
        >
          <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>

        <!-- Shuffle (hidden on small mobile) -->
        <button
          class="ctrl-btn hidden sm:flex"
          [ngClass]="player.isShuffle() ? 'active-color' : ''"
          (click)="player.toggleShuffle()"
          aria-label="Shuffle"
        >
          <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24">
            <path
              d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
            />
          </svg>
        </button>

        <!-- Repeat (hidden on small mobile) -->
        <button
          class="ctrl-btn hidden sm:flex"
          [ngClass]="player.repeatMode() !== 'none' ? 'active-color' : ''"
          (click)="player.cycleRepeat()"
          aria-label="Repeat"
        >
          @if (player.repeatMode() === "one") {
            <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24">
              <path
                d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"
              />
            </svg>
          } @else {
            <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24">
              <path
                d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"
              />
            </svg>
          }
        </button>

        <!-- Dismiss -->
        <button
          class="dismiss-btn"
          (click)="player.clearQueue()"
          aria-label="Close player"
        >
          <svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24">
            <path
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        </button>
      </div>
    }
  `,
})
export class MiniPlayerComponent implements OnDestroy {
  @ViewChild("ytFrame") private ytFrame?: ElementRef<HTMLIFrameElement>;

  player = inject(MusicPlayerService);
  private musicApi = inject(MusicApiService);
  private sanitizer = inject(DomSanitizer);
  private platformId = inject(PLATFORM_ID);

  iframeSrc = signal<SafeResourceUrl | null>(null);
  private boundMessageHandler?: (e: MessageEvent) => void;
  // Track the youtubeId currently loaded so we don't reload for play/pause
  private loadedYoutubeId: string | null = null;

  @HostBinding("style.--now-playing-color") nowPlayingColor = "#800020";
  @HostBinding("style.--now-playing-color-alpha") nowPlayingColorAlpha =
    "rgba(128,0,32,0.35)";

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.boundMessageHandler = this.onYtMessage.bind(this);
      window.addEventListener("message", this.boundMessageHandler);
    }

    // React to track changes — load new iframe src
    effect(
      () => {
        const track = this.player.currentTrack();
        if (!track?.youtubeId || !isPlatformBrowser(this.platformId)) return;

        if (this.loadedYoutubeId === track.youtubeId) {
          // Same track — just play/pause
          if (this.player.isPlaying()) {
            this.sendCommand("playVideo");
          } else {
            this.sendCommand("pauseVideo");
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
      },
      { allowSignalWrites: true },
    );

    // React to isPlaying changes when track is already loaded
    effect(() => {
      const playing = this.player.isPlaying();
      const track = this.player.currentTrack();
      if (!track || !isPlatformBrowser(this.platformId)) return;
      if (this.loadedYoutubeId !== track.youtubeId) return; // let track-change effect handle it

      if (playing) {
        this.sendCommand("playVideo");
      } else {
        this.sendCommand("pauseVideo");
      }
    });
  }

  togglePlay(): void {
    this.player.togglePlay();
  }

  onThumbnailLoad(img: HTMLImageElement): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const [r, g, b] = this.extractDominantColor(img);
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      if (luminance < 20) {
        this.nowPlayingColor = "#800020";
        this.nowPlayingColorAlpha = "rgba(128,0,32,0.35)";
      } else {
        this.nowPlayingColor = `rgb(${r},${g},${b})`;
        this.nowPlayingColorAlpha = `rgba(${r},${g},${b},0.4)`;
      }
    } catch {
      this.nowPlayingColor = "#800020";
      this.nowPlayingColorAlpha = "rgba(128,0,32,0.35)";
    }
  }

  private extractDominantColor(
    img: HTMLImageElement,
  ): [number, number, number] {
    const canvas = document.createElement("canvas");
    // Sample at tiny size for speed; still captures dominant hue well
    canvas.width = 24;
    canvas.height = 24;
    const ctx = canvas.getContext("2d");
    if (!ctx) return [128, 0, 32];
    ctx.drawImage(img, 0, 0, 24, 24);
    const data = ctx.getImageData(0, 0, 24, 24).data;
    let r = 0,
      g = 0,
      b = 0,
      count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 128) continue; // skip transparent pixels
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }
    if (count === 0) return [128, 0, 32];
    return [
      Math.round(r / count),
      Math.round(g / count),
      Math.round(b / count),
    ];
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId) && this.boundMessageHandler) {
      window.removeEventListener("message", this.boundMessageHandler);
    }
  }

  private sendCommand(func: string): void {
    const frame = this.ytFrame?.nativeElement;
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage(
      JSON.stringify({ event: "command", func, args: "" }),
      "*",
    );
  }

  private onYtMessage(event: MessageEvent): void {
    if (!event.origin.includes("youtube.com")) return;

    let data: Record<string, unknown>;
    try {
      data =
        typeof event.data === "string"
          ? (JSON.parse(event.data) as Record<string, unknown>)
          : (event.data as Record<string, unknown>);
    } catch {
      return;
    }

    if (data["event"] !== "infoDelivery") return;

    const info = data["info"] as Record<string, unknown> | undefined;
    if (!info) return;

    // playerState: 0 = ended, 1 = playing, 2 = paused
    const state = info["playerState"];
    if (state === 0) {
      this.player.onTrackEnd();
    } else if (state === 1) {
      this.player.isPlaying.set(true);
    } else if (state === 2) {
      this.player.isPlaying.set(false);
    }
  }
}
