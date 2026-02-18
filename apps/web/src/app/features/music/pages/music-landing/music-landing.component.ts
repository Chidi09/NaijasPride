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
  template: `
    <div class="min-h-screen bg-gray-950 text-white pb-28">
      <!-- Hero -->
      <section class="relative overflow-hidden bg-gradient-to-b from-[#800020]/30 to-gray-950 px-4 pt-12 pb-8">
        <div class="max-w-7xl mx-auto flex items-center justify-between gap-6 flex-wrap">
          <div>
            <h1 class="text-4xl md:text-5xl font-bold text-white">Music Videos</h1>
            <p class="text-gray-400 mt-2 text-lg">Afrobeats, Highlife, and more from Nigeria &amp; Africa</p>
          </div>
          <div class="flex gap-3">
            <a
              routerLink="/music/browse"
              class="px-5 py-2.5 rounded-full bg-[#800020] text-white font-semibold hover:bg-[#9a0025] transition-colors"
            >Browse All</a>
          </div>
        </div>
      </section>

      @if (loading()) {
        <div class="max-w-7xl mx-auto px-4 py-12 text-center text-gray-500">Loading...</div>
      }

      @if (error()) {
        <div class="max-w-7xl mx-auto px-4 py-8">
          <p class="text-red-400 text-center">{{ error() }}</p>
        </div>
      }

      @if (featured()) {
        <div class="max-w-7xl mx-auto px-4 space-y-12 mt-6">

          <!-- Trending this week -->
          @if (featured()!.trending.length > 0) {
            <section>
              <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-bold flex items-center gap-2">
                  <span class="text-orange-500">🔥</span> Trending This Week
                </h2>
                <a routerLink="/music/browse" [queryParams]="{sort: 'trending'}" class="text-sm text-gray-400 hover:text-white transition-colors">See all</a>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                @for (video of featured()!.trending.slice(0, 6); track video.id) {
                  <app-music-card [video]="video" />
                }
              </div>
            </section>
          }

          <!-- New Releases -->
          @if (featured()!.newReleases.length > 0) {
            <section>
              <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-bold flex items-center gap-2">
                  <span class="text-green-400">🆕</span> New Releases
                </h2>
                <a routerLink="/music/browse" [queryParams]="{sort: 'new'}" class="text-sm text-gray-400 hover:text-white transition-colors">See all</a>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                @for (video of featured()!.newReleases.slice(0, 6); track video.id) {
                  <app-music-card [video]="video" />
                }
              </div>
            </section>
          }

          <!-- Genre Takeover -->
          @if (featured()!.genreTakeover) {
            <section class="rounded-2xl bg-gradient-to-r from-[#800020]/20 to-gray-900 p-6">
              <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-bold flex items-center gap-2">
                  <span class="text-purple-400">🎵</span> Genre Takeover:
                  <span class="text-[#800020]">{{ featured()!.genreTakeover!.genre }}</span>
                </h2>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4">
                @for (video of featured()!.genreTakeover!.videos.slice(0, 4); track video.id) {
                  <app-music-card [video]="video" />
                }
              </div>
            </section>
          }

          <!-- Replay Loop -->
          @if (featured()!.replayLoop.length > 0) {
            <section>
              <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-bold flex items-center gap-2">
                  <span class="text-blue-400">🔁</span> Replay Loop
                  <span class="text-xs text-gray-500 font-normal">(Most replayed)</span>
                </h2>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                @for (video of featured()!.replayLoop.slice(0, 6); track video.id) {
                  <app-music-card [video]="video" />
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

  ngOnInit(): void {
    this.musicApi.getFeatured().subscribe({
      next: (res) => {
        this.featured.set(res.data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load music. Please try again.');
        this.loading.set(false);
        console.error(err);
      },
    });
  }
}
