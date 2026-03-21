import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MusicApiService } from '../../services/music-api.service';
import { MusicPlayerService } from '../../services/music-player.service';
import { MusicCardComponent } from '../../components/music-card/music-card.component';
import { MusicFeaturedSections, MusicVideoSummary } from '@naijaspride/types';

@Component({
  selector: 'app-music-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, MusicCardComponent],
  styles: [`
    .am-page {
      background: #0a0a0a;
      min-height: 100vh;
      color: #fff;
    }

    /* Hero */
    .hero-bg {
      position: relative;
      overflow: hidden;
      background: #111;
      min-height: 280px;
    }
    .hero-blur-art {
      position: absolute; inset: 0;
      background-size: cover;
      background-position: center;
      filter: blur(60px) saturate(1.4);
      opacity: 0.35;
      transform: scale(1.1);
    }
    .hero-gradient {
      position: absolute; inset: 0;
      background: linear-gradient(to bottom, transparent 0%, #0a0a0a 90%);
    }
    .hero-content { position: relative; z-index: 1; }

    /* Section glass card */
    .am-section {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 18px;
      padding: 20px;
      backdrop-filter: blur(4px);
    }

    /* Horizontal scroll carousel */
    .carousel {
      display: flex;
      gap: 14px;
      overflow-x: auto;
      padding-bottom: 8px;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .carousel::-webkit-scrollbar { display: none; }

    .carousel-item {
      flex: 0 0 140px;
    }
    @media (min-width: 640px) {
      .carousel-item { flex: 0 0 160px; }
    }
    @media (min-width: 1024px) {
      .carousel-item { flex: 0 0 180px; }
    }

    .carousel-art {
      width: 100%;
      aspect-ratio: 1 / 1;
      border-radius: 10px;
      overflow: hidden;
      background: #1a1a1a;
      position: relative;
    }
    .carousel-art img {
      width: 100%; height: 100%;
      object-fit: cover;
      transition: transform 0.3s ease, opacity 0.3s ease;
    }
    .carousel-item:hover .carousel-art img {
      transform: scale(1.05);
      opacity: 0.85;
    }
    .play-overlay {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.4);
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    .carousel-item:hover .play-overlay { opacity: 1; }

    .carousel-title {
      font-size: 0.8rem;
      font-weight: 600;
      color: #fff;
      line-height: 1.3;
      margin-top: 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .carousel-artist {
      font-size: 0.72rem;
      color: rgba(255,255,255,0.45);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 2px;
    }

    /* Genre pill tabs */
    .genre-tabs {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      scrollbar-width: none;
      padding-bottom: 2px;
    }
    .genre-tabs::-webkit-scrollbar { display: none; }

    .genre-pill {
      flex-shrink: 0;
      padding: 6px 16px;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.01em;
      background: rgba(255,255,255,0.07);
      color: rgba(255,255,255,0.6);
      border: 1px solid rgba(255,255,255,0.1);
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
    }
    .genre-pill:hover {
      background: rgba(255,255,255,0.13);
      color: #fff;
    }
    .genre-pill.active {
      background: #800020;
      color: #fff;
      border-color: #800020;
    }

    /* Section header */
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .section-title {
      font-size: 1.2rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #fff;
    }
    .section-see-all {
      font-size: 0.78rem;
      font-weight: 600;
      color: #800020;
      text-decoration: none;
      transition: opacity 0.2s;
    }
    .section-see-all:hover { opacity: 0.75; }

    /* Genre takeover */
    .takeover-section {
      background: linear-gradient(135deg, rgba(128,0,32,0.18) 0%, rgba(20,20,20,0.95) 60%);
      border: 1px solid rgba(128,0,32,0.25);
    }

    /* Listen Now featured card */
    .featured-card {
      position: relative;
      border-radius: 16px;
      overflow: hidden;
      background: #1a1a1a;
      cursor: pointer;
    }
    .featured-card-art {
      width: 100%;
      aspect-ratio: 16 / 7;
      object-fit: cover;
      display: block;
    }
    .featured-card-overlay {
      position: absolute; inset: 0;
      background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 55%);
    }
    .featured-card-info {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      padding: 20px;
    }
    .featured-label {
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #800020;
      margin-bottom: 4px;
    }
    .featured-title {
      font-size: 1.4rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.2;
    }
    .featured-artist {
      font-size: 0.85rem;
      color: rgba(255,255,255,0.6);
      margin-top: 4px;
    }
    .featured-play-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 12px;
      padding: 8px 18px;
      background: #800020;
      color: #fff;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      border: none;
      cursor: pointer;
      transition: background 0.2s, transform 0.15s;
    }
    .featured-play-btn:hover {
      background: #9a0025;
      transform: scale(1.02);
    }
  `],
  template: `
    <div class="am-page pb-32">

      <!-- Hero / Listen Now -->
      <div class="hero-bg">
        @if (heroTrack()) {
          <div
            class="hero-blur-art"
            [style.background-image]="'url(' + heroTrack()!.thumbnailUrl + ')'"
          ></div>
        }
        <div class="hero-gradient"></div>
        <div class="hero-content px-5 pt-10 pb-6 max-w-7xl mx-auto">
          <p class="text-xs font-bold tracking-widest uppercase text-[#800020] mb-1">NaijasPride</p>
          <h1 class="text-3xl md:text-4xl font-black tracking-tight leading-none mb-1">Listen Now</h1>
          <p class="text-sm text-white/40 mb-5">Afrobeats, Highlife &amp; more from Nigeria &amp; Africa</p>

          <!-- Genre filter pills -->
          <div class="genre-tabs">
            <button class="genre-pill active" type="button">All</button>
            @for (genre of genres; track genre) {
              <a
                [routerLink]="['/music/browse']"
                [queryParams]="{ genre: genre }"
                class="genre-pill"
              >{{ genre }}</a>
            }
          </div>
        </div>
      </div>

      @if (loading()) {
        <div class="max-w-7xl mx-auto px-5 py-12">
          <div class="flex gap-4 overflow-hidden">
            @for (i of skeletons; track i) {
              <div class="flex-shrink-0 w-40">
                <div class="aspect-square rounded-xl bg-white/5 animate-pulse"></div>
                <div class="h-3 mt-3 rounded bg-white/5 animate-pulse w-3/4"></div>
                <div class="h-2.5 mt-1.5 rounded bg-white/5 animate-pulse w-1/2"></div>
              </div>
            }
          </div>
        </div>
      }

      @if (error()) {
        <div class="max-w-7xl mx-auto px-5 py-8">
          <p class="text-red-400 text-sm text-center">{{ error() }}</p>
        </div>
      }

      @if (featured()) {
        <div class="max-w-7xl mx-auto px-5 space-y-6 mt-5">

          <!-- Featured "now playing" hero card -->
          @if (heroTrack()) {
            <div
              class="featured-card"
              (click)="playTrack(heroTrack()!)"
              role="button"
              [attr.aria-label]="'Play ' + heroTrack()!.title"
            >
              <img
                [src]="heroTrack()!.thumbnailUrl || ''"
                [alt]="heroTrack()!.title"
                class="featured-card-art"
              >
              <div class="featured-card-overlay"></div>
              <div class="featured-card-info">
                <p class="featured-label">Trending Now</p>
                <p class="featured-title">{{ heroTrack()!.title }}</p>
                <p class="featured-artist">{{ heroTrack()!.artist }}</p>
                <button class="featured-play-btn">
                  <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  Play
                </button>
              </div>
            </div>
          }

          <!-- Trending This Week -->
          @if (featured()!.trending.length > 0) {
            <section class="am-section">
              <div class="section-header">
                <span class="section-title">Trending This Week</span>
                <a routerLink="/music/browse" [queryParams]="{sort: 'trending'}" class="section-see-all">See All</a>
              </div>
              <div class="carousel">
                @for (video of featured()!.trending; track video.id) {
                  <div class="carousel-item" (click)="playTrack(video)" role="button" [attr.aria-label]="'Play ' + video.title">
                    <div class="carousel-art">
                      <img [src]="video.thumbnailUrl || ''" [alt]="video.title" loading="lazy">
                      <div class="play-overlay">
                        <div style="width:36px;height:36px;border-radius:50%;background:rgba(128,0,32,0.9);display:flex;align-items:center;justify-content:center;">
                          <svg width="14" height="14" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                      </div>
                    </div>
                    <p class="carousel-title">{{ video.title }}</p>
                    <p class="carousel-artist">{{ video.artist }}</p>
                  </div>
                }
              </div>
            </section>
          }

          <!-- New Releases -->
          @if (featured()!.newReleases.length > 0) {
            <section class="am-section">
              <div class="section-header">
                <span class="section-title">New Releases</span>
                <a routerLink="/music/browse" [queryParams]="{sort: 'new'}" class="section-see-all">See All</a>
              </div>
              <div class="carousel">
                @for (video of featured()!.newReleases; track video.id) {
                  <div class="carousel-item" (click)="playTrack(video)" role="button" [attr.aria-label]="'Play ' + video.title">
                    <div class="carousel-art">
                      <img [src]="video.thumbnailUrl || ''" [alt]="video.title" loading="lazy">
                      <div class="play-overlay">
                        <div style="width:36px;height:36px;border-radius:50%;background:rgba(128,0,32,0.9);display:flex;align-items:center;justify-content:center;">
                          <svg width="14" height="14" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                      </div>
                    </div>
                    <p class="carousel-title">{{ video.title }}</p>
                    <p class="carousel-artist">{{ video.artist }}</p>
                  </div>
                }
              </div>
            </section>
          }

          <!-- Genre Takeover -->
          @if (featured()!.genreTakeover) {
            <section class="am-section takeover-section">
              <div class="section-header">
                <span class="section-title">
                  Genre Spotlight&ensp;
                  <span style="color: #800020;">{{ featured()!.genreTakeover!.genre }}</span>
                </span>
              </div>
              <div class="carousel">
                @for (video of featured()!.genreTakeover!.videos; track video.id) {
                  <div class="carousel-item" (click)="playTrack(video)" role="button" [attr.aria-label]="'Play ' + video.title">
                    <div class="carousel-art">
                      <img [src]="video.thumbnailUrl || ''" [alt]="video.title" loading="lazy">
                      <div class="play-overlay">
                        <div style="width:36px;height:36px;border-radius:50%;background:rgba(128,0,32,0.9);display:flex;align-items:center;justify-content:center;">
                          <svg width="14" height="14" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                      </div>
                    </div>
                    <p class="carousel-title">{{ video.title }}</p>
                    <p class="carousel-artist">{{ video.artist }}</p>
                  </div>
                }
              </div>
            </section>
          }

          <!-- Replay Loop -->
          @if (featured()!.replayLoop.length > 0) {
            <section class="am-section">
              <div class="section-header">
                <span class="section-title">Replay Loop</span>
                <span class="text-xs text-white/30 font-medium">Most replayed</span>
              </div>
              <div class="carousel">
                @for (video of featured()!.replayLoop; track video.id) {
                  <div class="carousel-item" (click)="playTrack(video)" role="button" [attr.aria-label]="'Play ' + video.title">
                    <div class="carousel-art">
                      <img [src]="video.thumbnailUrl || ''" [alt]="video.title" loading="lazy">
                      <div class="play-overlay">
                        <div style="width:36px;height:36px;border-radius:50%;background:rgba(128,0,32,0.9);display:flex;align-items:center;justify-content:center;">
                          <svg width="14" height="14" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                      </div>
                    </div>
                    <p class="carousel-title">{{ video.title }}</p>
                    <p class="carousel-artist">{{ video.artist }}</p>
                  </div>
                }
              </div>
            </section>
          }

        </div>
      }
    </div>
  `
})
export class MusicLandingComponent implements OnInit {
  private musicApi = inject(MusicApiService);
  readonly player = inject(MusicPlayerService);

  featured = signal<MusicFeaturedSections | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  heroTrack = signal<MusicVideoSummary | null>(null);

  readonly skeletons = [1, 2, 3, 4, 5, 6];

  readonly genres = [
    'Afrobeats', 'Afropop', 'Highlife', 'Afrojuju', 'Fuji',
    'Juju', 'Apala', 'R&B', 'Hip Hop', 'Gospel',
  ];

  ngOnInit(): void {
    this.musicApi.getFeatured().subscribe({
      next: (res) => {
        this.featured.set(res.data);
        // Use the first trending track as the hero
        const hero = res.data?.trending?.[0] ?? res.data?.newReleases?.[0] ?? null;
        this.heroTrack.set(hero);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load music. Please try again.');
        this.loading.set(false);
        console.error(err);
      },
    });
  }

  playTrack(video: MusicVideoSummary): void {
    const allTracks = [
      ...(this.featured()?.trending ?? []),
      ...(this.featured()?.newReleases ?? []),
      ...(this.featured()?.replayLoop ?? []),
    ];
    this.player.play(video, allTracks.length > 0 ? allTracks : undefined);
  }
}
