import { Component, OnInit, OnDestroy, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MusicApiService } from '../../services/music-api.service';
import { MusicPlayerService } from '../../services/music-player.service';
import { MusicVideoSummary, MusicFeaturedSections } from '@naijaspride/types';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

// Icons
const PlayIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
const ArrowIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
const VolumeIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;

@Component({
  selector: 'app-music-editorial-landing',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      --music-bg: #f6f1eb;
      --music-surface: #ffffff;
      --music-surface-strong: #ece3db;
      --music-text: #1f1715;
      --music-text-muted: #6b594f;
      --music-border: #d8c9bf;
      --music-border-strong: #baa89c;
      --music-contrast: #111111;
      background: var(--music-bg);
      color: var(--music-text);
      font-family: 'Space Grotesk', system-ui, sans-serif;
    }

    :host-context(.dark) {
      --music-bg: #050505;
      --music-surface: #1f1f1f;
      --music-surface-strong: #121212;
      --music-text: #e6e0d4;
      --music-text-muted: #bcae9e;
      --music-border: #2a2a2a;
      --music-border-strong: #3a3a3a;
      --music-contrast: #f5efe5;
    }

    .display-text { font-family: 'Cinzel', 'Playfair Display', Georgia, serif; font-weight: 400; letter-spacing: 0.05em; }
    .serif-text { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 400; }
    .sans-text { font-family: 'Space Grotesk', system-ui, sans-serif; font-weight: 300; }
    .grain-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 9999; opacity: 0.05; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E"); }
    .video-mask { clip-path: polygon(0 0, 100% 0, 100% 85%, 95% 100%, 0 100%); }
    .text-outline { -webkit-text-stroke: 1px var(--music-text); color: transparent; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: var(--music-bg); }
    ::-webkit-scrollbar-thumb { background: #8a1c1c; }
    .spin-slow { animation: spin 10s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .reveal { opacity: 0; transform: translateY(30px); transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1); }
    .reveal.visible { opacity: 1; transform: translateY(0); }
    .image-zoom { transition: transform 0.7s cubic-bezier(0.16, 1, 0.3, 1), filter 0.5s ease; }
    .group:hover .image-zoom { transform: scale(1.05); }
    .playlist-row { transition: background-color 0.3s ease, padding-left 0.3s ease; }
    .playlist-row:hover { background-color: rgba(31, 31, 31, 0.3); padding-left: 16px; }
  `],
  template: `
    <section class="min-h-screen pt-32 pb-12 px-6 flex flex-col justify-between border-b border-[var(--music-border)] relative">
      <div class="absolute top-20 right-0 w-1/2 h-1/2 bg-gradient-to-b from-[var(--music-surface)] to-transparent opacity-20 -z-10 blur-3xl"></div>
      <div class="max-w-8xl mx-auto w-full">
        <div class="reveal visible flex flex-col mb-12">
          <div class="flex items-baseline gap-6 overflow-hidden flex-wrap">
            <h1 class="display-text text-[8vw] md:text-[6vw] leading-[0.9] uppercase">Sonic</h1>
            <div class="h-[2px] flex-grow bg-[#8a1c1c] self-center mx-4 min-w-[100px]"></div>
            <span class="serif-text text-lg md:text-2xl italic text-[#8a1c1c]">(Vol. 01)</span>
          </div>
          <h1 class="display-text text-[8vw] md:text-[6vw] leading-[0.9] text-outline uppercase self-end">Visuals</h1>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
          <div class="lg:col-span-9">
            @if (heroVideo(); as video) {
              <div class="relative w-full aspect-video bg-[var(--music-surface)] overflow-hidden video-mask border border-[var(--music-border)] group">
                @if (!isPlaying()) {
                  <div class="absolute inset-0 bg-black/40 z-10"></div>
                  <img [src]="video.thumbnailUrl || 'https://img.youtube.com/vi/' + video.youtubeId + '/hqdefault.jpg'" [alt]="video.title" class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700 scale-105 group-hover:scale-100" referrerpolicy="no-referrer">
                  <button (click)="playHero(video)" class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 border border-[var(--music-border-strong)] rounded-full flex items-center justify-center z-20 backdrop-blur-sm hover:bg-[#8a1c1c] hover:border-[#8a1c1c] hover:text-white transition-all duration-300 group-hover:scale-110">
                    <span [innerHTML]="playIcon" class="ml-2 text-[var(--music-text)]"></span>
                  </button>
                } @else {
                  <iframe [src]="heroEmbedUrl()" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen class="w-full h-full absolute inset-0"></iframe>
                }
              </div>
            } @else {
              <div class="w-full aspect-video bg-[var(--music-surface)] flex items-center justify-center video-mask">
                <span class="text-6xl">🎵</span>
              </div>
            }
          </div>
          <div class="lg:col-span-3 flex flex-col justify-between h-full pb-8">
            @if (heroVideo(); as video) {
              <div>
                <span class="block text-[#8a1c1c] text-xs tracking-widest mb-2 font-bold sans-text">NOW PREMIERING</span>
                <h2 class="serif-text text-3xl leading-none mb-2 text-[var(--music-text)]">{{ video.artist }}</h2>
                <h3 class="sans-text text-lg text-[var(--music-text-muted)] uppercase mb-6">{{ video.title }}</h3>
                <p class="sans-text text-sm text-[var(--music-text-muted)] leading-relaxed text-justify border-l border-[#8a1c1c] pl-4">
                  Watch top tracks, artist releases, and trending videos from one place.
                </p>
              </div>
            }
            <div class="mt-8 flex items-center gap-4 opacity-50">
              <span [innerHTML]="volumeIcon"></span>
              <div class="h-[2px] w-full bg-[var(--music-border)]"><div class="h-full bg-[var(--music-text)] w-[60%] animate-pulse"></div></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="bg-[var(--music-surface-strong)] py-4 border-y border-[var(--music-border)]">
      <div class="max-w-7xl mx-auto px-6 flex flex-wrap items-center justify-center gap-3 text-[10px] tracking-[0.2em] sans-text text-[var(--music-text-muted)]">
        <span class="px-3 py-1 border border-[var(--music-border)]">NEW RELEASES</span>
        <span class="px-3 py-1 border border-[var(--music-border)]">TRENDING ARTISTS</span>
        <span class="px-3 py-1 border border-[var(--music-border)]">MUSIC VIDEOS</span>
      </div>
    </div>

    <section class="py-24 px-6 max-w-7xl mx-auto">
      <div class="flex justify-between items-end mb-16">
        <h2 class="serif-text text-4xl md:text-5xl text-[var(--music-text)]">CURATED <span class="italic text-[#8a1c1c]">VIBES</span></h2>
        <div class="hidden md:flex gap-2 items-center">
          <div class="w-2 h-2 bg-[#8a1c1c] rounded-full animate-pulse"></div>
          <span class="text-[10px] tracking-widest sans-text">TRENDING NOW</span>
        </div>
      </div>

      @if (isLoading()) {
        <div class="space-y-4">
          @for (i of [1,2,3,4]; track i) { <div class="h-24 bg-[var(--music-surface)] animate-pulse"></div> }
        </div>
      } @else {
        <div class="flex flex-col">
          @for (track of trending().slice(0, 6); track track.id; let idx = $index) {
            <div (click)="playTrack(track)" class="playlist-row group flex flex-col md:flex-row items-start md:items-center justify-between py-8 border-b border-[var(--music-border)] px-4 cursor-pointer reveal" [style.transition-delay]="idx * 100 + 'ms'">
              <div class="flex items-center gap-4 md:gap-8 w-full md:w-2/3 min-w-0">
                <span class="serif-text text-2xl text-[#8a1c1c] w-8">0{{ idx + 1 }}</span>
                <div class="relative w-24 h-16 md:w-36 md:h-24 overflow-hidden border border-[var(--music-border)] bg-[var(--music-surface)] opacity-70 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <img
                    [src]="videoThumbnail(track, 'mq')"
                    [alt]="track.title"
                    class="object-cover w-full h-full grayscale group-hover:grayscale-0 transition-all"
                    referrerpolicy="no-referrer"
                    loading="lazy"
                    (error)="onThumbnailError($event, track)"
                  >
                </div>
                <div class="min-w-0">
                  <h4 class="serif-text text-2xl transition-all duration-300 text-[var(--music-text)] truncate">{{ track.artist }}</h4>
                  <p class="sans-text text-xs tracking-widest text-[var(--music-text-muted)] uppercase mt-1 truncate">{{ track.title }}</p>
                  <div class="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-[var(--music-text-muted)] sans-text">
                    <span>{{ track.year }}</span>
                    <span>•</span>
                    <span>{{ formatNumber(track.viewCount) }} views</span>
                    <span>•</span>
                    <span>{{ formatDuration(track.durationSeconds) }}</span>
                    @if (track.genre.length > 0) {
                      <span class="px-2 py-[2px] border border-[var(--music-border)] uppercase tracking-[0.08em] text-[10px]">{{ track.genre[0] }}</span>
                    }
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-8 mt-4 md:mt-0 w-full md:w-auto justify-between md:justify-end">
                <button class="w-12 h-12 border border-[var(--music-border)] rounded-full flex items-center justify-center group-hover:border-[var(--music-contrast)] group-hover:bg-[var(--music-contrast)] group-hover:text-[var(--music-bg)] transition-all">
                  <span [innerHTML]="playIcon" class="w-4 h-4"></span>
                </button>
              </div>
            </div>
          }
        </div>
      }
      <div class="mt-12 text-center">
        <a routerLink="/music/browse" class="inline-block px-8 py-4 border border-[var(--music-border)] text-xs tracking-[0.2em] hover:bg-[#8a1c1c] hover:border-[#8a1c1c] hover:text-white transition-all uppercase sans-text">Load More Archives</a>
      </div>
    </section>

    <section class="py-24 bg-[var(--music-surface)] relative overflow-hidden border-y border-[var(--music-border)]">
      <div class="absolute top-0 left-0 w-full h-full overflow-hidden flex items-center justify-center opacity-5 pointer-events-none">
        <h2 class="display-text text-[18vw] text-[var(--music-contrast)] whitespace-nowrap">AFROBEATS</h2>
      </div>
      <div class="max-w-7xl mx-auto px-6 relative z-10 grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
        <div class="order-2 md:order-1">
          <span class="text-[#8a1c1c] text-xs tracking-[0.2em] font-bold block mb-4 sans-text">ARTIST OF THE WEEK</span>
          @if (spotlightArtist(); as artist) {
            <h2 class="serif-text text-4xl md:text-5xl mb-6 text-[var(--music-text)]">{{ artist.artistName }}</h2>
            <p class="sans-text text-sm text-[var(--music-text-muted)] leading-relaxed mb-8 text-justify">
              {{ artist.artistName }} has {{ artist.totalVideos }} videos in the catalog and {{ formatNumber(artist.totalPlays) }} total plays so far.
            </p>
            <div class="flex gap-4">
              <a [routerLink]="['/music/artist', artist.artistSlug]" class="flex items-center gap-2 px-6 py-3 bg-[var(--music-contrast)] text-[var(--music-bg)] text-xs tracking-widest hover:opacity-90 transition-colors sans-text">
                <span [innerHTML]="playIcon" class="w-4 h-4"></span> VIEW DISCOGRAPHY
              </a>
              <button class="px-6 py-3 border border-[var(--music-border-strong)] text-xs tracking-widest hover:bg-[var(--music-surface-strong)] transition-colors sans-text">FOLLOW</button>
            </div>
          }
        </div>
        <div class="order-1 md:order-2 relative">
          @if (spotlightArtist()?.topVideos[0]; as topVideo) {
            <div class="aspect-[3/4] bg-black video-mask relative group cursor-pointer" (click)="playTrack(topVideo)">
              <img [src]="topVideo.thumbnailUrl || 'https://img.youtube.com/vi/' + topVideo.youtubeId + '/hqdefault.jpg'" [alt]="topVideo.title" class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" referrerpolicy="no-referrer">
              <div class="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors"></div>
              <div class="absolute bottom-4 left-4 right-4 bg-black/60 backdrop-blur-md p-4 border-l-2 border-[#8a1c1c]">
                <p class="serif-text italic text-lg">"{{ topVideo.title }}"</p>
                <p class="sans-text text-xs opacity-60 mt-1">{{ formatNumber(topVideo.viewCount) }} views</p>
              </div>
            </div>
          }
        </div>
      </div>
    </section>

    <section class="py-24 px-6 max-w-7xl mx-auto">
      <div class="flex justify-between items-end mb-12 border-b border-[var(--music-border)] pb-6">
        <h2 class="serif-text text-4xl md:text-5xl text-[var(--music-text)]">FRESH <span class="text-[#590d0d] italic">DROPS</span></h2>
        <a routerLink="/music/browse" class="text-xs tracking-widest hover:text-[#8a1c1c] transition-colors sans-text flex items-center gap-2">VIEW ALL <span [innerHTML]="arrowIcon"></span></a>
      </div>
      @if (newReleases().length > 0) {
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          @for (video of newReleases().slice(0, 6); track video.id; let idx = $index) {
            <a [routerLink]="['/music', video.slug]" class="group reveal border border-[var(--music-border)] bg-[var(--music-surface)] p-3" [style.transition-delay]="idx * 50 + 'ms'">
              <div class="relative aspect-video overflow-hidden mb-3 border border-[var(--music-border)] bg-[var(--music-surface-strong)]">
                <img
                  [src]="videoThumbnail(video, 'hq')"
                  [alt]="video.title"
                  class="w-full h-full object-cover grayscale group-hover:grayscale-0 image-zoom"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                  (error)="onThumbnailError($event, video)"
                >
                <div class="absolute inset-0 bg-[#590d0d] opacity-0 group-hover:opacity-30 transition-opacity mix-blend-multiply"></div>
                <div class="absolute top-2 right-2 px-2 py-1 bg-black/60 text-white text-[10px] tracking-[0.08em] uppercase">{{ formatDuration(video.durationSeconds) }}</div>
              </div>
              <h3 class="serif-text text-lg text-[var(--music-text)] line-clamp-2">{{ video.title }}</h3>
              <p class="sans-text text-xs text-[var(--music-text-muted)] uppercase tracking-wide mt-1">{{ video.artist }}</p>
              <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--music-text-muted)] sans-text">
                <span>{{ video.year }}</span>
                <span>•</span>
                <span>{{ formatNumber(video.viewCount) }} views</span>
                @if (video.genre.length > 0) {
                  <span class="px-2 py-[2px] border border-[var(--music-border)] uppercase tracking-[0.08em] text-[10px]">{{ video.genre[0] }}</span>
                }
              </div>
            </a>
          }
        </div>
      }
    </section>

  `
})
export class MusicEditorialLandingComponent implements OnInit, OnDestroy {
  private musicApi = inject(MusicApiService);
  private player = inject(MusicPlayerService);
  private sanitizer = inject(DomSanitizer);
  private platformId = inject(PLATFORM_ID);
  private destroy$ = new Subject<void>();

  featured = signal<MusicFeaturedSections | null>(null);
  heroVideo = signal<MusicVideoSummary | null>(null);
  trending = signal<MusicVideoSummary[]>([]);
  newReleases = signal<MusicVideoSummary[]>([]);
  spotlightArtist = signal<any>(null);
  isLoading = signal(true);
  isPlaying = signal(false);
  
  playIcon = PlayIcon;
  arrowIcon = ArrowIcon;
  volumeIcon = VolumeIcon;

  heroEmbedUrl = computed<SafeResourceUrl | null>(() => {
    const video = this.heroVideo();
    if (!video || !this.isPlaying()) return null;
    const url = `https://www.youtube.com/embed/${video.youtubeId}?autoplay=1&controls=1&modestbranding=1&rel=0`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  ngOnInit() {
    this.loadFeatured();
    this.setupScrollAnimations();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadFeatured() {
    this.isLoading.set(true);
    this.musicApi.getFeatured().subscribe({
      next: (res: any) => {
        this.featured.set(res.data);
        if (res.data.trending.length > 0) {
          this.heroVideo.set(res.data.trending[0]);
          this.trending.set(res.data.trending);
        }
        this.newReleases.set(res.data.newReleases);
        this.isLoading.set(false);
        if (res.data.trending[0]) {
          this.loadArtistSpotlight(res.data.trending[0].artistSlug);
        }
      },
      error: () => { this.isLoading.set(false); }
    });
  }

  private loadArtistSpotlight(slug: string) {
    this.musicApi.getArtist(slug).subscribe({
      next: (res: any) => { this.spotlightArtist.set(res.data); }
    });
  }

  private setupScrollAnimations() {
    if (isPlatformBrowser(this.platformId) && 'IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('visible'); });
      }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
      setTimeout(() => { document.querySelectorAll('.reveal').forEach(el => observer.observe(el)); }, 100);
    }
  }

  playHero(video: MusicVideoSummary) {
    this.isPlaying.set(true);
    this.player.play(video);
    this.musicApi.incrementPlay(video.id).subscribe();
  }

  playTrack(track: MusicVideoSummary) {
    this.player.play(track, this.trending());
    this.musicApi.incrementPlay(track.id).subscribe();
  }

  formatDuration(seconds: number | null): string {
    if (!seconds) return '3:45';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }

  videoThumbnail(
    video: Pick<MusicVideoSummary, 'youtubeId' | 'thumbnailUrl' | 'hdThumbnailUrl'>,
    preferred: 'hq' | 'mq' = 'hq'
  ): string {
    const fallback = preferred === 'hq' ? 'hqdefault' : 'mqdefault';
    return video.hdThumbnailUrl || video.thumbnailUrl || `https://i.ytimg.com/vi/${video.youtubeId}/${fallback}.jpg`;
  }

  onThumbnailError(
    event: Event,
    video: Pick<MusicVideoSummary, 'youtubeId'>
  ): void {
    const img = event.target as HTMLImageElement | null;
    if (!img || !video?.youtubeId) return;

    const fallbackCandidates = [
      `https://i.ytimg.com/vi/${video.youtubeId}/mqdefault.jpg`,
      `https://i.ytimg.com/vi/${video.youtubeId}/default.jpg`,
    ];

    const currentIndex = Number.parseInt(img.dataset.fallbackIndex || '0', 10);
    const nextIndex = Number.isFinite(currentIndex) ? currentIndex : 0;

    if (nextIndex >= fallbackCandidates.length) {
      img.onerror = null;
      return;
    }

    img.dataset.fallbackIndex = String(nextIndex + 1);
    img.src = fallbackCandidates[nextIndex];
  }
}
