import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { MusicApiService } from '../../services/music-api.service';
import { MusicPlayerService } from '../../services/music-player.service';
import { MusicCardComponent } from '../../components/music-card/music-card.component';
import { MusicArtistPage } from '@naijaspride/types';

@Component({
  selector: 'app-artist-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, MusicCardComponent],
  template: `
    <div class="min-h-screen bg-gray-950 text-white pb-28">
      @if (loading()) {
        <div class="flex items-center justify-center py-24 text-gray-500">Loading artist...</div>
      }

      @if (error()) {
        <div class="max-w-4xl mx-auto px-4 py-16 text-center">
          <p class="text-red-400 text-lg">{{ error() }}</p>
          <a routerLink="/music" class="mt-4 inline-block text-[#800020] hover:underline">Back to Music</a>
        </div>
      }

      @if (artist()) {
        <!-- Artist header -->
        <header class="relative bg-gradient-to-b from-[#800020]/40 to-gray-950 px-4 pt-16 pb-10">
          <div class="max-w-7xl mx-auto">
            <div class="flex items-end gap-6">
              <!-- Avatar placeholder (initials) -->
              <div class="w-24 h-24 md:w-32 md:h-32 rounded-full bg-[#800020] flex items-center justify-center flex-shrink-0 shadow-2xl text-3xl font-bold">
                {{ initials() }}
              </div>
              <div>
                <p class="text-xs text-gray-400 uppercase tracking-widest mb-1">Artist</p>
                <h1 class="text-3xl md:text-5xl font-bold">{{ artist()!.artistName }}</h1>
                <p class="text-gray-400 mt-2">
                  {{ artist()!.totalVideos }} videos &middot;
                  {{ formatPlays(artist()!.totalPlays) }} plays &middot;
                  <span class="capitalize">{{ artist()!.region }}</span>
                </p>
              </div>
            </div>

            <!-- Play All button -->
            @if (artist()!.topVideos.length > 0) {
              <button
                (click)="playAll()"
                class="mt-6 px-6 py-2.5 rounded-full bg-white text-gray-900 font-bold hover:bg-gray-100 transition-colors flex items-center gap-2"
              >
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                Play All
              </button>
            }
          </div>
        </header>

        <div class="max-w-7xl mx-auto px-4 space-y-12 mt-8">
          <!-- Top Videos -->
          @if (artist()!.topVideos.length > 0) {
            <section>
              <h2 class="text-lg font-bold mb-4 text-gray-200">Top Videos</h2>
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                @for (video of artist()!.topVideos; track video.id) {
                  <app-music-card [video]="video" />
                }
              </div>
            </section>
          }

          <!-- Latest Videos -->
          @if (artist()!.latestVideos.length > 0) {
            <section>
              <h2 class="text-lg font-bold mb-4 text-gray-200">Latest</h2>
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                @for (video of artist()!.latestVideos; track video.id) {
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
export class ArtistDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private musicApi = inject(MusicApiService);
  private playerService = inject(MusicPlayerService);

  artist = signal<MusicArtistPage | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  initials = computed(() => {
    const name = this.artist()?.artistName ?? '';
    return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
  });

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    this.musicApi.getArtist(slug).subscribe({
      next: (res) => {
        this.artist.set(res.data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Artist not found.');
        this.loading.set(false);
      },
    });
  }

  playAll(): void {
    const videos = this.artist()?.topVideos ?? [];
    if (videos.length === 0) return;
    this.playerService.play(videos[0], videos);
  }

  formatPlays(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }
}
