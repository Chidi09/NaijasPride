import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AnimeApiService } from '../../services/anime-api.service';

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
          </div>
        </div>

        @if (loading()) {
          <div class="py-12 text-center text-white/60">Loading anime...</div>
        } @else {
          <div class="mb-3 text-sm text-white/50">{{ total() }} results</div>
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
      </div>
    </section>
  `,
})
export class AnimeListComponent {
  private api = inject(AnimeApiService);

  q = '';
  loading = signal(false);
  anime = signal<any[]>([]);
  total = signal(0);

  constructor() {
    this.runSearch();
  }

  runSearch(): void {
    this.loading.set(true);
    this.api.search({ q: this.q?.trim() || undefined, perPage: 30, sort: 'TRENDING_DESC' }).subscribe({
      next: (res) => {
        this.anime.set(res?.data?.media || []);
        this.total.set(res?.data?.pageInfo?.total || (res?.data?.media || []).length);
        this.loading.set(false);
      },
      error: () => {
        this.anime.set([]);
        this.total.set(0);
        this.loading.set(false);
      },
    });
  }
}
