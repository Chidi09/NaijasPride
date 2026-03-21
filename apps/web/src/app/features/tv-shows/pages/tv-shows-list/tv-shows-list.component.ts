import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Genre, TvShowSearchParams, TvShowSummary } from '@naijaspride/types';
import { TvShowsQueryService } from '../../services/tv-shows-query.service';
import { TvShowCardComponent } from '../../components/tv-show-card/tv-show-card.component';
import { PwaService } from '../../../../core/services/pwa.service';
import { SymbolIconComponent } from '../../../../shared/components/symbol-icon/symbol-icon.component';
import { TvFocusGroupDirective } from '../../../../shared/directives/tv-focus-group.directive';

type TvSectionKey = 'trending' | 'latest-2026' | 'latest-2025' | 'highest-rated' | 'award-winning';

const TV_SECTION_LABELS: Record<TvSectionKey, string> = {
  trending: 'Trending',
  'latest-2026': 'Latest Releases (2026)',
  'latest-2025': 'Latest Releases (2025)',
  'highest-rated': 'Highest Rated',
  'award-winning': 'Award Winning',
};

@Component({
  selector: 'app-tv-shows-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TvShowCardComponent, SymbolIconComponent, TvFocusGroupDirective],
  template: `
    @if (useLivingRoomShell()) {
      <section appTvFocusGroup [tvAutoFocus]="true" class="min-h-screen w-full overflow-hidden bg-[#090609] text-[#f6efe8]">
        <main class="overflow-y-auto">
          <section class="relative min-h-[72vh] overflow-hidden border-b border-white/10">
            <div class="absolute inset-0 bg-cover bg-center" [style.background-image]="tvHeroBackground()"></div>
            <div class="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,6,9,0.96)_0%,rgba(9,6,9,0.72)_42%,rgba(9,6,9,0.16)_100%),linear-gradient(0deg,rgba(9,6,9,1)_0%,rgba(9,6,9,0.34)_46%,rgba(9,6,9,0)_100%)]"></div>

            <div class="relative z-10 flex min-h-[72vh] max-w-5xl flex-col justify-center px-8 py-12 md:px-12 xl:px-20">
              <div class="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.22em] text-white/55">
                <span class="rounded-full border border-[#d0a97a]/40 bg-[#d0a97a]/10 px-3 py-1 text-[#ecd8b7]">TV Series Collection</span>
                <span>{{ heroShowMeta() }}</span>
              </div>
              <h1 class="mt-5 text-5xl font-black leading-[0.95] text-white md:text-7xl">TV Shows</h1>
              <p class="mt-5 max-w-2xl text-base leading-8 text-white/68">Discover trending series, latest releases, and award-winning television from around the world in the new living-room layout.</p>

              <div class="mt-8 flex max-w-3xl flex-col gap-3 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
                <div class="flex flex-col gap-3 md:flex-row md:items-center">
                  <div class="flex flex-1 items-center gap-3 rounded-2xl bg-black/20 px-4 py-3">
                    <app-symbol-icon name="search" [size]="22"></app-symbol-icon>
                    <input
                      type="text"
                      class="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                      placeholder="Search shows, genres, or actors..."
                      [ngModel]="q()"
                      (ngModelChange)="onSearchInput($event || '')"
                      (focus)="searchFocused.set(true)"
                      (blur)="onSearchBlur()"
                    />
                  </div>
                  <div class="flex gap-3">
                    <select class="rounded-2xl border border-white/15 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none" [ngModel]="genre()" (ngModelChange)="onGenreChange($event)">
                      <option value="">All Genres</option>
                      @for (entry of genreOptions; track entry) {
                        <option [value]="entry">{{ entry }}</option>
                      }
                    </select>
                    <button type="button" (click)="resetFilters()" class="rounded-2xl border border-white/15 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/[0.08]">Reset</button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div class="space-y-12 px-8 pb-16 pt-10 md:px-12 xl:px-20">
            <section>
              <div class="mb-5 flex items-center justify-between">
                <h2 class="text-2xl font-bold text-white">Curated For You</h2>
                <div class="hidden md:flex gap-2">
                  @for (key of sectionKeys; track key) {
                    <button type="button" class="rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em]" [class]="activeSection() === key ? 'bg-[#d0a97a] text-[#12090d]' : 'bg-white/10 text-white/65 hover:bg-white/20'" (click)="applySection(key)">{{ sectionLabel(key) }}</button>
                  }
                </div>
              </div>

              @for (key of sectionKeys; track key) {
                <div class="mb-10">
                  <div class="mb-4 flex items-center justify-between">
                    <div>
                      <h3 class="text-lg font-semibold text-white">{{ sectionLabel(key) }}</h3>
                      <p class="text-xs uppercase tracking-[0.18em] text-white/45">{{ sectionQuery(key).data()?.data?.length || 0 }} shows</p>
                    </div>
                    <button type="button" (click)="applySection(key)" class="text-sm font-medium text-[#d0a97a] hover:text-[#ead9bf]">View all</button>
                  </div>
                  <div class="flex gap-5 overflow-x-auto pb-2">
                    @for (show of (sectionQuery(key).data()?.data || []).slice(0, 10); track show.id) {
                      <a [routerLink]="['/tv-shows', show.slug]" class="group block w-48 flex-shrink-0">
                        <div class="relative aspect-[2/3] overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/[0.04]">
                          <img [src]="show.posterUrl || show.thumbnailUrl || '/assets/images/poster-placeholder.svg'" [alt]="show.title" class="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
                        </div>
                        <p class="mt-3 line-clamp-2 text-sm font-semibold text-white">{{ show.title }}</p>
                        <p class="text-xs text-white/50">{{ show.seasonCount }} seasons • {{ show.episodeCount }} episodes</p>
                      </a>
                    }
                  </div>
                </div>
              }
            </section>

            <section id="tv-full-list" class="scroll-mt-24">
              <div class="mb-6 flex items-center justify-between">
                <div>
                  <h2 class="text-2xl font-bold text-white">{{ fullListTitle() }}</h2>
                  <p class="mt-1 text-sm text-white/45">{{ query.data()?.meta?.total || 0 }} shows found</p>
                </div>
              </div>

              @if (query.isLoading()) {
                <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
                  @for (i of [1,2,3,4,5,6,7,8,9,10]; track i) {
                    <div class="animate-pulse"><div class="aspect-[2/3] rounded-[1.6rem] bg-white/5"></div></div>
                  }
                </div>
              } @else {
                <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  @for (show of query.data()?.data || []; track show.id) {
                    <app-tv-show-card [show]="show"></app-tv-show-card>
                  }
                </div>
              }
            </section>
          </div>
        </main>
      </section>
    } @else {
    <section class="relative min-h-screen overflow-hidden bg-[#0a0a0a]">
      <!-- Animated Background -->
      <div class="pointer-events-none fixed inset-0 z-0">
        <div class="absolute inset-0 bg-gradient-to-br from-[#800020]/5 via-transparent to-[#1a0a0a]/50"></div>
        <div class="absolute -left-1/4 -top-1/4 h-[600px] w-[600px] rounded-full bg-[#800020]/10 blur-[120px] animate-pulse-slow"></div>
        <div class="absolute -bottom-1/4 -right-1/4 h-[800px] w-[800px] rounded-full bg-[#4a0015]/20 blur-[150px] animate-pulse-slow-delayed"></div>
        <!-- Grid Pattern -->
        <div class="absolute inset-0 opacity-[0.02]" style="background-image: linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px); background-size: 60px 60px;"></div>
      </div>

      <!-- Hero Section -->
      <div class="relative z-10 border-b border-white/5">
        <div class="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-16">
          <div class="animate-fade-in-up">
            <div class="mb-4 inline-flex items-center gap-2 rounded-full border border-[#800020]/30 bg-[#800020]/10 px-4 py-1.5">
              <span class="h-2 w-2 animate-pulse rounded-full bg-[#800020]"></span>
              <span class="text-xs font-medium tracking-wider text-[#800020] uppercase">TV Series Collection</span>
            </div>
            <h1 class="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-4xl font-bold text-transparent md:text-5xl lg:text-6xl">
              TV Shows
            </h1>
            <p class="mt-4 max-w-2xl text-lg text-white/50">
              Discover trending series, latest releases, and award-winning television from around the world.
            </p>
          </div>

          <!-- Search Bar -->
          <div class="animate-fade-in-up animation-delay-200 mt-8">
            <div class="relative mx-auto max-w-xl">
              <div class="group relative">
                <div class="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-[#800020]/50 to-[#a00030]/50 opacity-0 blur transition duration-500 group-focus-within:opacity-100"></div>
                <div class="relative flex items-center">
                  <svg class="pointer-events-none absolute left-4 h-5 w-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                  </svg>
                  <input
                    type="text"
                    class="w-full rounded-xl border border-white/10 bg-black/60 px-12 py-4 text-white backdrop-blur-sm transition-all duration-300 placeholder:text-white/30 focus:border-[#800020]/50 focus:bg-black/80 focus:outline-none focus:ring-2 focus:ring-[#800020]/20"
                    placeholder="Search shows, genres, or actors..."
                    [ngModel]="q()"
                    (ngModelChange)="onSearchInput($event || '')"
                    (focus)="searchFocused.set(true)"
                    (blur)="onSearchBlur()"
                  />
                  @if (q()) {
                    <button 
                      class="absolute right-4 rounded-full p-1 text-white/40 transition hover:bg-white/10 hover:text-white"
                      (click)="q.set(''); onSearchInput('')"
                    >
                      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  }
                </div>
              </div>

              @if (showSuggestions()) {
                <div class="animate-scale-in absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-[#0f0f0f]/95 shadow-2xl shadow-black/50 backdrop-blur-xl">
                  @if (suggestionLoading()) {
                    <div class="flex items-center gap-3 px-4 py-4">
                      <div class="h-4 w-4 animate-spin rounded-full border-2 border-[#800020] border-t-transparent"></div>
                      <span class="text-sm text-white/50">Searching...</span>
                    </div>
                  }

                  @if (!suggestionLoading() && suggestions().length === 0) {
                    <div class="px-4 py-4 text-sm text-white/50">No matches found</div>
                  }

                  @for (item of suggestions(); track item.id) {
                    <a
                      class="group flex items-center gap-3 border-b border-white/5 px-4 py-3 transition-all duration-200 last:border-0 hover:bg-white/5"
                      [routerLink]="['/tv-shows', item.slug]"
                      (click)="onSuggestionSelect()"
                    >
                      <div class="relative h-12 w-9 overflow-hidden rounded-md bg-white/5">
                        <img 
                          [src]="item.posterUrl || item.thumbnailUrl || '/assets/images/poster-placeholder.svg'" 
                          [alt]="item.title" 
                          class="h-full w-full object-cover transition duration-300 group-hover:scale-110"
                        />
                      </div>
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-medium text-white transition group-hover:text-[#800020]">{{ item.title }}</p>
                        <p class="truncate text-xs text-white/40">{{ item.year }} • {{ item.seasonCount }} seasons</p>
                      </div>
                      <svg class="h-4 w-4 text-white/20 transition group-hover:translate-x-1 group-hover:text-[#800020]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                      </svg>
                    </a>
                  }
                </div>
              }
            </div>
          </div>
        </div>
      </div>

      <!-- Filters Section -->
      <div class="animate-fade-in-up animation-delay-300 relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-sm">
        <div class="mx-auto max-w-7xl px-4 py-4 md:px-6">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <!-- Filter Pills -->
            <div class="flex flex-wrap items-center gap-2">
              <!-- Sort -->
              <div class="group relative">
                <select 
                  class="appearance-none rounded-full border border-white/10 bg-white/5 px-4 py-2 pr-10 text-sm text-white transition-all duration-300 hover:border-[#800020]/50 hover:bg-white/10 focus:border-[#800020] focus:outline-none"
                  [ngModel]="sortBy()" 
                  (ngModelChange)="onSortChange($event)"
                >
                  <option value="trending">🔥 Trending</option>
                  <option value="latest">🆕 Latest</option>
                  <option value="popular">⭐ Popular</option>
                  <option value="title">🔤 A-Z</option>
                </select>
                <svg class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
              </div>

              <!-- Genre -->
              <div class="group relative">
                <select 
                  class="appearance-none rounded-full border border-white/10 bg-white/5 px-4 py-2 pr-10 text-sm text-white transition-all duration-300 hover:border-[#800020]/50 hover:bg-white/10 focus:border-[#800020] focus:outline-none"
                  [ngModel]="genre()" 
                  (ngModelChange)="onGenreChange($event)"
                >
                  <option value="">🎭 All Genres</option>
                  @for (entry of genreOptions; track entry) {
                    <option [value]="entry">{{ entry }}</option>
                  }
                </select>
                <svg class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
              </div>

              <!-- Year -->
              <div class="relative">
                <input 
                  type="number" 
                  class="w-28 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition-all duration-300 placeholder:text-white/30 hover:border-[#800020]/50 focus:border-[#800020] focus:outline-none focus:ring-2 focus:ring-[#800020]/20"
                  [ngModel]="year()" 
                  (ngModelChange)="onYearChange($event)" 
                  placeholder="Year"
                />
              </div>

              <!-- Language -->
              <div class="relative">
                <input 
                  type="text" 
                  class="w-28 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition-all duration-300 placeholder:text-white/30 hover:border-[#800020]/50 focus:border-[#800020] focus:outline-none focus:ring-2 focus:ring-[#800020]/20"
                  [ngModel]="language()" 
                  (ngModelChange)="onLanguageChange($event || '')" 
                  placeholder="Lang"
                />
              </div>
            </div>

            <!-- Reset Button -->
            <button 
              class="group flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-all duration-300 hover:border-[#800020]/50 hover:bg-[#800020]/10 hover:text-white"
              (click)="resetFilters()"
            >
              <svg class="h-4 w-4 transition-transform duration-300 group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              Reset
            </button>
          </div>
        </div>
      </div>

      <!-- Curated Sections -->
      <div class="relative z-10 mx-auto max-w-7xl px-4 py-10 md:px-6">
        <div class="mb-8 flex items-center justify-between">
          <div>
            <h2 class="text-2xl font-bold text-white">Curated For You</h2>
            <p class="mt-1 text-sm text-white/40">Handpicked collections updated daily</p>
          </div>
          <div class="hidden md:flex items-center gap-2">
            @for (key of sectionKeys; track key) {
              <button
                class="group relative overflow-hidden rounded-full border px-4 py-2 text-xs font-medium transition-all duration-300"
                [class]="activeSection() === key 
                  ? 'border-[#800020] bg-[#800020] text-white shadow-lg shadow-[#800020]/25' 
                  : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30 hover:bg-white/10 hover:text-white'"
                (click)="applySection(key)"
              >
                <span class="relative z-10">{{ sectionLabel(key) }}</span>
                @if (activeSection() === key) {
                  <div class="absolute inset-0 bg-gradient-to-r from-[#800020] to-[#a00030]"></div>
                }
              </button>
            }
          </div>
        </div>

        <!-- Mobile Section Tabs -->
        <div class="mb-8 flex flex-wrap gap-2 md:hidden">
          @for (key of sectionKeys; track key) {
            <button
              class="rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-300"
              [class]="activeSection() === key 
                ? 'border-[#800020] bg-[#800020] text-white' 
                : 'border-white/10 bg-white/5 text-white/60'"
              (click)="applySection(key)"
            >
              {{ sectionLabel(key) }}
            </button>
          }
        </div>

        <!-- Section Cards Grid -->
        <div class="mb-16 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          @for (key of sectionKeys; track key) {
            <div class="animate-fade-in-up group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-1 transition-all duration-500 hover:border-[#800020]/30 hover:shadow-2xl hover:shadow-[#800020]/10">
              <div class="relative overflow-hidden rounded-xl bg-black/40 p-4">
                <!-- Section Header -->
                <div class="mb-4 flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#800020] to-[#600018] text-lg shadow-lg shadow-[#800020]/30">
                      @switch (key) {
                        @case ('trending') { 🔥 }
                        @case ('latest-2026') { 🆕 }
                        @case ('latest-2025') { 📺 }
                        @case ('highest-rated') { ⭐ }
                        @case ('award-winning') { 🏆 }
                      }
                    </div>
                    <div>
                      <h3 class="text-base font-semibold text-white">{{ sectionLabel(key) }}</h3>
                      <p class="text-xs text-white/40">{{ sectionQuery(key).data()?.data?.length || 0 }} shows</p>
                    </div>
                  </div>
                  <button 
                    class="group/btn flex items-center gap-1 rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60 transition-all duration-300 hover:bg-[#800020] hover:text-white"
                    (click)="applySection(key)"
                  >
                    View all
                    <svg class="h-3 w-3 transition-transform duration-300 group-hover/btn:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                    </svg>
                  </button>
                </div>

                <!-- Mini Cards Grid -->
                @if (sectionQuery(key).isLoading()) {
                  <div class="grid grid-cols-3 gap-2">
                    @for (i of [1,2,3,4,5,6]; track i) {
                      <div class="animate-pulse aspect-[2/3] rounded-lg bg-white/5"></div>
                    }
                  </div>
                } @else {
                  <div class="grid grid-cols-3 gap-2">
                    @for (show of (sectionQuery(key).data()?.data || []).slice(0, 6); track show.id) {
                      <a 
                        [routerLink]="['/tv-shows', show.slug]"
                        class="group/card relative aspect-[2/3] overflow-hidden rounded-lg transition-all duration-300 hover:z-10 hover:scale-105 hover:shadow-xl"
                      >
                        <img 
                          [src]="show.posterUrl || show.thumbnailUrl || '/assets/images/poster-placeholder.svg'"
                          [alt]="show.title"
                          class="h-full w-full object-cover transition duration-500 group-hover/card:scale-110"
                          loading="lazy"
                        />
                        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition duration-300 group-hover/card:opacity-100"></div>
                        <div class="absolute bottom-0 left-0 right-0 p-2 opacity-0 transition duration-300 group-hover/card:opacity-100">
                          <p class="line-clamp-2 text-[10px] font-medium text-white">{{ show.title }}</p>
                        </div>
                      </a>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>

        <!-- Full Catalog Section -->
        <div id="tv-full-list" class="scroll-mt-24">
          <div class="mb-6 flex items-center justify-between">
            <div>
              <h2 class="flex items-center gap-3 text-2xl font-bold text-white">
                {{ fullListTitle() }}
                @if (query.isFetching()) {
                  <span class="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-[#800020] border-t-transparent"></span>
                }
              </h2>
              <p class="mt-1 text-sm text-white/40">
                {{ query.data()?.meta?.total || 0 }} shows found
              </p>
            </div>
          </div>

          @if (query.isLoading()) {
            <!-- Skeleton Loading -->
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              @for (i of [1,2,3,4,5,6,7,8,9,10]; track i) {
                <div class="animate-pulse">
                  <div class="aspect-[2/3] rounded-xl bg-white/5"></div>
                  <div class="mt-3 h-4 w-3/4 rounded bg-white/5"></div>
                  <div class="mt-2 h-3 w-1/2 rounded bg-white/5"></div>
                </div>
              }
            </div>
          } @else if (query.isError()) {
            <div class="flex flex-col items-center justify-center py-20 text-center">
              <div class="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10">
                <svg class="h-10 w-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
              </div>
              <h3 class="text-lg font-semibold text-white">Failed to load TV shows</h3>
              <p class="mt-2 text-sm text-white/40">Please try again later</p>
              <button 
                class="mt-4 rounded-full bg-[#800020] px-6 py-2 text-sm font-medium text-white transition hover:bg-[#a00030]"
                (click)="query.refetch()"
              >
                Retry
              </button>
            </div>
          } @else {
            <!-- Results Grid -->
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              @for (show of query.data()?.data || []; track show.id) {
                <app-tv-show-card [show]="show"></app-tv-show-card>
              }
            </div>

            <!-- Pagination -->
            @if ((query.data()?.meta?.totalPages || 0) > 1) {
              <div class="mt-10 flex items-center justify-center gap-2">
                <button 
                  class="group flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-all duration-300 hover:border-[#800020]/50 hover:bg-[#800020]/10 disabled:cursor-not-allowed disabled:opacity-30"
                  [disabled]="!meta()?.hasPrev" 
                  (click)="goPrev()"
                >
                  <svg class="h-5 w-5 transition-transform duration-300 group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                  </svg>
                </button>

                @for (value of pageButtons(); track value) {
                  <button
                    class="relative h-10 w-10 rounded-full text-sm font-medium transition-all duration-300"
                    [class]="value === page() 
                      ? 'bg-[#800020] text-white shadow-lg shadow-[#800020]/30' 
                      : 'border border-white/10 bg-white/5 text-white/60 hover:border-white/30 hover:bg-white/10 hover:text-white'"
                    (click)="goToPage(value)"
                  >
                    {{ value }}
                  </button>
                }

                <button 
                  class="group flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-all duration-300 hover:border-[#800020]/50 hover:bg-[#800020]/10 disabled:cursor-not-allowed disabled:opacity-30"
                  [disabled]="!meta()?.hasNext" 
                  (click)="goNext()"
                >
                  <svg class="h-5 w-5 transition-transform duration-300 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                  </svg>
                </button>
              </div>
            }
          }
        </div>
      </div>

      <!-- Footer Spacing -->
      <div class="h-20"></div>
    </section>
    }
  `,
  styles: [`
    @keyframes fade-in-up {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes scale-in {
      from {
        opacity: 0;
        transform: scale(0.95);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    @keyframes pulse-slow {
      0%, 100% {
        opacity: 0.3;
        transform: scale(1);
      }
      50% {
        opacity: 0.5;
        transform: scale(1.05);
      }
    }

    .animate-fade-in-up {
      animation: fade-in-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      opacity: 0;
    }

    .animate-scale-in {
      animation: scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    .animate-pulse-slow {
      animation: pulse-slow 8s ease-in-out infinite;
    }

    .animate-pulse-slow-delayed {
      animation: pulse-slow 10s ease-in-out infinite;
      animation-delay: -4s;
    }

    .animation-delay-200 {
      animation-delay: 0.2s;
    }

    .animation-delay-300 {
      animation-delay: 0.3s;
    }

    .animation-delay-400 {
      animation-delay: 0.4s;
    }

    /* Scrollbar Styling */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    ::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb {
      background: rgba(128, 0, 32, 0.5);
      border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: rgba(128, 0, 32, 0.7);
    }
  `]
})
export class TvShowsListComponent implements OnInit {
  private tvQuery = inject(TvShowsQueryService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);
  protected pwaService = inject(PwaService);

