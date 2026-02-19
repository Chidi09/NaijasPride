import { Component, OnInit, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MusicApiService } from '../../services/music-api.service';
import { MusicPlayerService } from '../../services/music-player.service';
import { MusicCardComponent } from '../../components/music-card/music-card.component';
import { AuthStateService } from '../../../../core/auth/auth-state.service';
import { MusicVideo, MusicVideoSummary } from '@naijaspride/types';

@Component({
  selector: 'app-music-watch',
  standalone: true,
  imports: [CommonModule, RouterLink, MusicCardComponent],
  template: `
    <div class="min-h-screen bg-gray-950 text-white pb-28">
      @if (loading()) {
        <div class="flex items-center justify-center py-24 text-gray-500">Loading...</div>
      }

      @if (error()) {
        <div class="max-w-4xl mx-auto px-4 py-16 text-center">
          <p class="text-red-400 text-lg">{{ error() }}</p>
          <a routerLink="/music" class="mt-4 inline-block text-[#800020] hover:underline">Back to Music</a>
        </div>
      }

      @if (video()) {
        <div class="max-w-7xl mx-auto px-4 pt-6">
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">

            <!-- Main player area -->
            <div class="lg:col-span-2">
              <!-- YouTube embed -->
              <div class="aspect-video w-full rounded-xl overflow-hidden bg-black shadow-2xl">
                @if (embedUrl()) {
                  <iframe
                    [src]="embedUrl()!"
                    class="w-full h-full"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen
                    title="{{ video()!.title }}"
                  ></iframe>
                }
              </div>

              <!-- Video info -->
              <div class="mt-4">
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <h1 class="text-2xl font-bold leading-tight">{{ video()!.title }}</h1>
                    <div class="flex items-center gap-2 mt-1 flex-wrap">
                      <a
                        [routerLink]="['/music/artist', video()!.artistSlug]"
                        class="text-[#800020] hover:text-red-400 font-semibold transition-colors"
                      >{{ video()!.artist }}</a>
                      @if (video()!.featuring.length > 0) {
                        <span class="text-gray-500">ft. {{ video()!.featuring.join(', ') }}</span>
                      }
                      <span class="text-gray-600">&middot;</span>
                      <span class="text-gray-500 text-sm">{{ video()!.year }}</span>
                    </div>
                    <div class="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <span>{{ formatCount(video()!.viewCount) }} views</span>
                      <span>{{ formatCount(video()!.playCount) }} plays</span>
                      @if (!video()!.isOfficial) {
                        <span class="bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full text-xs">Fan Upload</span>
                      }
                      @if (video()!.isExplicit) {
                        <span class="bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full text-xs">Explicit</span>
                      }
                    </div>
                  </div>

                  <!-- Action buttons -->
                  <div class="flex items-center gap-2 flex-shrink-0">
                    <!-- Like -->
                    <button
                      (click)="toggleLike()"
                      [disabled]="!isLoggedIn()"
                      class="flex items-center gap-1.5 px-4 py-2 rounded-full transition-all font-medium text-sm"
                      [class.bg-[#800020]]="video()!.isLiked"
                      [class.text-white]="video()!.isLiked"
                      [class.bg-gray-800]="!video()!.isLiked"
                      [class.text-gray-300]="!video()!.isLiked"
                      [class.hover:bg-gray-700]="!video()!.isLiked"
                      [title]="!isLoggedIn() ? 'Sign in to like' : ''"
                    >
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                      </svg>
                      {{ video()!.likeCount }}
                    </button>

                    <!-- Share -->
                    <button
                      (click)="share()"
                      class="flex items-center gap-1.5 px-4 py-2 rounded-full bg-gray-800 text-gray-300 hover:bg-gray-700 transition-all font-medium text-sm"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                      </svg>
                      Share
                    </button>
                  </div>
                </div>

                <!-- Genre tags -->
                @if (video()!.genre.length > 0) {
                  <div class="flex flex-wrap gap-2 mt-4">
                    @for (g of video()!.genre; track g) {
                      <a
                        routerLink="/music/browse"
                        [queryParams]="{genre: g}"
                        class="px-3 py-1 rounded-full bg-gray-800 text-gray-400 text-xs hover:bg-gray-700 hover:text-gray-200 transition-all"
                      >{{ g }}</a>
                    }
                  </div>
                }
              </div>
            </div>

            <!-- Related videos sidebar -->
            <div class="lg:col-span-1">
              <h2 class="text-lg font-semibold mb-4 text-gray-300">Up Next</h2>
              @if (related().length > 0) {
                <div class="space-y-3">
                  @for (rel of related(); track rel.id) {
                    <div
                      [routerLink]="['/music', rel.slug]"
                      class="flex gap-3 cursor-pointer group hover:bg-gray-800/50 rounded-lg p-2 -mx-2 transition-colors"
                    >
                      <div class="w-20 h-20 rounded-md overflow-hidden flex-shrink-0">
                        <img
                          [src]="rel.thumbnailUrl || ''"
                          [alt]="rel.title"
                          class="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                          loading="lazy"
                        >
                      </div>
                      <div class="min-w-0">
                        <p class="text-sm font-medium text-white leading-tight truncate">{{ rel.title }}</p>
                        <p class="text-xs text-gray-400 mt-0.5 truncate">{{ rel.artist }}</p>
                        <p class="text-xs text-gray-600 mt-1">{{ formatCount(rel.viewCount) }} views</p>
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <p class="text-gray-600 text-sm">No related videos</p>
              }
            </div>

          </div>
        </div>
      }
    </div>
  `
})
export class MusicWatchComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private musicApi = inject(MusicApiService);
  private sanitizer = inject(DomSanitizer);
  private authState = inject(AuthStateService);
  private platformId = inject(PLATFORM_ID);

  video = signal<MusicVideo | null>(null);
  related = signal<MusicVideoSummary[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  isLoggedIn = computed(() => !!this.authState.currentUser());

  embedUrl = computed<SafeResourceUrl | null>(() => {
    const v = this.video();
    if (!v) return null;
    const url = `https://www.youtube.com/embed/${v.youtubeId}?autoplay=0&rel=0&modestbranding=1`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';

    this.musicApi.getBySlug(slug).subscribe({
      next: (res) => {
        this.video.set(res.data);
        this.loading.set(false);

        // Fire play count
        this.musicApi.incrementPlay(res.data.id).subscribe();

        // Load related
        this.musicApi.getRelated(slug, 8).subscribe({
          next: (r) => this.related.set(r.data),
        });
      },
      error: () => {
        this.error.set('Video not found.');
        this.loading.set(false);
      },
    });
  }

  toggleLike(): void {
    const v = this.video();
    if (!v || !this.isLoggedIn()) return;

    this.musicApi.toggleLike(v.id).subscribe({
      next: (res) => {
        this.video.update((current) =>
          current ? { ...current, isLiked: res.data.liked, likeCount: res.data.likeCount } : null
        );
      },
    });
  }

  share(): void {
    if (isPlatformBrowser(this.platformId) && navigator.share) {
      const v = this.video();
      navigator.share({
        title: v?.title ?? 'Music Video',
        url: window.location.href,
      }).catch(() => {});
    } else if (isPlatformBrowser(this.platformId)) {
      navigator.clipboard.writeText(window.location.href).catch(() => {});
    }
  }

  formatCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }
}
