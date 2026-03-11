import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import Hls from 'hls.js';
import { AnimeApiService } from '../../services/anime-api.service';

@Component({
  selector: 'app-anime-watch',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
      <a [routerLink]="['/anime', animeId()]" class="text-sm text-white/60 hover:text-white">← Back to Anime</a>

      @if (loading()) {
        <div class="py-12 text-center text-white/60">Loading stream...</div>
      } @else if (error()) {
        <div class="py-12 text-center text-red-300">{{ error() }}</div>
      } @else {
        <div class="mt-3 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 class="text-xl font-semibold text-white">{{ title() }}</h1>
            <p class="text-sm text-white/60">Episode {{ episodeNumber() }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <select
              class="rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white"
              [value]="provider()"
              (change)="onProviderChange($event)"
            >
              @for (p of providers(); track p) {
                <option [value]="p">{{ p }}</option>
              }
            </select>

            <select
              class="rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white"
              [value]="server()"
              (change)="onServerChange($event)"
            >
              <option value="">auto-server</option>
              @for (s of serverOptions(); track s) {
                <option [value]="s">{{ s }}</option>
              }
            </select>

            @for (source of sources(); track source.url) {
              <button
                type="button"
                class="rounded-full px-3 py-1 text-xs"
                [class]="activeSourceUrl() === source.url ? 'bg-[#800020] text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'"
                (click)="selectSource(source.url)"
              >
                {{ source.quality || 'auto' }}
              </button>
            }
          </div>
        </div>

        <div class="overflow-hidden rounded-xl border border-white/10 bg-black">
          <video #videoEl controls playsinline class="aspect-video w-full bg-black"></video>
        </div>

        <div class="mt-4">
          <h2 class="mb-2 text-sm font-semibold text-white/80">Episodes</h2>
          <div class="grid grid-cols-4 gap-2 sm:grid-cols-8 lg:grid-cols-12">
            @for (ep of episodes(); track ep.id) {
              <a
                [routerLink]="['/anime', animeId(), 'watch', ep.number]"
                class="rounded-md border px-2 py-1 text-center text-xs"
                [class]="ep.number === episodeNumber()
                  ? 'border-[#800020] bg-[#800020]/20 text-white'
                  : 'border-white/10 bg-black/20 text-white/70 hover:border-white/30'"
              >
                {{ ep.number }}
              </a>
            }
          </div>
        </div>
      }
    </section>
  `,
})
export class AnimeWatchComponent implements AfterViewInit, OnDestroy {
  @ViewChild('videoEl') videoRef?: ElementRef<HTMLVideoElement>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(AnimeApiService);

  private hls: Hls | null = null;

  animeId = signal(0);
  episodeNumber = signal(1);
  title = signal('Anime');
  loading = signal(true);
  error = signal<string | null>(null);
  episodes = signal<any[]>([]);
  sources = signal<Array<{ url: string; quality?: string; isM3U8?: boolean }>>([]);
  activeSourceUrl = signal<string | null>(null);
  readonly providers = signal<string[]>(['auto', 'gogoanime', 'zoro', 'animepahe']);
  readonly serverOptions = signal<string[]>(['vidstreaming', 'gogocdn', 'streamsb']);
  provider = signal('auto');
  server = signal('');

  selectedSource = computed(() => this.sources().find((entry) => entry.url === this.activeSourceUrl()) || null);

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
    if (source) this.attachSource(source.url, !!source.isM3U8);
  }

  ngOnDestroy(): void {
    this.destroyPlayer();
  }

  selectSource(url: string): void {
    this.activeSourceUrl.set(url);
    const source = this.selectedSource();
    if (!source) return;
    this.attachSource(source.url, !!source.isM3U8);
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

    this.api.getAnime(this.animeId()).subscribe({
      next: (res) => {
        const anime = res?.data;
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
          this.attachSource(first.url, !!first.isM3U8);
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