  sectionKeys: TvSectionKey[] = ['trending', 'latest-2026', 'latest-2025', 'highest-rated', 'award-winning'];
  genreOptions = Object.values(Genre);

  q = signal('');
  sortBy = signal<'latest' | 'popular' | 'title' | 'trending'>('trending');
  genre = signal<Genre | ''>('');
  year = signal<number | ''>('');
  language = signal('');
  page = signal(1);
  activeSection = signal<TvSectionKey>('trending');

  suggestions = signal<TvShowSummary[]>([]);
  suggestionLoading = signal(false);
  searchFocused = signal(false);
  private suggestionTimer: ReturnType<typeof setTimeout> | null = null;
  private suggestionToken = 0;

  showSuggestions = computed(() => {
    return this.searchFocused() && this.q().trim().length >= 2 && (this.suggestionLoading() || this.suggestions().length > 0);
  });

  private fullParams = computed<TvShowSearchParams>(() => {
    const selectedYear = this.year();
    const selectedGenre = this.genre();
    return {
      q: this.q().trim() || undefined,
      page: this.page(),
      limit: 30,
      sortBy: this.sortBy(),
      year: typeof selectedYear === 'number' ? selectedYear : undefined,
      genre: selectedGenre ? [selectedGenre as Genre] : undefined,
      language: this.language().trim() || undefined,
    };
  });

