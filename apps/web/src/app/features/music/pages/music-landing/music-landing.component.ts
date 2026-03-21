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
    /* ══════════════════════════════════════════════════
       PAGE BASE
    ══════════════════════════════════════════════════ */
    .music-page {
      background: #080808;
      min-height: 100vh;
      color: #fff;
      /* Subtle noise grain overlay for texture depth */
      background-image:
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23noise)' opacity='0.025'/%3E%3C/svg%3E");
    }

    /* ══════════════════════════════════════════════════
       HERO — blurred artwork backdrop
    ══════════════════════════════════════════════════ */
    .hero-shell {
      position: relative;
      overflow: hidden;
      min-height: 300px;
    }
    .hero-art-blur {
      position: absolute; inset: -20px;
      background-size: cover;
      background-position: center;
      filter: blur(80px) saturate(1.6) brightness(0.55);
      transform: scale(1.08);
      transition: background-image 0.8s ease;
    }
    /* Dual gradient: vignette sides + bottom fade into page */
    .hero-vignette {
      position: absolute; inset: 0;
      background:
        radial-gradient(ellipse at 0% 50%, rgba(8,8,8,0.7) 0%, transparent 60%),
        radial-gradient(ellipse at 100% 50%, rgba(8,8,8,0.7) 0%, transparent 60%),
        linear-gradient(to bottom, rgba(8,8,8,0.1) 0%, rgba(8,8,8,0.98) 100%);
    }
    .hero-content {
      position: relative;
      z-index: 1;
      padding: 44px 20px 24px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .hero-label {
      font-size: 0.65rem;
      font-weight: 800;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #800020;
      margin-bottom: 6px;
    }
    .hero-title {
      font-size: 2.6rem;
      font-weight: 900;
      letter-spacing: -0.04em;
      line-height: 1;
      margin-bottom: 4px;
    }
    @media (min-width: 768px) {
      .hero-title { font-size: 3.2rem; }
    }
    .hero-sub {
      font-size: 0.82rem;
      color: rgba(255,255,255,0.35);
      margin-bottom: 24px;
      letter-spacing: 0.01em;
    }

    /* ══════════════════════════════════════════════════
       LIQUID GLASS GENRE PILLS
    ══════════════════════════════════════════════════ */
    .genre-scroll {
      display: flex;
      gap: 7px;
      overflow-x: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
      padding-bottom: 4px;
    }
    .genre-scroll::-webkit-scrollbar { display: none; }

    .genre-pill {
      flex-shrink: 0;
      position: relative;
      padding: 7px 18px;
      border-radius: 999px;
      font-size: 0.76rem;
      font-weight: 650;
      letter-spacing: 0.015em;
      white-space: nowrap;
      cursor: pointer;
      text-decoration: none;
      color: rgba(255, 255, 255, 0.55);
      /* Liquid glass */
      background: rgba(255, 255, 255, 0.06);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.12),
        0 4px 16px rgba(0, 0, 0, 0.2);
      transition: all 0.2s ease;
      overflow: hidden;
    }
    /* Specular highlight inside pill */
    .genre-pill::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 50%;
      border-radius: 999px 999px 0 0;
      background: linear-gradient(to bottom, rgba(255,255,255,0.1), transparent);
      pointer-events: none;
    }
    .genre-pill:hover {
      background: rgba(255, 255, 255, 0.11);
      color: rgba(255, 255, 255, 0.88);
      border-color: rgba(255, 255, 255, 0.18);
      transform: translateY(-1px);
    }
    .genre-pill.pill-active {
      background: rgba(128, 0, 32, 0.85);
      backdrop-filter: blur(20px) saturate(200%) brightness(130%);
      color: #fff;
      border-color: rgba(200, 40, 70, 0.6);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.3),
        0 4px 20px rgba(128, 0, 32, 0.5);
    }

    /* ══════════════════════════════════════════════════
       FEATURED HERO CARD
    ══════════════════════════════════════════════════ */
    .featured-card {
      position: relative;
      border-radius: 20px;
      overflow: hidden;
      cursor: pointer;
      background: #111;
    }
    .featured-card-img {
      width: 100%;
      aspect-ratio: 21 / 8;
      object-fit: cover;
      display: block;
      transition: transform 0.6s ease;
    }
    .featured-card:hover .featured-card-img { transform: scale(1.03); }
    .featured-card-overlay {
      position: absolute; inset: 0;
      background: linear-gradient(
        to top,
        rgba(0, 0, 0, 0.9) 0%,
        rgba(0, 0, 0, 0.4) 40%,
        transparent 70%
      );
    }
    /* Glass badge for the play button area */
    .featured-info {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      padding: 20px 22px;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 12px;
    }
    .featured-badge {
      font-size: 0.62rem;
      font-weight: 800;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: rgba(255, 100, 100, 0.9);
      background: rgba(128, 0, 32, 0.3);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(200, 50, 50, 0.25);
      border-radius: 999px;
      padding: 3px 10px;
      margin-bottom: 6px;
      display: inline-block;
    }
    .featured-title {
      font-size: 1.5rem;
      font-weight: 850;
      letter-spacing: -0.03em;
      line-height: 1.1;
    }
    .featured-artist {
      font-size: 0.8rem;
      color: rgba(255,255,255,0.5);
      margin-top: 3px;
    }
    .featured-play {
      flex-shrink: 0;
      width: 48px; height: 48px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      /* Liquid glass play button */
      background: rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.3);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.4),
        0 8px 32px rgba(0, 0, 0, 0.4);
      color: #fff;
      transition: transform 0.2s, background 0.2s;
    }
    .featured-play:hover {
      background: rgba(255, 255, 255, 0.22);
      transform: scale(1.08);
    }

    /* ══════════════════════════════════════════════════
       LIQUID GLASS SECTION CARDS
    ══════════════════════════════════════════════════ */
    .glass-section {
      position: relative;
      border-radius: 20px;
      padding: 20px;
      overflow: hidden;
      /* Core glass stack */
      background: rgba(255, 255, 255, 0.045);
      backdrop-filter: blur(32px) saturate(180%) brightness(108%);
      -webkit-backdrop-filter: blur(32px) saturate(180%) brightness(108%);
      border: 1px solid rgba(255, 255, 255, 0.085);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.14),
        inset 0 -1px 0 rgba(0, 0, 0, 0.12),
        0 8px 32px rgba(0, 0, 0, 0.25),
        0 1px 4px rgba(0, 0, 0, 0.3);
    }
    /* Specular highlight — top-left corner light refraction */
    .glass-section::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 45%;
      border-radius: 20px 20px 0 0;
      background: linear-gradient(
        to bottom,
        rgba(255, 255, 255, 0.06) 0%,
        transparent 100%
      );
      pointer-events: none;
    }
    /* Subtle animated shimmer sweep */
    .glass-section::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: linear-gradient(
        105deg,
        transparent 30%,
        rgba(255, 255, 255, 0.025) 50%,
        transparent 70%
      );
      background-size: 200% 100%;
      animation: glass-shimmer 6s ease-in-out infinite;
      pointer-events: none;
    }
    @keyframes glass-shimmer {
      0%   { background-position: 200% 0; }
      50%  { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }

    /* Takeover section has crimson tint */
    .glass-section.takeover {
      background: rgba(128, 0, 32, 0.1);
      border-color: rgba(180, 20, 50, 0.2);
      box-shadow:
        inset 0 1px 0 rgba(255, 180, 180, 0.1),
        inset 0 -1px 0 rgba(0,0,0,0.15),
        0 8px 40px rgba(128, 0, 32, 0.15),
        0 1px 4px rgba(0,0,0,0.3);
    }

    /* Section header */
    .section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      position: relative;
      z-index: 1;
    }
    .section-title {
      font-size: 1.1rem;
      font-weight: 750;
      letter-spacing: -0.025em;
      color: rgba(255, 255, 255, 0.92);
    }
    .section-see-all {
      font-size: 0.74rem;
      font-weight: 650;
      color: rgba(128, 50, 70, 0.9);
      text-decoration: none;
      padding: 4px 12px;
      border-radius: 999px;
      background: rgba(128, 0, 32, 0.12);
      border: 1px solid rgba(128, 0, 32, 0.2);
      transition: all 0.2s ease;
    }
    .section-see-all:hover {
      background: rgba(128, 0, 32, 0.22);
      color: rgba(220, 80, 100, 0.95);
    }

    /* ══════════════════════════════════════════════════
       HORIZONTAL CAROUSEL
    ══════════════════════════════════════════════════ */
    .carousel {
      display: flex;
      gap: 12px;
      overflow-x: auto;
      padding-bottom: 4px;
      scrollbar-width: none;
      -ms-overflow-style: none;
      position: relative;
      z-index: 1;
    }
    .carousel::-webkit-scrollbar { display: none; }

    .c-item {
      flex: 0 0 136px;
      cursor: pointer;
    }
    @media (min-width: 480px)  { .c-item { flex: 0 0 150px; } }
    @media (min-width: 640px)  { .c-item { flex: 0 0 164px; } }
    @media (min-width: 1024px) { .c-item { flex: 0 0 180px; } }

    .c-art {
      width: 100%;
      aspect-ratio: 1 / 1;
      border-radius: 12px;
      overflow: hidden;
      background: #1a1a1a;
      position: relative;
      /* Subtle glass border on art tiles */
      box-shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 4px 12px rgba(0,0,0,0.3);
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
    .c-item:hover .c-art {
      transform: translateY(-3px) scale(1.02);
      box-shadow: 0 0 0 1px rgba(255,255,255,0.12), 0 12px 32px rgba(0,0,0,0.5);
    }
    .c-art img {
      width: 100%; height: 100%;
      object-fit: cover;
      transition: opacity 0.3s;
    }
    .c-item:hover .c-art img { opacity: 0.82; }

    /* Liquid glass play overlay */
    .c-play-overlay {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.3);
      opacity: 0;
      transition: opacity 0.2s ease;
      border-radius: inherit;
    }
    .c-item:hover .c-play-overlay { opacity: 1; }

    .c-play-btn {
      width: 40px; height: 40px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: rgba(255, 255, 255, 0.18);
      backdrop-filter: blur(16px) saturate(180%);
      -webkit-backdrop-filter: blur(16px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.35);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.4),
        0 6px 20px rgba(0,0,0,0.4);
      color: #fff;
    }

    .c-title {
      font-size: 0.78rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.88);
      line-height: 1.3;
      margin-top: 9px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .c-artist {
      font-size: 0.69rem;
      color: rgba(255, 255, 255, 0.38);
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* ══════════════════════════════════════════════════
       SKELETON LOADING
    ══════════════════════════════════════════════════ */
    .skel-art {
      width: 160px;
      aspect-ratio: 1;
      border-radius: 12px;
      background: rgba(255,255,255,0.05);
      flex-shrink: 0;
      animation: skel-pulse 1.6s ease-in-out infinite;
    }
    @keyframes skel-pulse {
      0%, 100% { opacity: 0.4; }
      50%       { opacity: 0.8; }
    }
  `],
  template: `
    <div class="music-page pb-40">

      <!-- ── Hero ── -->
      <div class="hero-shell">
        @if (heroTrack()) {
          <div
            class="hero-art-blur"
            [style.background-image]="'url(' + heroTrack()!.thumbnailUrl + ')'"
          ></div>
        }
        <div class="hero-vignette"></div>

        <div class="hero-content">
          <p class="hero-label">NaijasPride Music</p>
          <h1 class="hero-title">Listen Now</h1>
          <p class="hero-sub">Afrobeats · Highlife · Afrojuju · and more from Nigeria &amp; Africa</p>

          <!-- Genre filter pills -->
          <div class="genre-scroll">
            <button class="genre-pill pill-active" type="button">All</button>
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

      <!-- ── Loading skeletons ── -->
      @if (loading()) {
        <div class="max-w-6xl mx-auto px-5 py-10">
          <div class="flex gap-3 overflow-hidden">
            @for (s of skeletons; track s) {
              <div class="skel-art"></div>
            }
          </div>
        </div>
      }

      @if (error()) {
        <p class="text-red-400 text-sm text-center py-8 px-5">{{ error() }}</p>
      }

      @if (featured()) {
        <div class="max-w-6xl mx-auto px-4 space-y-5 mt-4">

          <!-- ── Featured hero card ── -->
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
                class="featured-card-img"
              >
              <div class="featured-card-overlay"></div>
              <div class="featured-info">
                <div>
                  <span class="featured-badge">Trending Now</span>
                  <p class="featured-title">{{ heroTrack()!.title }}</p>
                  <p class="featured-artist">{{ heroTrack()!.artist }}</p>
                </div>
                <div class="featured-play">
                  <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" style="margin-left:2px">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
              </div>
            </div>
          }

          <!-- ── Trending This Week ── -->
          @if (featured()!.trending.length > 0) {
            <section class="glass-section">
              <div class="section-head">
                <span class="section-title">Trending This Week</span>
                <a routerLink="/music/browse" [queryParams]="{sort:'trending'}" class="section-see-all">See All</a>
              </div>
              <div class="carousel">
                @for (v of featured()!.trending; track v.id) {
                  <div class="c-item" (click)="playTrack(v)" role="button" [attr.aria-label]="'Play ' + v.title">
                    <div class="c-art">
                      <img [src]="v.thumbnailUrl || ''" [alt]="v.title" loading="lazy">
                      <div class="c-play-overlay">
                        <div class="c-play-btn">
                          <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24" style="margin-left:1px">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                    <p class="c-title">{{ v.title }}</p>
                    <p class="c-artist">{{ v.artist }}</p>
                  </div>
                }
              </div>
            </section>
          }

          <!-- ── New Releases ── -->
          @if (featured()!.newReleases.length > 0) {
            <section class="glass-section">
              <div class="section-head">
                <span class="section-title">New Releases</span>
                <a routerLink="/music/browse" [queryParams]="{sort:'new'}" class="section-see-all">See All</a>
              </div>
              <div class="carousel">
                @for (v of featured()!.newReleases; track v.id) {
                  <div class="c-item" (click)="playTrack(v)" role="button" [attr.aria-label]="'Play ' + v.title">
                    <div class="c-art">
                      <img [src]="v.thumbnailUrl || ''" [alt]="v.title" loading="lazy">
                      <div class="c-play-overlay">
                        <div class="c-play-btn">
                          <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24" style="margin-left:1px">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                    <p class="c-title">{{ v.title }}</p>
                    <p class="c-artist">{{ v.artist }}</p>
                  </div>
                }
              </div>
            </section>
          }

          <!-- ── Genre Spotlight ── -->
          @if (featured()!.genreTakeover) {
            <section class="glass-section takeover">
              <div class="section-head">
                <span class="section-title">
                  Genre Spotlight&ensp;—&ensp;<span style="color:rgba(220,80,100,0.9)">{{ featured()!.genreTakeover!.genre }}</span>
                </span>
              </div>
              <div class="carousel">
                @for (v of featured()!.genreTakeover!.videos; track v.id) {
                  <div class="c-item" (click)="playTrack(v)" role="button" [attr.aria-label]="'Play ' + v.title">
                    <div class="c-art">
                      <img [src]="v.thumbnailUrl || ''" [alt]="v.title" loading="lazy">
                      <div class="c-play-overlay">
                        <div class="c-play-btn">
                          <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24" style="margin-left:1px">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                    <p class="c-title">{{ v.title }}</p>
                    <p class="c-artist">{{ v.artist }}</p>
                  </div>
                }
              </div>
            </section>
          }

          <!-- ── Replay Loop ── -->
          @if (featured()!.replayLoop.length > 0) {
            <section class="glass-section">
              <div class="section-head">
                <span class="section-title">Replay Loop</span>
                <span class="text-xs" style="color:rgba(255,255,255,0.2);font-weight:600;">Most replayed</span>
              </div>
              <div class="carousel">
                @for (v of featured()!.replayLoop; track v.id) {
                  <div class="c-item" (click)="playTrack(v)" role="button" [attr.aria-label]="'Play ' + v.title">
                    <div class="c-art">
                      <img [src]="v.thumbnailUrl || ''" [alt]="v.title" loading="lazy">
                      <div class="c-play-overlay">
                        <div class="c-play-btn">
                          <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24" style="margin-left:1px">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                    <p class="c-title">{{ v.title }}</p>
                    <p class="c-artist">{{ v.artist }}</p>
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

  readonly skeletons = [1, 2, 3, 4, 5, 6, 7];

  readonly genres = [
    'Afrobeats', 'Afropop', 'Highlife', 'Afrojuju', 'Fuji',
    'Juju', 'Apala', 'R&B', 'Hip Hop', 'Gospel',
  ];

  ngOnInit(): void {
    this.musicApi.getFeatured().subscribe({
      next: (res) => {
        this.featured.set(res.data);
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
