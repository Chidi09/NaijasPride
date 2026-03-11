import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import Hls from 'hls.js';
import { AnimeApiService } from '../../services/anime-api.service';

@Component({
  selector: 'app-anime-watch',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="mx-auto w-full max-w-7xl pb-16">
      <a [routerLink]="['/anime', animeId()]" class="mb-3 mt-5 inline-block px-4 text-sm text-white/60 hover:text-white md:px-6">← Back to Anime</a>

      @if (loading()) {
        <div class="py-12 text-center text-white/60">Loading stream...</div>
      } @else if (error()) {
        <div class="py-12 text-center text-red-300">{{ error() }}</div>
      } @else {
        <section class="relative min-h-[360px] overflow-hidden rounded-2xl border border-white/10 md:min-h-[440px]">
          <div class="absolute inset-0 bg-cover bg-center" [style.background-image]="'url(' + heroImage() + ')'" ></div>
          <div class="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/20"></div>
          <div class="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent"></div>

          <div class="relative z-10 flex h-full flex-col justify-end p-6 md:p-10">
            <div class="mb-3 flex flex-wrap items-center gap-3 text-xs">
              <span class="rounded bg-[#800020] px-2 py-1 font-bold uppercase tracking-wider text-white">Featured</span>
              <span class="font-semibold text-white/80">★ {{ scoreText() }}</span>
              <span class="text-white/60">{{ genreText() }} • {{ statusText() }}</span>
            </div>
            <h1 class="max-w-4xl text-3xl font-black text-white md:text-5xl">{{ title() }}</h1>
            <div class="mt-5 flex flex-wrap gap-3">
              <button class="rounded-xl bg-[#800020] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#9f0030]" type="button">Watch Now</button>
              <button class="rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/20" type="button">Add to Watchlist</button>
              <button class="rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm font-bold text-white hover:bg-white/20" type="button">Share</button>
            </div>
          </div>
        </section>

        <section class="mt-5 rounded-2xl border border-white/10 bg-black/40 p-4 md:p-5">
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white hover:bg-white/10"
              (click)="showAdvanced.set(!showAdvanced())"
            >
              {{ showAdvanced() ? 'Hide advanced' : 'Advanced' }}
            </button>

            @if (selectedSource()?.url) {
              <a
                [href]="selectedSource()?.url"
                target="_blank"
                rel="noopener noreferrer"
                class="rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white hover:bg-white/10"
              >
                Open source
              </a>
            }

            @if (showAdvanced()) {
              <select class="rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white" [value]="provider()" (change)="onProviderChange($event)">
                @for (p of providers(); track p) {
                  <option [value]="p">{{ p }}</option>
                }
              </select>

              <select class="rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white" [value]="server()" (change)="onServerChange($event)">
                <option value="">auto-server</option>
                @for (s of serverOptions(); track s) {
                  <option [value]="s">{{ s }}</option>
                }
              </select>
            }

            @for (source of sourceButtons(); track source.url) {
              <button type="button" class="rounded-full px-3 py-1 text-xs" [class]="activeSourceUrl() === source.url ? 'bg-[#800020] text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'" (click)="selectSource(source.url, source.index)">
                {{ source.label }}
              </button>
            }
          </div>

          @if (playbackNotice()) {
            <div class="mb-3 rounded-lg border border-yellow-500/30 bg-yellow-900/20 px-3 py-2 text-xs text-yellow-100">
              {{ playbackNotice() }}
            </div>
          }

          <div class="overflow-hidden rounded-xl border border-white/10 bg-black">
            @if (selectedSourceIsEmbed()) {
              <iframe
                class="aspect-video w-full bg-black"
                [src]="selectedEmbedUrl()"
                (load)="onEmbedLoad()"
                (error)="onEmbedError()"
                allow="autoplay; fullscreen; picture-in-picture"
                allowfullscreen
                referrerpolicy="no-referrer"
              ></iframe>
            } @else {
              <video #videoEl controls playsinline class="aspect-video w-full bg-black"></video>
            }
          </div>
        </section>

        <section class="mt-8 grid grid-cols-1 gap-8 px-4 md:px-6 lg:grid-cols-3 lg:gap-10">
          <div class="space-y-8 lg:col-span-2">
            <div>
              <h3 class="mb-3 text-lg font-bold text-[#d46]">Synopsis</h3>
              <p class="text-white/75">{{ synopsisText() }}</p>
            </div>

            <div>
              <div class="mb-4 flex items-center justify-between">
                <h3 class="text-lg font-bold text-white">Episodes</h3>
                <span class="text-xs text-white/50">{{ episodes().length }} Episodes Available</span>
              </div>

              <div class="space-y-3">
                @for (ep of episodes(); track ep.id) {
                  <a [routerLink]="['/anime', animeId(), 'watch', ep.number]" class="group block rounded-xl border p-3 transition"
                    [class]="ep.number === episodeNumber() ? 'border-[#800020]/60 bg-[#800020]/15' : 'border-white/10 bg-white/[0.03] hover:border-[#800020]/40 hover:bg-[#800020]/10'">
                    <div class="flex flex-col gap-3 md:flex-row">
                      <div class="relative aspect-video w-full overflow-hidden rounded-lg md:w-56">
                        <img [src]="ep.image || posterImage()" alt="Episode artwork" class="h-full w-full object-cover" />
                      </div>
                      <div class="flex-1">
                        <h4 class="font-semibold text-white">Episode {{ ep.number }}: {{ ep.title || 'Untitled Episode' }}</h4>
                        <p class="mt-1 text-sm text-white/60">Tap to watch this episode.</p>
                      </div>
                    </div>
                  </a>
                }
              </div>
            </div>
          </div>

          <div class="space-y-6">
            <div class="rounded-2xl border border-[#800020]/25 bg-[#2a1b15]/70 p-5">
              <h4 class="mb-3 text-base font-bold text-white">Series Information</h4>
              <div class="space-y-3 text-sm">
                <div class="flex items-center justify-between border-b border-white/10 pb-2"><span class="text-white/60">Aired</span><span class="text-white">{{ airedText() }}</span></div>
                <div class="flex items-center justify-between border-b border-white/10 pb-2"><span class="text-white/60">Status</span><span class="text-[#d46]">{{ statusText() }}</span></div>
                <div class="flex items-center justify-between border-b border-white/10 pb-2"><span class="text-white/60">Episodes</span><span class="text-white">{{ totalEpisodesText() }}</span></div>
                <div class="flex items-center justify-between"><span class="text-white/60">Rating</span><span class="text-white">{{ scoreText() }}</span></div>
              </div>
            </div>
          </div>
        </section>
      }
    </section>
  `,
})
export class AnimeWatchComponent implements AfterViewInit, OnDestroy {
  @ViewChild('videoEl') videoRef?: ElementRef<HTMLVideoElement>;

  private static readonly EMBED_LOAD_TIMEOUT_MS = 9000;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(AnimeApiService);
  private sanitizer = inject(DomSanitizer);

  private hls: Hls | null = null;
  private embedLoadTimeout: ReturnType<typeof setTimeout> | null = null;

  animeId = signal(0);
  episodeNumber = signal(1);
  title = signal('Anime');
  animeData = signal<any | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  playbackNotice = signal<string | null>(null);
  episodes = signal<any[]>([]);
  sources = signal<Array<{ url: string; quality?: string; isM3U8?: boolean; isEmbed?: boolean }>>([]);
  activeSourceUrl = signal<string | null>(null);
  readonly providers = signal<string[]>(['auto', 'gogoanime', 'zoro', 'animepahe']);
  readonly serverOptions = signal<string[]>(['vidstreaming', 'gogocdn', 'streamsb']);
  provider = signal('auto');
  server = signal('');
  showAdvanced = signal(false);

  selectedSource = computed(() => this.sources().find((entry) => entry.url === this.activeSourceUrl()) || null);
  selectedSourceIndex = computed(() => this.sources().findIndex((entry) => entry.url === this.activeSourceUrl()));
  selectedSourceIsEmbed = computed(() => !!this.selectedSource()?.isEmbed);
  selectedEmbedUrl = computed<SafeResourceUrl | null>(() => {
    const source = this.selectedSource();
    if (!source?.url || !source.isEmbed) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(source.url);
  });
  sourceButtons = computed(() =>
    this.sources().map((source, index) => ({
      ...source,
      label: this.labelSource(source, index),
      index,
    })),
  );
  heroImage = computed(() => this.animeData()?.bannerImage || this.animeData()?.coverImage?.extraLarge || this.animeData()?.coverImage?.large || '/assets/images/poster-placeholder.svg');
  posterImage = computed(() => this.animeData()?.coverImage?.extraLarge || this.animeData()?.coverImage?.large || '/assets/images/poster-placeholder.svg');
  synopsisText = computed(() => {
    const raw = this.animeData()?.description || '';
    const stripped = String(raw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return stripped || 'Synopsis unavailable right now.';
  });
  genreText = computed(() => {
    const genres: string[] = this.animeData()?.genres || [];
    return genres.slice(0, 2).join(', ') || 'Anime';
  });
  scoreText = computed(() => {
    const score = this.animeData()?.averageScore;
    return typeof score === 'number' ? `${score}%` : 'N/A';
  });
  statusText = computed(() => String(this.animeData()?.status || 'Unknown').replace(/_/g, ' '));
  airedText = computed(() => {
    const start = this.animeData()?.startDate;
    if (!start?.year) return 'Unknown';
    const end = this.animeData()?.endDate;
    return end?.year ? `${start.year} - ${end.year}` : `${start.year} - Present`;
  });
  totalEpisodesText = computed(() => this.animeData()?.episodes || this.episodes().length || '?');

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const animeId = Number(params.get('id') || 0);
      const episodeNumber = Number(params.get('episodeNumber') || 1);
      if (!animeId || !episodeNumber) return;
      this.animeId.set(animeId);
      this.episodeNumber.set(episodeNumber);
    });

    this.route.queryParamMap.subscribe((query) => {
      const provider = (query.get('provider') || 'auto').trim();
      const server = (query.get('server') || '').trim();
      this.provider.set(provider || 'auto');
      this.server.set(server);
      if (this.animeId() && this.episodeNumber()) {
        this.load();
      }
    });
  }

  ngAfterViewInit(): void {
    const source = this.selectedSource();
    if (!source || source.isEmbed) return;
    this.attachSource(source.url, !!source.isM3U8);
  }

  ngOnDestroy(): void {
    this.clearEmbedTimeout();
    this.destroyPlayer();
  }

  selectSource(url: string, index?: number): void {
    this.activeSourceUrl.set(url);
    this.clearEmbedTimeout();
    this.playbackNotice.set(null);

    const source = this.selectedSource();
    if (!source) return;

    const sourceIndex = index ?? this.selectedSourceIndex();
    if (source.isEmbed) {
      this.destroyPlayer();
      this.armEmbedTimeout(sourceIndex);
      return;
    }

    this.attachSource(source.url, !!source.isM3U8);
  }

  onEmbedLoad(): void {
    this.clearEmbedTimeout();
    this.playbackNotice.set('If playback stalls, tap Open source or switch servers.');
  }

  onEmbedError(): void {
    this.tryNextSource('This server failed. Trying next server...');
  }

  onProviderChange(event: Event): void {
    const value = (event.target as HTMLSelectElement | null)?.value?.trim() || 'auto';
    this.provider.set(value);
    this.updateQueryParams({ provider: value, server: this.server() || null });
  }

  onServerChange(event: Event): void {
    const value = (event.target as HTMLSelectElement | null)?.value?.trim() || '';
    this.server.set(value);
    this.updateQueryParams({ provider: this.provider(), server: value || null });
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.playbackNotice.set(null);

    this.api.getAnime(this.animeId()).subscribe({
      next: (res) => {
        const anime = res?.data;
        this.animeData.set(anime || null);
        this.title.set(anime?.title?.english || anime?.title?.romaji || anime?.title?.native || 'Anime');
      },
    });

    this.api.getEpisodes(this.animeId(), this.provider()).subscribe({
      next: (res) => this.episodes.set(res?.data?.episodes || []),
      error: () => this.episodes.set([]),
    });

    this.api.getWatchSources(this.animeId(), this.episodeNumber(), this.provider(), this.server() || undefined).subscribe({
      next: (res) => {
        const sources = (res?.data?.sources || []).filter((entry: any) => !!entry?.url);
        this.sources.set(sources);
        const first = sources[0];
        this.activeSourceUrl.set(first?.url || null);
        this.loading.set(false);
        if (first) {
          this.selectSource(first.url, 0);
        } else {
          this.error.set('No playable source available for this episode.');
        }
      },
      error: () => {
        this.sources.set([]);
        this.loading.set(false);
        this.error.set('Failed to load watch sources.');
      },
    });
  }

  private updateQueryParams(queryParams: { provider: string; server: string | null }): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private armEmbedTimeout(index: number): void {
    this.clearEmbedTimeout();
    this.embedLoadTimeout = setTimeout(() => {
      if (this.selectedSourceIndex() !== index) return;
      this.tryNextSource('Source timed out. Trying next server...');
    }, AnimeWatchComponent.EMBED_LOAD_TIMEOUT_MS);
  }

  private clearEmbedTimeout(): void {
    if (this.embedLoadTimeout) {
      clearTimeout(this.embedLoadTimeout);
      this.embedLoadTimeout = null;
    }
  }

  private tryNextSource(message: string): void {
    const currentIndex = this.selectedSourceIndex();
    const nextIndex = currentIndex >= 0 ? currentIndex + 1 : -1;
    const next = nextIndex >= 0 ? this.sources()[nextIndex] : null;
    if (!next) {
      this.playbackNotice.set('This source may be blocked here. Use Open source or switch provider in Advanced.');
      return;
    }

    this.playbackNotice.set(message);
    this.selectSource(next.url, nextIndex);
  }

  private labelSource(source: { quality?: string; isEmbed?: boolean; isM3U8?: boolean }, index: number): string {
    const quality = (source.quality || '').trim();
    if (source.isEmbed) return `Server ${index + 1}`;
    if (/^\d{3,4}p$/i.test(quality)) return quality.toUpperCase();
    if (/\bm3u8\b/i.test(quality)) return `HLS ${index + 1}`;
    if (/\b(auto|default)\b/i.test(quality)) return `Auto ${index + 1}`;
    if (!quality || /^embed-\d+$/i.test(quality)) return `Server ${index + 1}`;
    return quality.replace(/[-_]/g, ' ').slice(0, 18);
  }

  private attachSource(url: string, isM3U8: boolean): void {
    const video = this.videoRef?.nativeElement;
    if (!video) return;

    this.destroyPlayer();

    if (isM3U8 && Hls.isSupported()) {
      this.hls = new Hls();
      this.hls.loadSource(url);
      this.hls.attachMedia(video);
      return;
    }

    video.src = url;
  }

  private destroyPlayer(): void {
    this.clearEmbedTimeout();
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    const video = this.videoRef?.nativeElement;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }
}