  query = this.tvQuery.getShowsQuery(this.fullParams);

  trendingQuery = this.tvQuery.getShowsQuery(computed(() => ({ page: 1, limit: 9, sortBy: 'trending' as const })));
  latest2026Query = this.tvQuery.getShowsQuery(computed(() => ({ page: 1, limit: 9, sortBy: 'latest' as const, year: 2026 })));
  latest2025Query = this.tvQuery.getShowsQuery(computed(() => ({ page: 1, limit: 9, sortBy: 'latest' as const, year: 2025 })));
  highestRatedQuery = this.tvQuery.getShowsQuery(computed(() => ({ page: 1, limit: 9, sortBy: 'popular' as const })));
  awardWinningQuery = this.tvQuery.getShowsQuery(computed(() => ({ page: 1, limit: 9, sortBy: 'popular' as const, genre: [Genre.Drama] })));

  meta = computed(() => this.query.data()?.meta);
  pageButtons = computed(() => {
    const total = this.meta()?.totalPages || 1;
    const current = this.page();
    const start = Math.max(1, current - 2);
    const end = Math.min(total, start + 4);
    const values: number[] = [];
    for (let value = start; value <= end; value++) values.push(value);
    return values;
  });

  fullListTitle = computed(() => {
    const label = this.sectionLabel(this.activeSection());
    return `${label} - Full Catalog`;
  });

