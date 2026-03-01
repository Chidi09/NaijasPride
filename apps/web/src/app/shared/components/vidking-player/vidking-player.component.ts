import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  inject,
  PLATFORM_ID,
  ChangeDetectionStrategy,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { WatchApiService } from '../../../features/watch/services/watch-api.service';
import { AnonymousWatchService } from '../../../core/services/anonymous-watch.service';
import { AuthStateService } from '../../../core/auth/auth-state.service';

interface VidkingEventData {
  event: 'timeupdate' | 'play' | 'pause' | 'ended' | 'seeked';
  currentTime: number;
  duration: number;
  progress: number;
  id: string;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  timestamp: number;
}

interface VidkingMessage {
  type: 'PLAYER_EVENT';
  data: VidkingEventData;
}

@Component({
  selector: 'app-vidking-player',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl">
      <iframe
        [src]="safeUrl"
        width="100%"
        height="100%"
        frameborder="0"
        allowfullscreen
        allow="autoplay; fullscreen"
        referrerpolicy="no-referrer-when-downgrade"
        title="Video player"
      ></iframe>
    </div>
  `,
})
export class VidkingPlayerComponent implements OnInit, OnDestroy {
  /** Internal NaijasPride movie UUID — used for progress saving */
  @Input({ required: true }) movieId!: string;
  /** TMDB numeric ID — used to build the Vidking embed URL */
  @Input({ required: true }) tmdbId!: number;
  /** Optional: resume position in seconds */
  @Input() startAt = 0;
  /** Optional: primary brand colour (hex without #) */
  @Input() color = 'e50914';

  safeUrl!: SafeResourceUrl;

  private sanitizer = inject(DomSanitizer);
  private watchApi = inject(WatchApiService);
  private anonWatch = inject(AnonymousWatchService);
  private auth = inject(AuthStateService);
  private platformId = inject(PLATFORM_ID);

  private destroy$ = new Subject<void>();
  private progress$ = new Subject<{ currentTime: number; duration: number }>();
  private boundListener!: (event: MessageEvent) => void;

  ngOnInit(): void {
    this.safeUrl = this.buildSafeUrl();

    if (!isPlatformBrowser(this.platformId)) return;

    // Debounce progress saves — fire at most once every 5 seconds
    this.progress$
      .pipe(debounceTime(5000), takeUntil(this.destroy$))
      .subscribe(({ currentTime, duration }) => {
        this.persistProgress(currentTime, duration);
      });

    this.boundListener = this.onMessage.bind(this);
    window.addEventListener('message', this.boundListener);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('message', this.boundListener);
    }
  }

  private buildSafeUrl(): SafeResourceUrl {
    if (!this.tmdbId) {
      return this.sanitizer.bypassSecurityTrustResourceUrl('about:blank');
    }
    const params = new URLSearchParams({
      color: this.color,
      autoPlay: 'true',
    });
    if (this.startAt > 0) params.set('progress', String(this.startAt));

    const url = `https://www.vidking.net/embed/movie/${this.tmdbId}?${params.toString()}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  private onMessage(event: MessageEvent): void {
    // Ignore messages from other origins
    if (!event.origin.includes('vidking.net')) return;

    let parsed: VidkingMessage;
    try {
      parsed = typeof event.data === 'string'
        ? JSON.parse(event.data)
        : event.data;
    } catch {
      return;
    }

    if (parsed?.type !== 'PLAYER_EVENT' || !parsed.data) return;

    const { event: evtName, currentTime, duration } = parsed.data;

    if (evtName === 'timeupdate' && currentTime > 0 && duration > 0) {
      this.progress$.next({ currentTime: Math.floor(currentTime), duration: Math.floor(duration) });
    }

    if (evtName === 'ended' && duration > 0) {
      // Save final position immediately on end
      this.persistProgress(Math.floor(duration), Math.floor(duration));
    }
  }

  private persistProgress(currentTime: number, duration: number): void {
    if (this.auth.isAuthenticated()) {
      this.watchApi.saveProgress(this.movieId, currentTime, duration).subscribe({
        error: (err) => console.warn('[Vidking] Progress save failed', err),
      });
    } else {
      const progressPercentage = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
      this.anonWatch.saveProgress(
        { id: this.movieId, title: '', slug: null, thumbnailUrl: null } as any,
        progressPercentage,
        currentTime,
        duration,
        currentTime >= duration
      );
    }
  }
}
