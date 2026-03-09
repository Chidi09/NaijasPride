import {
  Component,
  Input,
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
          @for (provider of providers(); track provider.id) {
            <button
              type="button"
              class="rounded-full px-3 py-1 text-[11px] font-medium transition-colors"
              [class]="activeProvider()?.id === provider.id
                ? 'bg-[#800020] text-white shadow'
                : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'"
              (click)="switchProvider(provider)"
            >
              {{ provider.name }}
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

  private http = inject(HttpClient);
  private sanitizer = inject(DomSanitizer);
  private watchApi = inject(WatchApiService);
  private anonWatch = inject(AnonymousWatchService);
  private auth = inject(AuthStateService);
  private platformId = inject(PLATFORM_ID);

  private destroy$ = new Subject<void>();
  private progress$ = new Subject<{ currentTime: number; duration: number }>();
  private boundListener?: (event: MessageEvent) => void;

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

    // Debounce progress saves
    this.progress$
      .pipe(debounceTime(5000), takeUntil(this.destroy$))
      .subscribe(({ currentTime, duration }) => {
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
    this.destroy$.next();
    this.destroy$.complete();
    if (isPlatformBrowser(this.platformId) && this.boundListener) {
      window.removeEventListener('message', this.boundListener);
    }
  }

  switchProvider(provider: EmbedProvider): void {
    this.activeProvider.set(provider);
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
          const list = response?.data?.providers || [];
          this.providers.set(list);
          if (list.length > 0) {
            this.activeProvider.set(list[0]);
          } else {
            this.hasError.set(true);
          }
          this.isLoading.set(false);
        },
        error: () => {
          this.providers.set([]);
          this.hasError.set(true);
          this.isLoading.set(false);
        },
      });
  }

  private onMessage(event: MessageEvent): void {
    const provider = this.activeProvider();
    if (!provider?.supportsProgressEvents) return;

    // Handle Vidking-style postMessage events
    if (provider.id === 'vidking' && event.origin?.includes('vidking.net')) {
      let parsed: any;
      try {
        parsed = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (parsed?.type !== 'PLAYER_EVENT' || !parsed.data) return;
      const { event: evtName, currentTime, duration } = parsed.data;
      if (evtName === 'timeupdate' && currentTime > 0 && duration > 0) {
        this.progress$.next({ currentTime: Math.floor(currentTime), duration: Math.floor(duration) });
      }
      if (evtName === 'ended' && duration > 0) {
        this.persistProgress(Math.floor(duration), Math.floor(duration));
      }
    }
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