  featuredShow = computed(() => (this.trendingQuery.data()?.data || [])[0] || null);

  useLivingRoomShell(): boolean {
    if (this.pwaService.isTV()) return true;
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= 1200;
  }

  tvHeroBackground(): string {
    const show = this.featuredShow();
    const image = show?.thumbnailUrl || show?.posterUrl || '/assets/images/poster-placeholder.svg';
    return `url(${image})`;
  }

  heroShowMeta(): string {
    const show = this.featuredShow();
    if (!show) return 'Premium series discovery';
    return `${show.seasonCount} seasons • ${show.episodeCount} episodes`;
  }

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const section = params.get('section') as TvSectionKey | null;
    const q = (params.get('q') || '').trim();
    const pageRaw = Number.parseInt(params.get('page') || '1', 10);

    if (section && this.sectionKeys.includes(section)) {
      this.applySection(section, false);
    }

    if (q) this.q.set(q);
    if (Number.isFinite(pageRaw) && pageRaw > 0) this.page.set(pageRaw);

    const sortBy = params.get('sortBy');
    if (sortBy === 'latest' || sortBy === 'popular' || sortBy === 'title' || sortBy === 'trending') {
      this.sortBy.set(sortBy);
    }

    const yearRaw = Number.parseInt(params.get('year') || '', 10);
    if (Number.isFinite(yearRaw) && yearRaw >= 1900) this.year.set(yearRaw);

