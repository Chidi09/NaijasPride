import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  inject,
  signal,
  computed,
  PLATFORM_ID,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { WatchApiService } from '../../../features/watch/services/watch-api.service';
import { AnonymousWatchService } from '../../../core/services/anonymous-watch.service';
import { AuthStateService } from '../../../core/auth/auth-state.service';

interface EmbedProvider {
  id: string;
  name: string;
  url: string;
  supportsProgressEvents: boolean;
}

interface EmbedResponse {
  success: boolean;
  data: {
    movieId?: string;
    showId?: string;
    episodeId?: string;
    imdbId: string | null;
    tmdbId: number | null;
    providers: EmbedProvider[];
  };
}

@Component({
  selector: 'app-embed-player',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl">
      <!-- Server Selector Bar -->
      @if (providers().length > 1) {
        <div class="absolute top-0 inset-x-0 z-20 flex items-center gap-2 bg-gradient-to-b from-black/80 to-transparent px-3 py-2">
          <span class="text-[10px] uppercase tracking-wider text-white/50 mr-1">Server</span>
          @for (provider of providers(); track provider.id; let idx = $index) {
            <button
              type="button"
              class="rounded-full px-3 py-1 text-[11px] font-medium transition-colors"
              [class]="activeProvider()?.id === provider.id
                ? 'bg-[#800020] text-white shadow'
                : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'"
              (click)="switchProvider(provider)"
            >
              Server {{ idx + 1 }}
            </button>
          }
        </div>
      }

      <!-- Loading State -->
      @if (isLoading()) {
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="flex flex-col items-center gap-3">
            <div class="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-[#800020]"></div>
            <p class="text-xs text-white/50">Loading servers...</p>
          </div>
        </div>
      }

      <!-- Error State -->
      @if (hasError() && !isLoading()) {
        <div class="absolute inset-0 flex items-center justify-center p-8">
          <div class="text-center max-w-sm">
            <div class="text-4xl mb-3">🎬</div>
            <h3 class="text-white text-sm font-semibold mb-1">No embed sources available</h3>
            <p class="text-white/40 text-xs">This movie doesn't have an IMDB or TMDB ID, so no streaming providers can be resolved.</p>
          </div>
        </div>
      }

      <!-- Iframe Player -->
      @if (safeUrl() && !isLoading()) {
        <iframe
          [src]="safeUrl()!"
          width="100%"
          height="100%"
          frameborder="0"
          allowfullscreen
          allow="autoplay; fullscreen; encrypted-media"
          referrerpolicy="no-referrer-when-downgrade"
          title="Video player"
          class="absolute inset-0 w-full h-full"
        ></iframe>
      }
    </div>
  `,
})
export class EmbedPlayerComponent implements OnInit, OnDestroy, OnChanges {
  /** Internal NaijasPride movie UUID -- used for progress saving */
  @Input({ required: true }) movieId!: string;
  /** Movie slug -- used to fetch embed providers from API */
  @Input({ required: true }) movieSlug!: string;
  /** movie (default) or tv */
  @Input() contentType: 'movie' | 'tv' = 'movie';
  @Input() seasonNumber: number | null = null;
  @Input() episodeNumber: number | null = null;
  @Input() episodeId: string | null = null;
  /** Optional: resume position in seconds */
  @Input() startAt = 0;
  /** Optional: known media duration in seconds (used for fallback tracking) */
  @Input() durationHintSeconds = 0;
  @Output() playbackEnded = new EventEmitter<void>();

  private http = inject(HttpClient);
  private sanitizer = inject(DomSanitizer);
  private watchApi = inject(WatchApiService);
  private anonWatch = inject(AnonymousWatchService);
  private auth = inject(AuthStateService);
  private platformId = inject(PLATFORM_ID);

  private destroy$ = new Subject<void>();
  private progress$ = new Subject<{ currentTime: number; duration: number }>();
  private boundListener?: (event: MessageEvent) => void;
  private fallbackTimer: ReturnType<typeof setInterval> | null = null;
  private fallbackCurrentTime = 0;
  private lastSavedTime = 0;
  private lastKnownDuration = 0;
  private endedEmitted = false;

  providers = signal<EmbedProvider[]>([]);
  activeProvider = signal<EmbedProvider | null>(null);
  isLoading = signal(true);
  hasError = signal(false);

  safeUrl = computed<SafeResourceUrl | null>(() => {
    const provider = this.activeProvider();
    if (!provider) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(provider.url);
  });

  ngOnInit(): void {
    this.fetchProviders();

    if (!isPlatformBrowser(this.platformId)) return;

    // Debounce progress saves — also track last known position for final flush on destroy
    this.progress$
      .pipe(debounceTime(5000), takeUntil(this.destroy$))
      .subscribe(({ currentTime, duration }) => {
        this.lastSavedTime = currentTime;
        this.lastKnownDuration = duration;
        this.persistProgress(currentTime, duration);
      });

    // Listen for postMessage events from embed providers (e.g. Vidking)
    this.boundListener = this.onMessage.bind(this);
    window.addEventListener('message', this.boundListener);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes['movieSlug'] && !changes['movieSlug'].firstChange) ||
      changes['contentType'] ||
      changes['seasonNumber'] ||
      changes['episodeNumber']
    ) {
      this.fetchProviders();
    }
  }

  ngOnDestroy(): void {
    // Flush any pending progress immediately before teardown.
    // The debounce pipeline drops buffered values when destroy$ fires, so we
    // save the fallback position or the most-recently-emitted Vidking position.
    const finalTime = this.fallbackCurrentTime > this.lastSavedTime
      ? this.fallbackCurrentTime
      : 0; // Vidking: lastSavedTime already written; fallback: may be ahead
    const hintedDuration = Math.max(0, Math.floor(this.durationHintSeconds || 0));
    const finalDuration = this.lastKnownDuration > 0
      ? this.lastKnownDuration
      : hintedDuration > 0 ? hintedDuration : 0;
    if (finalTime > 10 && finalDuration > 0 && finalTime > this.lastSavedTime) {
      this.persistProgress(finalTime, finalDuration);
    }

    this.stopFallbackTracking();
    this.destroy$.next();
    this.destroy$.complete();
    if (isPlatformBrowser(this.platformId) && this.boundListener) {
      window.removeEventListener('message', this.boundListener);
    }
  }

  switchProvider(provider: EmbedProvider): void {
    this.activeProvider.set(provider);
    this.endedEmitted = false;
    this.configureTrackingForProvider(provider);
  }

  private fetchProviders(): void {
    if (!this.movieSlug) {
      this.isLoading.set(false);
      this.hasError.set(true);
      return;
    }

    this.isLoading.set(true);
    this.hasError.set(false);

    const endpoint =
      this.contentType === 'tv'
        ? this.buildTvEmbedEndpoint()
        : `/api/v1/movies/${encodeURIComponent(this.movieSlug)}/embeds`;

    if (!endpoint) {
      this.providers.set([]);
      this.hasError.set(true);
      this.isLoading.set(false);
      return;
    }

    this.http
      .get<EmbedResponse>(endpoint)
      .subscribe({
        next: (response) => {
          const list = (response?.data?.providers || []).map((p) => this.applyResumeToUrl(p));
          this.providers.set(list);
          if (list.length > 0) {
            this.activeProvider.set(list[0]);
            this.configureTrackingForProvider(list[0]);
          } else {
            this.hasError.set(true);
            this.stopFallbackTracking();
          }
          this.isLoading.set(false);
        },
        error: () => {
          this.providers.set([]);
          this.hasError.set(true);
          this.isLoading.set(false);
          this.stopFallbackTracking();
        },
      });
  }

  /** Appends ?progress=X to Vidking URLs when we have a saved resume position. */
  private applyResumeToUrl(provider: EmbedProvider): EmbedProvider {
    const resumeAt = Math.floor(Math.max(0, this.startAt || 0));
    if (resumeAt <= 5 || provider.id !== 'vidking') return provider;
    const separator = provider.url.includes('?') ? '&' : '?';
    return { ...provider, url: `${provider.url}${separator}progress=${resumeAt}` };
  }

  private configureTrackingForProvider(provider: EmbedProvider): void {
    if (provider.supportsProgressEvents) {
      this.stopFallbackTracking();
      return;
    }

    // Fallback tracking for providers that do not emit postMessage progress events.
    // This is time-based (approximate), but better than dropping progress completely.
    this.stopFallbackTracking();
    this.fallbackCurrentTime = Math.max(0, Math.floor(this.startAt || 0));
    this.fallbackTimer = setInterval(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      if (typeof document !== 'undefined' && document.hidden) return;

      this.fallbackCurrentTime += 15;
      const hintedDuration = Math.max(0, Math.floor(this.durationHintSeconds || 0));
      const duration = hintedDuration > 0 ? hintedDuration : Math.max(this.fallbackCurrentTime + 600, 3600);
      this.progress$.next({ currentTime: this.fallbackCurrentTime, duration });

      if (hintedDuration > 0 && this.fallbackCurrentTime >= hintedDuration - 5) {
        this.stopFallbackTracking();
        this.emitPlaybackEnded();
      }
    }, 15000);
  }

  private stopFallbackTracking(): void {
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  private onMessage(event: MessageEvent): void {
    const provider = this.activeProvider();
    if (!provider?.supportsProgressEvents) return;

    // Handle Vidking-style postMessage events
    if (provider.id === 'vidking' && this.isAllowedVidkingOrigin(event.origin || '')) {
      let parsed: any;
      try {
        parsed = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }

      const payload = parsed?.type === 'PLAYER_EVENT' && parsed?.data ? parsed.data : parsed;
      if (!payload || typeof payload !== 'object') return;

      const evtName = String(payload.event || payload.type || '').toLowerCase();
      const currentTime = this.toFiniteNumber(payload.currentTime ?? payload.current ?? payload.time ?? payload.position);
      const duration = this.toFiniteNumber(payload.duration ?? payload.totalDuration ?? payload.length);

      if ((evtName === 'timeupdate' || evtName === 'time_update' || evtName === 'progress') && currentTime > 0 && duration > 0) {
        this.progress$.next({ currentTime: Math.floor(currentTime), duration: Math.floor(duration) });
      }

      if ((evtName === 'ended' || evtName === 'complete' || evtName === 'finished') && duration > 0) {
        this.persistProgress(Math.floor(duration), Math.floor(duration));
        this.emitPlaybackEnded();
      }
    }
  }

  private emitPlaybackEnded(): void {
    if (this.endedEmitted) return;
    this.endedEmitted = true;
    this.playbackEnded.emit();
  }

  private isAllowedVidkingOrigin(origin: string): boolean {
    if (!origin) return false;
    try {
      const host = new URL(origin).hostname.toLowerCase();
      return host === 'vidking.net' || host === 'www.vidking.net' || host.endsWith('.vidking.net');
    } catch {
      return false;
    }
  }

  private toFiniteNumber(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private persistProgress(currentTime: number, duration: number): void {
    if (this.auth.isAuthenticated()) {
      if (this.contentType === 'tv') {
        if (!this.episodeId || !this.seasonNumber || !this.episodeNumber) return;
        this.watchApi.saveTvProgress({
          showId: this.movieId,
          episodeId: this.episodeId,
          seasonNumber: this.seasonNumber,
          episodeNumber: this.episodeNumber,
          progress: currentTime,
          duration,
        }).subscribe({
          error: (err) => console.warn('[EmbedPlayer] TV progress save failed', err),
        });
      } else {
        this.watchApi.saveProgress(this.movieId, currentTime, duration).subscribe({
          error: (err) => console.warn('[EmbedPlayer] Progress save failed', err),
        });
      }
    } else {
      const progressPercentage = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
      this.anonWatch.saveProgress(
        { id: this.movieId, title: '', slug: null, thumbnailUrl: null } as any,
        progressPercentage,
        currentTime,
        duration,
        currentTime >= duration,
      );
    }
  }

  private buildTvEmbedEndpoint(): string | null {
    if (!this.seasonNumber || !this.episodeNumber || this.seasonNumber < 1 || this.episodeNumber < 1) {
      return null;
    }

    const query = new URLSearchParams({
      season: String(this.seasonNumber),
      episode: String(this.episodeNumber),
    });

    return `/api/v1/tv-shows/${encodeURIComponent(this.movieSlug)}/embeds?${query.toString()}`;
  }
}
