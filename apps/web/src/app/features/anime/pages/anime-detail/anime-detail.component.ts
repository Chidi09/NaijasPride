import { Component, computed, inject, signal } from "@angular/core";
import { CommonModule, Location } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
import {
  AnimeApiService,
  AnilistMedia,
  AnimeEpisode,
} from "../../services/anime-api.service";
import { StarIconComponent } from "../../../../shared/components/icons/star-icon.component";

@Component({
  selector: "app-anime-detail",
  standalone: true,
  imports: [CommonModule, RouterLink, StarIconComponent],
  template: `
    <section class="mx-auto w-full max-w-7xl px-4 py-6 pb-24 md:px-6">
      <button
        type="button"
        (click)="goBack()"
        class="text-sm text-white/60 hover:text-white"
      >
        ← Back
      </button>

      @if (loading()) {
        <div class="py-16 text-center text-white/60">Loading anime...</div>
      } @else if (!anime()) {
        <div class="py-16 text-center text-red-300">Anime not found.</div>
      } @else {
        <div
          class="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40"
        >
          <div
            class="pointer-events-none absolute inset-0 bg-cover bg-center opacity-20"
            [style.backgroundImage]="heroBackground()"
          ></div>
          <div
            class="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent"
          ></div>

          <div class="relative p-6 md:p-8">
            <div
              class="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr] md:items-end"
            >
              <div
                class="overflow-hidden rounded-xl border border-white/10 bg-black/20"
              >
                <img
                  [src]="poster()"
                  [alt]="title()"
                  class="h-full w-full object-cover"
                />
              </div>

              <div>
                <div class="mb-3 flex flex-wrap items-center gap-2 text-xs">
                  <span
                    class="rounded-full bg-white/10 px-2 py-1 text-white/80"
                    >{{ anime()!.seasonYear || "-" }}</span
                  >
                  <span class="rounded-full bg-white/10 px-2 py-1 text-white/80"
                    >{{ displayEpisodes().length }} episodes</span
                  >
                  @for (tag of (anime()!.genres || []).slice(0, 3); track tag) {
                    <span
                      class="rounded-full border border-white/20 px-2 py-1 text-white/80"
                      >{{ tag }}</span
                    >
                  }
                  @if (anime()!.averageScore) {
                    <span
                      class="rounded-full bg-[#800020]/20 border border-[#800020]/40 px-2 py-1 text-[#f87171] flex items-center gap-1"
                    >
                      <app-star-icon
                        [size]="12"
                        [filled]="true"
                        fillColor="#fbbf24"
                        strokeColor="#fbbf24"
                      />
                      {{ anime()!.averageScore / 10 | number: "1.1-1" }}</span
                    >
                  }
                  @if (anime()!.popularity) {
                    <span
                      class="rounded-full bg-white/10 px-2 py-1 text-white/80"
                      >{{ formatCount(anime()!.popularity) }} fans</span
                    >
                  }
                </div>

                <h1 class="text-3xl font-bold text-white md:text-4xl">
                  {{ title() }}
                </h1>
                <p
                  class="mt-3 max-w-3xl text-white/70"
                  [innerText]="cleanDescription()"
                ></p>

                @if (displayEpisodes().length > 0) {
                  <a
                    [routerLink]="[
                      '/anime',
                      anime()!.id,
                      'watch',
                      displayEpisodes()[0].number,
                    ]"
                    class="mt-4 inline-flex rounded-full bg-[#800020] px-5 py-2 text-sm font-semibold text-white hover:bg-[#9d1930]"
                  >
                    <span class="flex items-center gap-1">
                      <svg
                        class="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Watch Now
                    </span>
                  </a>
                }
              </div>
            </div>
          </div>

          <div class="relative z-10 border-t border-white/10 p-6 md:p-8">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-lg font-semibold text-white">Episodes</h2>
              <span class="text-xs text-white/55"
                >Provider: {{ provider }}</span
              >
            </div>

            @if (displayEpisodes().length === 0) {
              <div
                class="rounded-lg border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/60"
              >
                No episodes available for this title yet.
              </div>
            } @else {
              @if (!bridgeAvailable()) {
                <div
                  class="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                >
                  Streams are not resolved right now. Episode list is shown from
                  AniList metadata.
                </div>
              }
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                @for (episode of displayEpisodes(); track episode.id) {
                  <a
                    [routerLink]="[
                      '/anime',
                      anime()!.id,
                      'watch',
                      episode.number,
                    ]"
                    class="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-center text-sm text-white transition hover:border-[#800020]/50 hover:bg-black/35"
                  >
                    E{{ episode.number }}
                  </a>
                }
              </div>
            }
          </div>
        </div>
      }
    </section>
  `,
})
export class AnimeDetailComponent {
  private route = inject(ActivatedRoute);
  private api = inject(AnimeApiService);
  private location = inject(Location);

  goBack(): void {
    this.location.back();
  }

  provider = "auto";
  loading = signal(true);
  anime = signal<AnilistMedia | null>(null);
  episodes = signal<AnimeEpisode[]>([]);
  bridgeAvailable = signal(true);

  title = computed(
    () =>
      this.anime()?.title?.english ||
      this.anime()?.title?.romaji ||
      this.anime()?.title?.native ||
      "Anime",
  );
  poster = computed(
    () =>
      this.anime()?.coverImage?.extraLarge ||
      this.anime()?.coverImage?.large ||
      "/assets/images/poster-placeholder.svg",
  );
  heroBackground = computed(
    () => `url('${this.anime()?.bannerImage || this.poster()}')`,
  );
  cleanDescription = computed(() =>
    (this.anime()?.description || "No description available.").replace(
      /<[^>]+>/g,
      " ",
    ),
  );
  displayEpisodes = computed(() => {
    const fromBridge = this.episodes();
    if (fromBridge.length > 0) return fromBridge;
    
    let total = Math.max(0, Number(this.anime()?.episodes || 0));
    
    if (!total) {
      const nextAiring = this.anime()?.['nextAiringEpisode'] as any;
      if (nextAiring && nextAiring.episode) {
        total = Math.max(0, Number(nextAiring.episode) - 1);
      } else if (this.anime()?.status !== 'NOT_YET_RELEASED') {
        total = 1; // At least show Episode 1 if it has started airing
      }
    }
    
    if (!total) return [];
    
    return Array.from({ length: total }, (_, index) => ({
      id: `meta-${index + 1}`,
      number: index + 1,
    }));
  });

  formatCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get("id") || 0);
      if (!id) return;
      this.load(id);
    });
  }

  private load(id: number): void {
    this.loading.set(true);
    this.api.getAnime(id).subscribe({
      next: (res) => this.anime.set(res?.data || null),
      error: () => this.anime.set(null),
    });

    this.api.getEpisodes(id, this.provider).subscribe({
      next: (res) => {
        this.provider = res?.data?.provider || this.provider;
        this.bridgeAvailable.set(res?.data?.bridgeAvailable !== false);
        this.episodes.set(res?.data?.episodes || []);
        this.loading.set(false);
      },
      error: () => {
        this.bridgeAvailable.set(false);
        this.episodes.set([]);
        this.loading.set(false);
      },
    });
  }
}