    const genreRaw = params.get('genre');
    if (genreRaw && this.genreOptions.includes(genreRaw as Genre)) {
      this.genre.set(genreRaw as Genre);
    }

    const language = (params.get('language') || '').trim();
    if (language) this.language.set(language);
  }

  sectionLabel(key: TvSectionKey): string {
    return TV_SECTION_LABELS[key];
  }

  sectionQuery(key: TvSectionKey) {
    if (key === 'latest-2026') return this.latest2026Query;
    if (key === 'latest-2025') return this.latest2025Query;
    if (key === 'highest-rated') return this.highestRatedQuery;
    if (key === 'award-winning') return this.awardWinningQuery;
    return this.trendingQuery;
  }

  applySection(section: TvSectionKey, writeUrl = true): void {
    this.activeSection.set(section);
    this.page.set(1);

    if (section === 'latest-2026') {
      this.sortBy.set('latest');
      this.year.set(2026);
      this.genre.set('');
    } else if (section === 'latest-2025') {
      this.sortBy.set('latest');
      this.year.set(2025);
      this.genre.set('');
    } else if (section === 'highest-rated') {
      this.sortBy.set('popular');
      this.year.set('');
      this.genre.set('');
    } else if (section === 'award-winning') {
      this.sortBy.set('popular');
      this.genre.set(Genre.Drama);
      this.year.set('');
    } else {
      this.sortBy.set('trending');
      this.genre.set('');
      this.year.set('');
    }

    if (writeUrl) {
      this.syncQueryParams();
      this.scrollToFullList();
    }
  }

  onSearchInput(value: string): void {
    this.q.set(value);
    this.page.set(1);
    this.syncQueryParams();

    const q = value.trim();
    if (this.suggestionTimer) clearTimeout(this.suggestionTimer);
    if (q.length < 2) {
      this.suggestions.set([]);
      this.suggestionLoading.set(false);
      return;
    }

    this.suggestionLoading.set(true);
    this.suggestionTimer = setTimeout(() => this.fetchSuggestions(q), 240);
  }

  onSearchBlur(): void {
    setTimeout(() => {
      this.searchFocused.set(false);
    }, 120);
  }

  onSuggestionSelect(): void {
    this.searchFocused.set(false);
    this.suggestions.set([]);
    this.suggestionLoading.set(false);
  }

  onSortChange(value: 'latest' | 'popular' | 'title' | 'trending'): void {
    this.sortBy.set(value);
    this.page.set(1);
    this.syncQueryParams();
  }

  onGenreChange(value: Genre | ''): void {
    this.genre.set(value);
    this.page.set(1);
    this.syncQueryParams();
  }

  onYearChange(value: string | number): void {
    const parsed = Number.parseInt(String(value || ''), 10);
    this.year.set(Number.isFinite(parsed) && parsed >= 1900 ? parsed : '');
    this.page.set(1);
    this.syncQueryParams();
  }

  onLanguageChange(value: string): void {
    this.language.set(value);
    this.page.set(1);
    this.syncQueryParams();
  }

  resetFilters(): void {
    this.q.set('');
    this.sortBy.set('trending');
    this.genre.set('');
    this.year.set('');
    this.language.set('');
    this.page.set(1);
    this.activeSection.set('trending');
    this.syncQueryParams();
  }

  goPrev(): void {
    if (!this.meta()?.hasPrev) return;
    this.page.update((value) => Math.max(1, value - 1));
    this.syncQueryParams();
    this.scrollToFullList();
  }

  goNext(): void {
    if (!this.meta()?.hasNext) return;
    this.page.update((value) => value + 1);
    this.syncQueryParams();
    this.scrollToFullList();
  }

  goToPage(value: number): void {
    if (value === this.page()) return;
    this.page.set(value);
    this.syncQueryParams();
    this.scrollToFullList();
  }

  private fetchSuggestions(q: string): void {
    const token = ++this.suggestionToken;
    this.http
      .get<{ success: boolean; data: TvShowSummary[] }>('/api/v1/tv-shows', {
        params: {
          q,
          page: '1',
          limit: '8',
          sortBy: 'trending',
        },
      })
      .subscribe({
        next: (response) => {
          if (token !== this.suggestionToken) return;
          this.suggestions.set(response.data || []);
          this.suggestionLoading.set(false);
        },
        error: () => {
          if (token !== this.suggestionToken) return;
          this.suggestions.set([]);
          this.suggestionLoading.set(false);
        },
      });
  }

  private syncQueryParams(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        section: this.activeSection(),
        q: this.q().trim() || null,
        page: this.page(),
        sortBy: this.sortBy(),
        genre: this.genre() || null,
        year: typeof this.year() === 'number' ? this.year() : null,
        language: this.language().trim() || null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private scrollToFullList(): void {
    if (typeof document === 'undefined') return;
    const target = document.getElementById('tv-full-list');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
