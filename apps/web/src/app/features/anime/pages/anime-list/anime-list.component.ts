import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AnimeApiService, AnimeRailConfig, AnimeRailKey } from '../../services/anime-api.service';

type RailState = {
  title: string;
  params: Record<string, unknown>;
  items: any[];
  loading: boolean;
  error: boolean;
};

@Component({
  selector: 'app-anime-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="relative min-h-screen overflow-hidden bg-[#0a0a0a]">
      <div class="pointer-events-none fixed inset-0 z-0">
        <div class="absolute inset-0 bg-gradient-to-br from-[#800020]/5 via-transparent to-[#1a0a0a]/50"></div>
        <div class="absolute -left-1/4 -top-1/4 h-[560px] w-[560px] rounded-full bg-[#800020]/10 blur-[120px]"></div>
        <div class="absolute -bottom-1/4 -right-1/4 h-[680px] w-[680px] rounded-full bg-[#4a0015]/20 blur-[150px]"></div>
      </div>

      <div class="relative z-10 mx-auto max-w-7xl px-4 py-10 md:px-6">
        <div class="mb-8 rounded-2xl border border-white/10 bg-black/30 p-6 backdrop-blur-sm">
          <div class="mb-3 inline-flex items-center gap-2 rounded-full border border-[#800020]/30 bg-[#800020]/10 px-3 py-1 text-xs text-[#d46]">
            Anime Discovery
          </div>
          <h1 class="text-3xl font-bold text-white md:text-5xl">Anime Library</h1>
          <p class="mt-2 text-white/50">Browse trending anime with an episode-first watch flow.</p>

          <div class="mt-5 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              [(ngModel)]="q"
              (keyup.enter)="runSearch()"
              placeholder="Search anime title..."
              class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-[#800020]/60 focus:outline-none"
            />
            <button
              type="button"
              (click)="runSearch()"
              class="rounded-xl bg-[#800020] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#a00030]"
            >
              Search
            </button>
            @if (mode() === 'search') {
              <button
                type="button"
                (click)="resetDiscovery()"
                class="rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/10"
              >
                Back to discovery
              </button>
            }
          </div>
        </div>

        @if (mode() === 'search') {
          @if (searchLoading()) {
            <div class="py-12 text-center text-white/60">Searching anime...</div>
          } @else {
            <div class="mb-3 text-sm text-white/50">Search results: {{ total() }}</div>
            @if (searchError()) {
              <div class="mb-6 rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">
                Search failed. Try again.
              </div>
            }
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              @for (item of anime(); track item.id) {
                <a [routerLink]="['/anime', item.id]" class="group overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] transition hover:border-[#800020]/50 hover:bg-white/[0.05]">
                  <img [src]="item.coverImage?.large || item.coverImage?.medium || '/assets/images/poster-placeholder.svg'" [alt]="item.title?.romaji" class="aspect-[2/3] w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
                  <div class="p-3">
                    <h3 class="line-clamp-2 text-sm font-semibold text-white">{{ item.title?.english || item.title?.romaji || item.title?.native }}</h3>
                    <p class="mt-1 text-xs text-white/50">{{ item.seasonYear || '-' }} • {{ item.episodes || '?' }} eps</p>
                  </div>
                </a>
              }
            </div>
          }
        } @else {
          <div class="space-y-8">
            @for (rail of railConfigs; track rail.key) {
              <section>
                <div class="mb-3 flex items-center justify-between">
                  <h2 class="text-lg font-semibold text-white">{{ rail.title }}</h2>
                  <button
                    type="button"
                    (click)="viewAll(rail.key)"
                    class="text-sm font-medium text-[#ff7aa3] hover:text-[#ff9fbe]"
                  >
                    View all
                  </button>
                </div>

                @if (dedupedRails()[rail.key].loading) {
                  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    @for (_ of skeletonItems; track $index) {
                      <div class="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                        <div class="aspect-[2/3] animate-pulse bg-white/10"></div>
                        <div class="space-y-2 p-3">
                          <div class="h-3 w-5/6 animate-pulse rounded bg-white/10"></div>
                          <div class="h-3 w-2/5 animate-pulse rounded bg-white/10"></div>
                        </div>
                      </div>
                    }
                  </div>
                } @else if (dedupedRails()[rail.key].error) {
                  <div class="flex items-center justify-between rounded-xl border border-red-500/25 bg-red-950/20 p-4 text-sm text-red-200">
                    <span>Could not load this section.</span>
                    <button
                      type="button"
                      (click)="reloadRail(rail.key)"
                      class="rounded-lg border border-red-400/30 bg-red-900/30 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-900/50"
                    >
                      Retry
                    </button>
                  </div>
                } @else {
                  <div class="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
                    @for (item of dedupedRails()[rail.key].items; track item.id) {
                      <a
                        [routerLink]="['/anime', item.id]"
                        class="group w-[150px] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] transition hover:border-[#800020]/50 hover:bg-white/[0.05] sm:w-[180px]"
                      >
                        <img
                          [src]="item.coverImage?.large || item.coverImage?.medium || '/assets/images/poster-placeholder.svg'"
                          [alt]="item.title?.romaji"
                          class="aspect-[2/3] w-full object-cover transition duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                        <div class="p-3">
                          <h3 class="line-clamp-2 text-sm font-semibold text-white">{{ item.title?.english || item.title?.romaji || item.title?.native }}</h3>
                          <p class="mt-1 text-xs text-white/50">{{ item.seasonYear || '-' }} • {{ item.episodes || '?' }} eps</p>
                        </div>
                      </a>
                    }
                  </div>
                }
              </section>
            }
          </div>
        }
      </div>
    </section>
  `,
})
export class AnimeListComponent {
  private api = inject(AnimeApiService);

  railConfigs = this.api.getDiscoveryRailConfigs(16);
  skeletonItems = Array.from({ length: 6 });

  q = '';
  mode = signal<'rails' | 'search'>('rails');
  searchLoading = signal(false);
  searchError = signal(false);
  anime = signal<any[]>([]);
  total = signal(0);
  rails = signal<Record<AnimeRailKey, RailState>>(this.initRails());

  dedupedRails = computed(() => {
    const source = this.rails();
    const seen = new Set<number>();
    const order: AnimeRailKey[] = ['trending', 'newSeason', 'popular', 'topRated', 'classics'];
    const next: Record<AnimeRailKey, RailState> = { ...source };

    for (const key of order) {
      const filtered = source[key].items.filter((item) => {
        if (!item?.id) return false;
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      next[key] = { ...source[key], items: filtered };
    }

    return next;
  });

  constructor() {
    this.loadDiscoveryRails();
  }

  private initRails(): Record<AnimeRailKey, RailState> {
    const data = {} as Record<AnimeRailKey, RailState>;
    for (const rail of this.railConfigs) {
      data[rail.key] = {
        title: rail.title,
        params: rail.params,
        items: [],
        loading: true,
        error: false,
      };
    }
    return data;
  }

  private setRailState(key: AnimeRailKey, patch: Partial<RailState>): void {
    this.rails.update((state) => ({
      ...state,
      [key]: {
        ...state[key],
        ...patch,
      },
    }));
  }

  loadDiscoveryRails(): void {
    for (const rail of this.railConfigs) {
      this.reloadRail(rail.key);
    }
  }

  reloadRail(key: AnimeRailKey): void {
    const rail = this.railConfigs.find((entry) => entry.key === key);
    if (!rail) return;

    this.setRailState(key, { loading: true, error: false });
    this.api.search(rail.params).subscribe({
      next: (res) => {
        this.setRailState(key, {
          items: res?.data?.media || [],
          loading: false,
          error: false,
        });
      },
      error: () => {
        this.setRailState(key, {
          items: [],
          loading: false,
          error: true,
        });
      },
    });
  }

  runSearch(): void {
    this.mode.set('search');
    this.searchLoading.set(true);
    this.searchError.set(false);
    this.api.search({ q: this.q?.trim() || undefined, perPage: 30, sort: 'TRENDING_DESC' }).subscribe({
      next: (res) => {
        this.anime.set(res?.data?.media || []);
        this.total.set(res?.data?.pageInfo?.total || (res?.data?.media || []).length);
        this.searchLoading.set(false);
      },
      error: () => {
        this.anime.set([]);
        this.total.set(0);
        this.searchLoading.set(false);
        this.searchError.set(true);
      },
    });
  }

  viewAll(key: AnimeRailKey): void {
    const rail = this.rails()[key];
    this.mode.set('search');
    this.searchLoading.set(true);
    this.searchError.set(false);
    this.api.search({ ...(rail.params as any), perPage: 30 }).subscribe({
      next: (res) => {
        this.anime.set(res?.data?.media || []);
        this.total.set(res?.data?.pageInfo?.total || (res?.data?.media || []).length);
        this.searchLoading.set(false);
      },
      error: () => {
        this.anime.set([]);
        this.total.set(0);
        this.searchLoading.set(false);
        this.searchError.set(true);
      },
    });
  }

  resetDiscovery(): void {
    this.mode.set('rails');
    this.searchError.set(false);
    this.searchLoading.set(false);
  }
}
