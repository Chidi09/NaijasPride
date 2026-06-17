import { Component, OnInit, OnDestroy, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router, RouterLink } from "@angular/router";
import {
  WatchApiService,
  WatchHistoryItem,
} from "../watch/services/watch-api.service";
import {
  BookSummary,
  MusicFeaturedSections,
  MovieSummary,
} from "@naijaspride/types";
import { normalizeYouTubeTitle } from "@naijaspride/utils";
import { AuthService } from "../../core/auth/auth.service";
import { ReaderStateService } from "../../core/services/reader-state.service";
import { PwaService } from "../../core/services/pwa.service";
import { forkJoin, of } from "rxjs";
import { catchError, map } from "rxjs/operators";
import { TvHomeExperienceComponent } from "./components/tv-home-experience.component";
import {
  HomeApiService,
  ContinueReadingItem,
  ContinueTvItem,
  ContinueAnimeItem,
  TrendingAnimeItem,
} from "./home-api.service";

@Component({
  selector: "app-home",
  standalone: true,
  imports: [CommonModule, RouterLink, TvHomeExperienceComponent],
  styles: [
    `
      :host {
        display: flex;
        height: 100vh;
        overflow: hidden;
        background: #0a0a0a;
        color: #f9f9f2;
        font-family: "Plus Jakarta Sans", system-ui, sans-serif;
      }

      /* ── Sidebar ─────────────────────────────────────────────── */
      .sidebar {
        width: 240px;
        flex-shrink: 0;
        background: #0f0f0f;
        border-right: 1px solid #1e1e1e;
        display: flex;
        flex-direction: column;
        height: 100vh;
        position: sticky;
        top: 0;
        overflow-y: auto;
      }
      @media (max-width: 1023px) {
        .sidebar {
          display: none;
        }
      }

      .nav-link {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 16px;
        border-radius: 10px;
        color: #a88a78;
        font-size: 14px;
        font-weight: 500;
        transition:
          background 0.18s,
          color 0.18s;
        text-decoration: none;
        margin: 2px 8px;
      }
      .nav-link:hover {
        background: #1a1a1a;
        color: #f9f9f2;
      }
      .nav-link.active {
        background: rgba(128, 0, 32, 0.18);
        color: #f9f9f2;
      }
      .nav-link.active svg {
        color: #800020;
      }
      .nav-link svg {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
      }

      /* ── Main scrollable area ──────────────────────────────────── */
      .main-scroll {
        flex: 1;
        overflow-y: auto;
        min-width: 0;
      }
      .main-scroll::-webkit-scrollbar {
        width: 5px;
      }
      .main-scroll::-webkit-scrollbar-track {
        background: transparent;
      }
      .main-scroll::-webkit-scrollbar-thumb {
        background: #2a0a12;
        border-radius: 4px;
      }
      .main-scroll::-webkit-scrollbar-thumb:hover {
        background: #800020;
      }

      /* ── Right panel ───────────────────────────────────────────── */
      .right-panel {
        width: 300px;
        flex-shrink: 0;
        height: 100vh;
        overflow-y: auto;
        border-left: 1px solid #1e1e1e;
        background: #0f0f0f;
        padding: 24px 16px;
        display: flex;
        flex-direction: column;
        gap: 24px;
      }
      @media (max-width: 1279px) {
        .right-panel {
          display: none;
        }
      }
      .right-panel::-webkit-scrollbar {
        width: 4px;
      }
      .right-panel::-webkit-scrollbar-thumb {
        background: #2a0a12;
        border-radius: 4px;
      }

      /* ── Poster card (portrait) ─────────────────────────────────── */
      .poster-card {
        display: block;
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid #1c1c1c;
        background: #111;
        transition:
          transform 280ms cubic-bezier(0.16, 1, 0.3, 1),
          box-shadow 280ms ease,
          border-color 280ms ease;
      }
      .poster-card:hover {
        transform: translateY(-4px) scale(1.02);
        border-color: rgba(128, 0, 32, 0.4);
        box-shadow:
          0 12px 28px rgba(0, 0, 0, 0.4),
          0 0 0 1px rgba(128, 0, 32, 0.15);
        z-index: 5;
        position: relative;
      }
      .poster-card .poster-img {
        transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .poster-card:hover .poster-img {
        transform: scale(1.08);
      }

      /* ── Landscape card (16:9 stream) ──────────────────────────── */
      .stream-card {
        display: block;
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid #1c1c1c;
        background: #111;
        transition:
          transform 280ms cubic-bezier(0.16, 1, 0.3, 1),
          box-shadow 280ms ease,
          border-color 280ms ease;
      }
      .stream-card:hover {
        transform: translateY(-3px);
        border-color: rgba(128, 0, 32, 0.35);
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
        z-index: 5;
        position: relative;
      }
      .stream-card .poster-img {
        transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .stream-card:hover .poster-img {
        transform: scale(1.05);
      }
      .stream-card:hover .stream-play {
        opacity: 1;
        transform: scale(1);
      }
      .stream-play {
        opacity: 0;
        transform: scale(0.8);
        transition:
          opacity 0.25s ease,
          transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }

      /* ── Continue watching card ─────────────────────────────────── */
      .cw-card {
        display: block;
        flex-shrink: 0;
        width: 120px;
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid #1c1c1c;
        background: #111;
        transition:
          transform 280ms cubic-bezier(0.16, 1, 0.3, 1),
          border-color 280ms ease;
      }
      .cw-card:hover {
        transform: translateY(-3px);
        border-color: rgba(128, 0, 32, 0.4);
      }
      .cw-card .poster-img {
        transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .cw-card:hover .poster-img {
        transform: scale(1.06);
      }
      .cw-card:hover .cw-play {
        opacity: 1;
      }
      .cw-play {
        opacity: 0;
        transition: opacity 0.22s ease;
      }

      /* ── Horizontal scroll ──────────────────────────────────────── */
      .hscroll {
        display: flex;
        gap: 12px;
        overflow-x: auto;
        padding-bottom: 4px;
      }
      .hscroll::-webkit-scrollbar {
        height: 4px;
      }
      .hscroll::-webkit-scrollbar-track {
        background: transparent;
      }
      .hscroll::-webkit-scrollbar-thumb {
        background: #2a0a12;
        border-radius: 4px;
      }

      /* ── Section header ────────────────────────────────────────── */
      .section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
      }
      .section-title {
        font-size: 15px;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: #f9f9f2;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .section-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        padding: 3px 8px;
        border-radius: 6px;
      }
      .section-link {
        font-size: 12px;
        font-weight: 600;
        color: #800020;
        text-decoration: none;
        transition: color 0.2s;
      }
      .section-link:hover {
        color: #b0003a;
      }

      /* ── Featured Movies grid (portrait 2:3) ────────────────────── */
      .movies-home-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(3, 1fr);
      }
      @media (min-width: 640px) {
        .movies-home-grid {
          grid-template-columns: repeat(4, 1fr);
        }
      }
      @media (min-width: 1024px) {
        .movies-home-grid {
          grid-template-columns: repeat(5, 1fr);
        }
      }

      /* ── YouTube / Stream-only grid (landscape 16:9) ─────────────── */
      .youtube-home-grid {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(1, 1fr);
      }
      @media (min-width: 480px) {
        .youtube-home-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      @media (min-width: 900px) {
        .youtube-home-grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      /* ── Activity items (right panel) ──────────────────────────── */
      .activity-card {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px;
        border-radius: 10px;
        border: 1px solid transparent;
        transition:
          background 0.2s,
          border-color 0.2s;
        cursor: pointer;
        text-decoration: none;
      }
      .activity-card:hover {
        background: #161616;
        border-color: #1e1e1e;
      }

      /* ── Right panel music row ─────────────────────────────────── */
      .rp-music-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 10px;
        transition: background 0.2s;
        text-decoration: none;
      }
      .rp-music-row:hover {
        background: #161616;
      }

      /* ── Mobile bottom padding (for PWA bottom pill) ─────────────── */
      @media (max-width: 1023px) {
        .mobile-content-area {
          padding-bottom: 88px;
        }
      }
    `,
  ],
  template: `
    @if (pwaService.isTV()) {
      <app-tv-home-experience
        [userName]="userName()"
        [membershipLabel]="membershipLabel()"
        [continueWatching]="continueWatching()"
        [downloadMovies]="downloadMovies()"
        [trendingAnime]="trendingAnime()"
        [streamMovies]="streamMovies()"
      ></app-tv-home-experience>
    } @else {
      <!-- ═══════════════════════════════════════════════════════════════ -->
      <!-- LEFT SIDEBAR                                                   -->
      <!-- ═══════════════════════════════════════════════════════════════ -->
      <aside class="sidebar">
        <!-- Logo -->
        <div
          class="flex items-center gap-3 px-5 py-5 border-b border-[#1e1e1e]"
        >
          <img
            src="assets/images/logo.svg"
            alt="NaijasPride"
            class="h-8 w-auto"
          />
          <span class="font-bold text-sm text-[#f9f9f2] tracking-wide"
            >NaijasPride</span
          >
        </div>

        <!-- Nav Links -->
        <nav class="flex-1 py-4">
          <p
            class="px-5 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#4a4a4a]"
          >
            Browse
          </p>

          <a routerLink="/home" class="nav-link active">
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              stroke-width="2"
            >
              <path
                d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <polyline
                points="9 22 9 12 15 12 15 22"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            Home
          </a>

          <a routerLink="/movies" class="nav-link">
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              stroke-width="2"
            >
              <rect
                x="2"
                y="2"
                width="20"
                height="20"
                rx="2.18"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <line x1="7" y1="2" x2="7" y2="22" stroke-linecap="round" />
              <line x1="17" y1="2" x2="17" y2="22" stroke-linecap="round" />
              <line x1="2" y1="12" x2="22" y2="12" stroke-linecap="round" />
            </svg>
            Movies
          </a>

          <a routerLink="/tv-shows" class="nav-link">
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              stroke-width="2"
            >
              <rect
                x="3"
                y="5"
                width="18"
                height="14"
                rx="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M8 3l4 2 4-2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path d="M9 12h6" stroke-linecap="round" />
            </svg>
            TV Shows
          </a>

          <a routerLink="/anime" class="nav-link">
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              stroke-width="2"
            >
              <path
                d="M4 6l8 12 8-12"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path d="M7 6h10" stroke-linecap="round" />
              <path d="M9 11h6" stroke-linecap="round" />
            </svg>
            Anime
          </a>

          <a routerLink="/books" class="nav-link">
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              stroke-width="2"
            >
              <path
                d="M4 19.5A2.5 2.5 0 016.5 17H20"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            Books
          </a>

          <a routerLink="/music" class="nav-link">
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              stroke-width="2"
            >
              <path
                d="M9 18V5l12-2v13"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <circle cx="6" cy="18" r="3" stroke-linecap="round" />
              <circle cx="18" cy="16" r="3" stroke-linecap="round" />
            </svg>
            Music
          </a>

          <a routerLink="/library" class="nav-link">
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              stroke-width="2"
            >
              <path
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            Library
          </a>

          <a routerLink="/search" class="nav-link">
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              stroke-width="2"
            >
              <circle
                cx="11"
                cy="11"
                r="8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <line
                x1="21"
                y1="21"
                x2="16.65"
                y2="16.65"
                stroke-linecap="round"
              />
            </svg>
            Search
          </a>

          <div class="my-4 mx-4 border-t border-[#1e1e1e]"></div>
          <p
            class="px-5 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#4a4a4a]"
          >
            Account
          </p>

          <a routerLink="/downloads" class="nav-link">
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              stroke-width="2"
            >
              <path
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            Downloads
          </a>

          <a routerLink="/profile" class="nav-link">
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              stroke-width="2"
            >
              <path
                d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <circle cx="12" cy="7" r="4" stroke-linecap="round" />
            </svg>
            Profile
          </a>
        </nav>

        <!-- User info at bottom -->
        <div class="px-4 py-4 border-t border-[#1e1e1e]">
          <div
            class="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-[#1a1a1a] transition cursor-pointer"
            routerLink="/profile"
          >
            <div
              class="h-8 w-8 rounded-full bg-gradient-to-br from-[#800020] to-[#5a0017] flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            >
              {{ userInitials() }}
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate text-[#f9f9f2]">
                {{ userName() }}
              </p>
              <p class="text-[11px] text-[#a88a78]">{{ membershipLabel() }}</p>
            </div>
            @if (isPremiumUser()) {
              <span
                class="rounded-full border border-[#f4d7b2]/40 bg-[#800020]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#f4d7b2]"
                >PRO</span
              >
            }
          </div>
        </div>
      </aside>

      <!-- ═══════════════════════════════════════════════════════════════ -->
      <!-- MAIN CONTENT                                                   -->
      <!-- ═══════════════════════════════════════════════════════════════ -->
      <div class="main-scroll">
        <!-- Top header bar (mobile: shows logo + hamburger; desktop: search + user) -->
        <header
          class="sticky top-0 z-20 flex items-center justify-between gap-4 px-4 py-3 border-b border-[#1e1e1e] bg-[#0a0a0a]/90 backdrop-blur-md lg:px-6 lg:py-4"
        >
          <!-- Mobile: logo -->
          <div class="flex items-center gap-2 lg:hidden">
            <img
              src="assets/images/logo.svg"
              alt="NaijasPride"
              class="h-6 w-auto"
            />
            <span class="font-bold text-sm">NaijasPride</span>
          </div>

          <!-- Desktop: search bar -->
          <div
            class="hidden lg:flex flex-1 max-w-md items-center gap-2 rounded-xl border border-[#232323] bg-[#181818] px-3 py-2 text-[#a88a78] transition focus-within:border-[#800020]/45 focus-within:bg-[#202020]"
          >
            <svg
              class="h-4 w-4 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              stroke-width="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              class="w-full bg-transparent text-sm text-[#f2ece8] outline-none placeholder:text-[#8e7668]"
              placeholder="Search movies, anime, books, music..."
              [value]="homeSearchQuery()"
              (input)="onHomeSearchInput($event)"
              (keydown.enter)="openGlobalSearch(homeSearchQuery())"
            />
            <button
              type="button"
              class="rounded-lg bg-[#800020] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#95002a]"
              (click)="openGlobalSearch(homeSearchQuery())"
            >
              Search
            </button>
          </div>

          <!-- Right actions -->
          <div class="flex items-center gap-2">
            <!-- Mobile search -->
            <button
              type="button"
              (click)="openGlobalSearch(homeSearchQuery())"
              class="lg:hidden h-9 w-9 rounded-xl bg-[#181818] flex items-center justify-center text-[#a88a78] hover:bg-[#242424] transition"
              aria-label="Open search"
            >
              <svg
                class="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                stroke-width="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            <!-- Library quick link -->
            <a
              routerLink="/downloads"
              class="h-9 w-9 rounded-xl bg-[#181818] flex items-center justify-center text-[#a88a78] hover:bg-[#242424] transition"
            >
              <svg
                class="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                stroke-width="2"
              >
                <path
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </a>
            <!-- User avatar -->
            <a
              routerLink="/profile"
              class="h-9 w-9 rounded-full bg-gradient-to-br from-[#800020] to-[#5a0017] flex items-center justify-center text-white text-xs font-bold"
            >
              {{ userInitials() }}
            </a>
          </div>
        </header>

        <div class="mobile-content-area px-4 py-6 space-y-10 lg:px-6">
          <!-- ── Hero Greeting ─────────────────────────────────────── -->
          <section
            class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#800020] via-[#69001b] to-[#3f0011] p-6 md:p-10"
          >
            <!-- Decorative circles -->
            <div
              class="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/5"
            ></div>
            <div
              class="absolute -right-4 bottom-4 h-24 w-24 rounded-full bg-white/5"
            ></div>

            <div class="relative max-w-3xl">
              <p
                class="text-xs font-semibold uppercase tracking-[0.2em] text-white/60"
              >
                {{ getGreeting() }}
              </p>
              <h1 class="mt-1 text-2xl font-bold text-white md:text-4xl">
                {{ userName() }}
              </h1>
              <p
                class="mt-4 text-base md:text-lg text-white/80 leading-relaxed font-light"
              >
                Welcome to the capital of African culture. Discover an curated
                collection of Nollywood blockbusters, chart-topping Afrobeats,
                and award-winning African literature. From the streets of Lagos
                to the global stage, NaijasPride brings you the best of Nigeria
                and beyond.
              </p>
              @if (isPremiumUser()) {
                <span
                  class="mt-4 inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white"
                  >Premium Member</span
                >
              }

              <!-- Quick action pills -->
              <div class="mt-8 flex flex-wrap gap-3">
                <a
                  routerLink="/movies"
                  class="flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-medium text-white backdrop-blur-sm hover:bg-white/20 transition"
                >
                  <svg
                    class="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    stroke-width="2"
                  >
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                  Watch Movies
                </a>
                <a
                  routerLink="/books"
                  class="flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-medium text-white backdrop-blur-sm hover:bg-white/20 transition"
                >
                  <svg
                    class="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    stroke-width="2"
                  >
                    <path
                      d="M4 19.5A2.5 2.5 0 016.5 17H20"
                      stroke-linecap="round"
                    />
                    <path
                      d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"
                      stroke-linecap="round"
                    />
                  </svg>
                  Read Books
                </a>
                <a
                  routerLink="/music"
                  class="flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-medium text-white backdrop-blur-sm hover:bg-white/20 transition"
                >
                  <svg
                    class="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    stroke-width="2"
                  >
                    <path d="M9 18V5l12-2v13" stroke-linecap="round" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                  Music
                </a>
                <a
                  routerLink="/anime"
                  class="flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-medium text-white backdrop-blur-sm hover:bg-white/20 transition"
                >
                  <svg
                    class="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    stroke-width="2"
                  >
                    <path
                      d="M4 6l8 12 8-12"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <path d="M7 6h10" stroke-linecap="round" />
                    <path d="M9 11h6" stroke-linecap="round" />
                  </svg>
                  Anime
                </a>
              </div>
            </div>
          </section>

          <!-- ── Continue Watching ─────────────────────────────────── -->
          @if (continueWatching().length > 0 || isLoadingContinue()) {
            <section>
              <div class="section-head">
                <h2 class="section-title">Continue Watching</h2>
                <a routerLink="/profile" class="section-link">View all</a>
              </div>
              @if (isLoadingContinue()) {
                <div class="hscroll">
                  @for (i of [1, 2, 3, 4, 5]; track i) {
                    <div class="flex-shrink-0" style="width:120px">
                      <div
                        class="aspect-[2/3] animate-pulse rounded-xl bg-[#181818]"
                      ></div>
                      <div
                        class="mt-2 h-3 w-3/4 animate-pulse rounded bg-[#151515]"
                      ></div>
                    </div>
                  }
                </div>
              } @else {
                <div class="hscroll">
                  @for (item of continueWatching(); track item.id) {
                    <a
                      [routerLink]="[
                        '/watch',
                        item.movie.slug || item.movie.id,
                      ]"
                      class="cw-card"
                    >
                      <div
                        class="relative aspect-[2/3] overflow-hidden bg-[#181818]"
                      >
                        <img
                          [src]="
                            item.movie.thumbnailUrl ||
                            item.movie.posterUrl ||
                            item.movie.coverUrl ||
                            ''
                          "
                          [alt]="item.movie.title"
                          class="poster-img h-full w-full object-cover"
                          referrerpolicy="no-referrer"
                        />
                        <!-- Gradient overlay with title -->
                        <div
                          class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2.5 pt-10"
                        >
                          <p
                            class="truncate text-[11px] font-semibold text-white leading-tight"
                          >
                            {{ normalizeTitle(item.movie.title) }}
                          </p>
                          <p class="text-[10px] text-white/50 mt-0.5">
                            {{ item.progressPercentage | number: "1.0-0" }}%
                            watched
                          </p>
                        </div>
                        <!-- Progress bar -->
                        <div
                          class="absolute inset-x-0 bottom-0 h-[3px] bg-black/60"
                        >
                          <div
                            class="h-full bg-[#800020]"
                            [style.width.%]="item.progressPercentage"
                          ></div>
                        </div>
                        <!-- Hover play -->
                        <div
                          class="cw-play absolute inset-0 bg-black/45 flex items-center justify-center"
                        >
                          <div
                            class="h-10 w-10 rounded-full bg-[#800020] flex items-center justify-center shadow-lg"
                          >
                            <svg
                              class="h-4 w-4 text-white ml-0.5"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </a>
                  }
                </div>
              }
            </section>
          }

          <!-- ── Continue Reading (Books) ─────────────────────────── -->
          @if (continueReading().length > 0) {
            <section>
              <div class="section-head">
                <h2 class="section-title">Continue Reading</h2>
                <a routerLink="/books" class="section-link">Library</a>
              </div>
              <div class="hscroll">
                @for (item of continueReading(); track item.bookId) {
                  <a
                    [routerLink]="['/books/novel', item.slug, 'read']"
                    class="cw-card"
                  >
                    <div
                      class="relative aspect-[2/3] overflow-hidden bg-[#181818]"
                    >
                      <img
                        [src]="getBookCover(item.slug, item.coverUrl)"
                        [alt]="item.title"
                        class="poster-img h-full w-full object-cover"
                        referrerpolicy="no-referrer"
                      />
                      <div
                        class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2.5 pt-10"
                      >
                        <p
                          class="truncate text-[11px] font-semibold text-white leading-tight"
                        >
                          {{ item.title }}
                        </p>
                        <p class="text-[10px] text-white/50 mt-0.5">
                          Page {{ item.page }}
                          @if (item.progressPercentage) {
                            · {{ item.progressPercentage }}%
                          }
                        </p>
                      </div>
                      @if (item.progressPercentage) {
                        <div
                          class="absolute inset-x-0 bottom-0 h-[3px] bg-black/60"
                        >
                          <div
                            class="h-full bg-[#800020]"
                            [style.width.%]="item.progressPercentage"
                          ></div>
                        </div>
                      }
                    </div>
                  </a>
                }
              </div>
            </section>
          }

          <!-- ── Continue Watching TV ───────────────────────────────── -->
          @if (continueTv().length > 0) {
            <section>
              <div class="section-head">
                <h2 class="section-title">Continue Watching TV</h2>
                <a routerLink="/tv-shows" class="section-link">All Shows</a>
              </div>
              <div class="hscroll">
                @for (item of continueTv(); track item.showId) {
                  <a
                    [routerLink]="['/tv-shows', item.slug, 'watch']"
                    [queryParams]="{
                      season: item.seasonNumber,
                      episode: item.episodeNumber,
                    }"
                    class="cw-card"
                  >
                    <div
                      class="relative aspect-[2/3] overflow-hidden bg-[#181818]"
                    >
                      <img
                        [src]="item.posterUrl || ''"
                        [alt]="item.title"
                        class="poster-img h-full w-full object-cover"
                        referrerpolicy="no-referrer"
                      />
                      <div
                        class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2.5 pt-10"
                      >
                        <p
                          class="truncate text-[11px] font-semibold text-white leading-tight"
                        >
                          {{ item.title }}
                        </p>
                        <p class="text-[10px] text-white/50 mt-0.5">
                          S{{ item.seasonNumber }}E{{ item.episodeNumber }} ·
                          {{ item.progressPercentage }}%
                        </p>
                      </div>
                      <div
                        class="absolute inset-x-0 bottom-0 h-[3px] bg-black/60"
                      >
                        <div
                          class="h-full bg-[#800020]"
                          [style.width.%]="item.progressPercentage"
                        ></div>
                      </div>
                      <div
                        class="cw-play absolute inset-0 bg-black/45 flex items-center justify-center"
                      >
                        <div
                          class="h-10 w-10 rounded-full bg-[#800020] flex items-center justify-center shadow-lg"
                        >
                          <svg
                            class="h-4 w-4 text-white ml-0.5"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </a>
                }
              </div>
            </section>
          }

          <!-- ── Continue Watching Anime ────────────────────────────── -->
          @if (continueAnime().length > 0) {
            <section>
              <div class="section-head">
                <h2 class="section-title">Continue Watching Anime</h2>
                <a routerLink="/anime" class="section-link">All Anime</a>
              </div>
              <div class="hscroll">
                @for (item of continueAnime(); track item.anilistId) {
                  <a
                    [routerLink]="[
                      '/anime',
                      item.anilistId,
                      'watch',
                      item.episodeNumber,
                    ]"
                    class="cw-card"
                  >
                    <div
                      class="relative aspect-[2/3] overflow-hidden bg-[#181818]"
                    >
                      <img
                        [src]="item.imageUrl || ''"
                        [alt]="item.title"
                        class="poster-img h-full w-full object-cover"
                        referrerpolicy="no-referrer"
                      />
                      <div
                        class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2.5 pt-10"
                      >
                        <p
                          class="truncate text-[11px] font-semibold text-white leading-tight"
                        >
                          {{ item.title }}
                        </p>
                        <p class="text-[10px] text-white/50 mt-0.5">
                          Ep {{ item.episodeNumber }} ·
                          {{ getAnimeProgressPct(item) }}%
                        </p>
                      </div>
                      <div
                        class="absolute inset-x-0 bottom-0 h-[3px] bg-black/60"
                      >
                        <div
                          class="h-full bg-[#800020]"
                          [style.width.%]="getAnimeProgressPct(item)"
                        ></div>
                      </div>
                      <div
                        class="cw-play absolute inset-0 bg-black/45 flex items-center justify-center"
                      >
                        <div
                          class="h-10 w-10 rounded-full bg-[#800020] flex items-center justify-center shadow-lg"
                        >
                          <svg
                            class="h-4 w-4 text-white ml-0.5"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </a>
                }
              </div>
            </section>
          }

          <!-- ── Trending Movies (portrait 2:3) ─────────────────────── -->
          @if (downloadMovies().length > 0 || isLoadingMovies()) {
            <section>
              <div class="section-head">
                <h2 class="section-title">
                  Trending Movies
                  <span
                    class="section-badge"
                    style="background:rgba(128,0,32,0.15);color:#c4506a;"
                  >
                    <svg
                      style="width:10px;height:10px"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M17.55 11.2c-.23-.3-.5-.56-.76-.82-.65-.6-1.4-1.03-2.03-1.66C13.3 7.26 13 5.86 13.52 4c-1.16.67-1.99 1.63-2.53 2.75-.56 1.12-.62 2.37-.37 3.5.06.25.03.5-.12.68-.15.17-.38.28-.64.28-.2-.01-.37-.1-.5-.24A3.4 3.4 0 019 9.57c-.77 1.5-.58 3.39.34 4.73.93 1.35 2.52 2.2 4.17 2.2 1.87 0 3.66-1.15 4.37-2.93.8-1.99.28-3.98-.83-5.37z"
                      />
                    </svg>
                    TMDB
                  </span>
                </h2>
                <a routerLink="/movies" class="section-link">See all</a>
              </div>
              @if (isLoadingMovies()) {
                <div class="movies-home-grid">
                  @for (i of [1, 2, 3, 4, 5]; track i) {
                    <div
                      style="border-radius:12px;overflow:hidden;border:1px solid #1c1c1c"
                    >
                      <div
                        class="aspect-[2/3] animate-pulse bg-[#151515]"
                      ></div>
                    </div>
                  }
                </div>
              } @else {
                <div class="movies-home-grid">
                  @for (movie of downloadMovies(); track movie.id) {
                    <a
                      [routerLink]="['/movies', movie.slug]"
                      class="poster-card"
                    >
                      <div
                        class="relative aspect-[2/3] overflow-hidden bg-[#181818]"
                      >
                        <img
                          [src]="movie.thumbnailUrl || movie.posterUrl || ''"
                          [alt]="movie.title"
                          class="poster-img h-full w-full object-cover"
                          referrerpolicy="no-referrer"
                        />
                        <!-- Always-visible gradient with title -->
                        <div
                          class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent p-2.5 pt-12"
                        >
                          <p
                            class="truncate text-[11px] font-semibold text-white leading-tight"
                          >
                            {{ normalizeTitle(movie.title) }}
                          </p>
                          <div class="flex items-center gap-1.5 mt-1">
                            <span class="text-[10px] text-white/50">{{
                              movie.year
                            }}</span>
                            @if (movie.genre?.[0]) {
                              <span class="text-[10px] text-white/30">·</span>
                              <span class="text-[10px] text-white/50">{{
                                movie.genre[0]
                              }}</span>
                            }
                          </div>
                        </div>
                        @if (getMovieProgress(movie.id); as progress) {
                          <div
                            class="absolute inset-x-0 bottom-0 h-[3px] bg-black/60"
                          >
                            <div
                              class="h-full bg-[#800020]"
                              [style.width.%]="progress"
                            ></div>
                          </div>
                        }
                      </div>
                    </a>
                  }
                </div>
              }
            </section>
          }

          <!-- ── Trending Anime (portrait 2:3) ─────────────────────── -->
          @if (trendingAnime().length > 0 || isLoadingAnime()) {
            <section>
              <div class="section-head">
                <h2 class="section-title">
                  Trending Anime
                  <span
                    class="section-badge"
                    style="background:rgba(59,130,246,0.12);color:#60a5fa;"
                  >
                    <svg
                      style="width:10px;height:10px"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M4 6l8 12 8-12H4z" />
                    </svg>
                    AniList
                  </span>
                </h2>
                <a routerLink="/anime" class="section-link">See all</a>
              </div>
              @if (isLoadingAnime()) {
                <div class="movies-home-grid">
                  @for (i of [1, 2, 3, 4, 5]; track i) {
                    <div
                      style="border-radius:12px;overflow:hidden;border:1px solid #1c1c1c"
                    >
                      <div
                        class="aspect-[2/3] animate-pulse bg-[#151515]"
                      ></div>
                    </div>
                  }
                </div>
              } @else {
                <div class="movies-home-grid">
                  @for (anime of trendingAnime(); track anime.id) {
                    <a [routerLink]="['/anime', anime.id]" class="poster-card">
                      <div
                        class="relative aspect-[2/3] overflow-hidden bg-[#181818]"
                      >
                        <img
                          [src]="
                            anime.coverImage?.large ||
                            anime.coverImage?.medium ||
                            '/assets/images/poster-placeholder.svg'
                          "
                          [alt]="
                            anime.title?.english ||
                            anime.title?.romaji ||
                            anime.title?.native
                          "
                          class="poster-img h-full w-full object-cover"
                          referrerpolicy="no-referrer"
                        />
                        <!-- Always-visible gradient with title -->
                        <div
                          class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent p-2.5 pt-12"
                        >
                          <p
                            class="truncate text-[11px] font-semibold text-white leading-tight"
                          >
                            {{
                              anime.title?.english ||
                                anime.title?.romaji ||
                                anime.title?.native
                            }}
                          </p>
                          <span
                            class="text-[10px] text-white/50 mt-0.5 block"
                            >{{ anime.seasonYear || "-" }}</span
                          >
                        </div>
                      </div>
                    </a>
                  }
                </div>
              }
            </section>
          }

          <!-- ── YouTube Cinema / Stream Movies (landscape 16:9) ──── -->
          @if (streamMovies().length > 0 || isLoadingStreamMovies()) {
            <section>
              <div class="section-head">
                <h2 class="section-title">
                  YouTube Cinema
                  <span
                    class="section-badge"
                    style="background:rgba(239,68,68,0.12);color:#f87171;"
                  >
                    <svg
                      style="width:10px;height:10px"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M23.5 6.19a3 3 0 00-2.11-2.12C19.55 3.5 12 3.5 12 3.5s-7.55 0-9.39.57A3 3 0 00.5 6.19 31.3 31.3 0 000 12a31.3 31.3 0 00.5 5.81 3 3 0 002.11 2.12C4.45 20.5 12 20.5 12 20.5s7.55 0 9.39-.57a3 3 0 002.11-2.12A31.3 31.3 0 0024 12a31.3 31.3 0 00-.5-5.81zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"
                      />
                    </svg>
                    Stream
                  </span>
                </h2>
                <a
                  routerLink="/movies"
                  [queryParams]="{ type: 'stream' }"
                  class="section-link"
                  >See all</a
                >
              </div>
              @if (isLoadingStreamMovies()) {
                <div class="youtube-home-grid">
                  @for (i of [1, 2, 3]; track i) {
                    <div
                      style="border-radius:12px;overflow:hidden;border:1px solid #1c1c1c"
                    >
                      <div
                        class="aspect-video animate-pulse bg-[#151515]"
                      ></div>
                    </div>
                  }
                </div>
              } @else {
                <div class="youtube-home-grid">
                  @for (movie of streamMovies(); track movie.id) {
                    <a
                      [routerLink]="['/movies', movie.slug]"
                      class="stream-card"
                    >
                      <div
                        class="relative aspect-video overflow-hidden bg-[#181818]"
                      >
                        <img
                          [src]="movie.thumbnailUrl || ''"
                          [alt]="movie.title"
                          class="poster-img h-full w-full object-cover"
                          referrerpolicy="no-referrer"
                        />
                        <!-- Play button on hover -->
                        <div
                          class="stream-play absolute inset-0 bg-black/40 flex items-center justify-center"
                        >
                          <div
                            class="h-12 w-12 rounded-full bg-[#800020]/90 flex items-center justify-center shadow-lg shadow-black/40"
                          >
                            <svg
                              class="h-5 w-5 text-white ml-1"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                      </div>
                      <!-- Title below card (always visible) -->
                      <div class="px-3 py-2.5">
                        <p
                          class="truncate text-[12px] font-semibold text-[#f9f9f2] leading-tight"
                        >
                          {{ normalizeTitle(movie.title) }}
                        </p>
                        <p class="text-[10px] text-[#a88a78] mt-0.5">
                          {{ movie.year }}
                        </p>
                      </div>
                    </a>
                  }
                </div>
              }
            </section>
          }

          <!-- ── Books + Music (side-by-side on lg) ───────────────── -->
          <div class="grid gap-8 lg:grid-cols-2">
            <!-- Trending Books -->
            <section>
              <div class="section-head">
                <h2 class="section-title">Trending Books</h2>
                <a routerLink="/books" class="section-link">Browse</a>
              </div>
              <div class="space-y-2">
                @for (book of books(); track book.id) {
                  <a
                    [routerLink]="['/books/novel', book.slug]"
                    class="flex items-center gap-3 rounded-xl border border-[#1e1e1e] bg-[#111] p-3 transition hover:border-[#800020]/50 hover:bg-[#141414]"
                  >
                    <div
                      class="relative h-16 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-[#1e1e1e]"
                    >
                      <img
                        [src]="getBookCover(book.slug, book.coverUrl)"
                        [alt]="book.title"
                        class="h-full w-full object-cover"
                        referrerpolicy="no-referrer"
                      />
                      @if (getBookProgress(book.slug); as progress) {
                        <div
                          class="absolute inset-x-0 bottom-0 h-1 bg-black/40"
                        >
                          <div
                            class="h-full bg-[#800020]"
                            [style.width.%]="getBookProgressWidth(progress)"
                          ></div>
                        </div>
                      }
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium text-[#f9f9f2]">
                        {{ book.title }}
                      </p>
                      <p class="truncate text-xs text-[#a88a78]">
                        {{ book.author || "Unknown author" }}
                      </p>
                      @if (getBookProgress(book.slug); as progress) {
                        <p class="mt-1 text-[10px] text-[#800020]">
                          {{ progress | number: "1.0-0" }}% read
                        </p>
                      }
                    </div>
                    <svg
                      class="h-4 w-4 flex-shrink-0 text-[#4a4a4a]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      stroke-width="2"
                    >
                      <path
                        d="M9 5l7 7-7 7"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </a>
                }
                @if (books().length === 0) {
                  @for (i of [1, 2, 3, 4]; track i) {
                    <div
                      class="flex items-center gap-3 rounded-xl bg-[#111] p-3"
                    >
                      <div
                        class="h-16 w-12 animate-pulse rounded-lg bg-[#1e1e1e] flex-shrink-0"
                      ></div>
                      <div class="flex-1 space-y-2">
                        <div
                          class="h-3 w-3/4 animate-pulse rounded bg-[#1e1e1e]"
                        ></div>
                        <div
                          class="h-3 w-1/2 animate-pulse rounded bg-[#1e1e1e]"
                        ></div>
                      </div>
                    </div>
                  }
                }
              </div>
            </section>

            <!-- Trending Music -->
            <section>
              <div class="section-head">
                <h2 class="section-title">Trending Music</h2>
                <a routerLink="/music" class="section-link">Explore</a>
              </div>
              <div class="space-y-1">
                @for (
                  video of musicTrending();
                  track video.id;
                  let idx = $index
                ) {
                  <a
                    [routerLink]="['/music', video.slug]"
                    class="flex items-center gap-3 rounded-xl p-2.5 transition hover:bg-[#151515] group"
                  >
                    <!-- Track number -->
                    <span
                      class="w-5 text-center text-xs font-medium text-[#4a4a4a] group-hover:hidden"
                      >{{ idx + 1 }}</span
                    >
                    <div
                      class="w-5 hidden group-hover:flex items-center justify-center"
                    >
                      <svg
                        class="h-3.5 w-3.5 text-[#800020]"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                    <!-- Thumbnail -->
                    <div
                      class="relative h-12 w-16 flex-shrink-0 overflow-hidden rounded-lg"
                    >
                      <img
                        [src]="video.thumbnailUrl || ''"
                        [alt]="video.title"
                        class="h-full w-full object-cover"
                        referrerpolicy="no-referrer"
                      />
                      <div class="absolute inset-0 bg-black/20"></div>
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium text-[#f9f9f2]">
                        {{ video.title }}
                      </p>
                      <p class="truncate text-xs text-[#a88a78]">
                        {{ video.artist }}
                      </p>
                    </div>
                  </a>
                }
                @if (musicTrending().length === 0) {
                  @for (i of [1, 2, 3, 4, 5]; track i) {
                    <div class="flex items-center gap-3 rounded-xl p-2.5">
                      <div
                        class="w-5 h-3 animate-pulse rounded bg-[#1e1e1e]"
                      ></div>
                      <div
                        class="h-12 w-16 animate-pulse rounded-lg bg-[#1e1e1e] flex-shrink-0"
                      ></div>
                      <div class="flex-1 space-y-2">
                        <div
                          class="h-3 w-3/4 animate-pulse rounded bg-[#1e1e1e]"
                        ></div>
                        <div
                          class="h-3 w-1/2 animate-pulse rounded bg-[#1e1e1e]"
                        ></div>
                      </div>
                    </div>
                  }
                }
              </div>
            </section>
          </div>

          <!-- ── Your Library shortcuts ────────────────────────────── -->
          <section>
            <h2 class="section-title" style="margin-bottom:14px">
              Your Library
            </h2>
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <a
                routerLink="/library"
                [queryParams]="{ tab: 'watchlist' }"
                class="group flex items-center gap-3 rounded-xl border border-[#1e1e1e] bg-[#111] px-4 py-4 transition hover:border-[#800020]/50 hover:bg-[#151515]"
              >
                <div
                  class="h-9 w-9 flex-shrink-0 rounded-xl bg-[#800020]/15 flex items-center justify-center group-hover:bg-[#800020]/25 transition"
                >
                  <svg
                    class="h-5 w-5 text-[#800020]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    stroke-width="1.8"
                  >
                    <path
                      d="M5 3l14 9-14 9V3z"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </div>
                <span class="text-sm font-medium text-[#f9f9f2]"
                  >Watchlist</span
                >
              </a>
              <a
                routerLink="/library"
                [queryParams]="{ tab: 'continue' }"
                class="group flex items-center gap-3 rounded-xl border border-[#1e1e1e] bg-[#111] px-4 py-4 transition hover:border-[#800020]/50 hover:bg-[#151515]"
              >
                <div
                  class="h-9 w-9 flex-shrink-0 rounded-xl bg-[#800020]/15 flex items-center justify-center group-hover:bg-[#800020]/25 transition"
                >
                  <svg
                    class="h-5 w-5 text-[#800020]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    stroke-width="1.8"
                  >
                    <path
                      d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </div>
                <span class="text-sm font-medium text-[#f9f9f2]"
                  >Favorites</span
                >
              </a>
              <a
                routerLink="/downloads"
                class="group flex items-center gap-3 rounded-xl border border-[#1e1e1e] bg-[#111] px-4 py-4 transition hover:border-[#800020]/50 hover:bg-[#151515]"
              >
                <div
                  class="h-9 w-9 flex-shrink-0 rounded-xl bg-[#800020]/15 flex items-center justify-center group-hover:bg-[#800020]/25 transition"
                >
                  <svg
                    class="h-5 w-5 text-[#800020]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    stroke-width="1.8"
                  >
                    <path
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </div>
                <span class="text-sm font-medium text-[#f9f9f2]"
                  >Downloads</span
                >
              </a>
              <a
                routerLink="/books/light-novels"
                class="group flex items-center gap-3 rounded-xl border border-[#1e1e1e] bg-[#111] px-4 py-4 transition hover:border-[#800020]/50 hover:bg-[#151515]"
              >
                <div
                  class="h-9 w-9 flex-shrink-0 rounded-xl bg-[#800020]/15 flex items-center justify-center group-hover:bg-[#800020]/25 transition"
                >
                  <svg
                    class="h-5 w-5 text-[#800020]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    stroke-width="1.8"
                  >
                    <path
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </div>
                <span class="text-sm font-medium text-[#f9f9f2]">Reading</span>
              </a>
            </div>
          </section>
        </div>
        <!-- end mobile-content-area -->
      </div>
      <!-- end main-scroll -->

      <!-- ═══════════════════════════════════════════════════════════════ -->
      <!-- RIGHT PANEL (xl only)                                          -->
      <!-- ═══════════════════════════════════════════════════════════════ -->
      <aside class="right-panel">
        <!-- Recent Activity -->
        <div>
          <h3
            class="text-[10px] font-bold uppercase tracking-[0.16em] text-[#555] mb-2"
          >
            Recent Activity
          </h3>
          @if (continueWatching().length > 0) {
            <div class="flex flex-col gap-1">
              @for (item of continueWatching().slice(0, 5); track item.id) {
                <a
                  [routerLink]="['/watch', item.movie.slug || item.movie.id]"
                  class="activity-card"
                >
                  <div
                    class="relative h-12 w-9 flex-shrink-0 overflow-hidden rounded-lg border border-[#222]"
                  >
                    <img
                      [src]="
                        item.movie.thumbnailUrl ||
                        item.movie.posterUrl ||
                        item.movie.coverUrl ||
                        ''
                      "
                      [alt]="item.movie.title"
                      class="h-full w-full object-cover"
                      referrerpolicy="no-referrer"
                    />
                  </div>
                  <div class="min-w-0 flex-1">
                    <p
                      class="truncate text-[11px] font-semibold text-[#f9f9f2]"
                    >
                      {{ item.movie.title }}
                    </p>
                    <div
                      class="mt-1.5 h-[3px] rounded-full bg-[#1e1e1e] overflow-hidden"
                    >
                      <div
                        class="h-full rounded-full bg-[#800020]"
                        [style.width.%]="item.progressPercentage"
                      ></div>
                    </div>
                    <p class="mt-0.5 text-[9px] text-[#a88a78]">
                      {{ item.progressPercentage | number: "1.0-0" }}% watched
                    </p>
                  </div>
                </a>
              }
            </div>
          } @else if (isLoadingContinue()) {
            <div class="flex flex-col gap-1">
              @for (i of [1, 2, 3]; track i) {
                <div class="activity-card">
                  <div
                    class="h-12 w-9 animate-pulse rounded-lg bg-[#1e1e1e] flex-shrink-0"
                  ></div>
                  <div class="flex-1 space-y-1.5">
                    <div
                      class="h-2.5 w-3/4 animate-pulse rounded bg-[#1e1e1e]"
                    ></div>
                    <div
                      class="h-[3px] w-full animate-pulse rounded-full bg-[#1e1e1e]"
                    ></div>
                  </div>
                </div>
              }
            </div>
          } @else {
            <p class="text-xs text-[#4a4a4a] italic px-2">
              No recent activity yet
            </p>
          }
        </div>

        <!-- Divider -->
        <div class="border-t border-[#1e1e1e]"></div>

        <!-- Trending Music (right panel list) -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <h3
              class="text-[10px] font-bold uppercase tracking-[0.16em] text-[#555]"
            >
              Top Music
            </h3>
            <a routerLink="/music" class="section-link" style="font-size:10px"
              >All</a
            >
          </div>
          <div class="flex flex-col gap-0.5">
            @for (
              video of musicTrending().slice(0, 4);
              track video.id;
              let idx = $index
            ) {
              <a [routerLink]="['/music', video.slug]" class="rp-music-row">
                <span
                  class="w-4 text-center text-[10px] font-bold text-[#800020]"
                  >{{ idx + 1 }}</span
                >
                <div
                  class="h-10 w-14 flex-shrink-0 overflow-hidden rounded-lg border border-[#222]"
                >
                  <img
                    [src]="video.thumbnailUrl || ''"
                    [alt]="video.title"
                    class="h-full w-full object-cover"
                    referrerpolicy="no-referrer"
                  />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-[11px] font-semibold text-[#f9f9f2]">
                    {{ video.title }}
                  </p>
                  <p class="truncate text-[10px] text-[#a88a78]">
                    {{ video.artist }}
                  </p>
                </div>
              </a>
            }
          </div>
        </div>

        <!-- Divider -->
        <div class="border-t border-[#1e1e1e]"></div>

        <!-- Quick nav links -->
        <div>
          <h3
            class="text-[10px] font-bold uppercase tracking-[0.16em] text-[#555] mb-3"
          >
            Quick Links
          </h3>
          <div class="grid grid-cols-2 gap-2">
            <a
              routerLink="/movies"
              class="rounded-xl border border-[#1e1e1e] bg-[#111] px-3 py-3 text-center hover:border-[#800020]/40 transition"
            >
              <svg
                class="mx-auto mb-1.5 h-4 w-4 text-[#800020]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                stroke-width="2"
              >
                <rect x="2" y="2" width="20" height="20" rx="2.18" />
                <line x1="7" y1="2" x2="7" y2="22" />
                <line x1="17" y1="2" x2="17" y2="22" />
                <line x1="2" y1="12" x2="22" y2="12" />
              </svg>
              <p class="text-[11px] text-[#f9f9f2]">Movies</p>
            </a>
            <a
              routerLink="/anime"
              class="rounded-xl border border-[#1e1e1e] bg-[#111] px-3 py-3 text-center hover:border-[#800020]/40 transition"
            >
              <svg
                class="mx-auto mb-1.5 h-4 w-4 text-[#800020]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                stroke-width="2"
              >
                <path d="M4 6l8 12 8-12" />
                <path d="M7 6h10" />
                <path d="M9 11h6" />
              </svg>
              <p class="text-[11px] text-[#f9f9f2]">Anime</p>
            </a>
            <a
              routerLink="/books"
              class="rounded-xl border border-[#1e1e1e] bg-[#111] px-3 py-3 text-center hover:border-[#800020]/40 transition"
            >
              <svg
                class="mx-auto mb-1.5 h-4 w-4 text-[#800020]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                stroke-width="2"
              >
                <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                <path
                  d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"
                />
              </svg>
              <p class="text-[11px] text-[#f9f9f2]">Books</p>
            </a>
            <a
              routerLink="/library"
              class="rounded-xl border border-[#1e1e1e] bg-[#111] px-3 py-3 text-center hover:border-[#800020]/40 transition"
            >
              <svg
                class="mx-auto mb-1.5 h-4 w-4 text-[#800020]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                stroke-width="2"
              >
                <path
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
              <p class="text-[11px] text-[#f9f9f2]">Library</p>
            </a>
            <a
              routerLink="/search"
              class="rounded-xl border border-[#1e1e1e] bg-[#111] px-3 py-3 text-center hover:border-[#800020]/40 transition"
            >
              <svg
                class="mx-auto mb-1.5 h-4 w-4 text-[#800020]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                stroke-width="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <p class="text-[11px] text-[#f9f9f2]">Search</p>
            </a>
          </div>
        </div>
      </aside>
    }
  `,
})
export class HomeComponent implements OnInit, OnDestroy {
  normalizeTitle = normalizeYouTubeTitle;

  private homeApi = inject(HomeApiService);
  private router = inject(Router);
  private watchApi = inject(WatchApiService);
  private authService = inject(AuthService);
  private readerState = inject(ReaderStateService);
  protected pwaService = inject(PwaService);

  isLoadingContinue = signal(true);
  isLoadingMovies = signal(true);
  isLoadingAnime = signal(true);
  isLoadingStreamMovies = signal(true);
  continueWatching = signal<WatchHistoryItem[]>([]);
  /** Download movies — portrait 2:3 cards */
  downloadMovies = signal<MovieSummary[]>([]);
  /** Stream-only / YouTube movies — landscape 16:9 cards */
  streamMovies = signal<MovieSummary[]>([]);
  trendingAnime = signal<TrendingAnimeItem[]>([]);
  books = signal<BookSummary[]>([]);
  musicTrending = signal<MusicFeaturedSections["trending"]>([]);
  movieProgressById = signal<Record<string, number>>({});
  bookProgressBySlug = signal<Record<string, number>>({});
  continueReading = signal<ContinueReadingItem[]>([]);
  continueTv = signal<ContinueTvItem[]>([]);
  continueAnime = signal<ContinueAnimeItem[]>([]);

  userName = signal("Guest");
  userInitials = signal("G");
  membershipLabel = signal("Member");
  isPremiumUser = signal(false);
  homeSearchQuery = signal("");

  ngOnInit(): void {
    // Activate home layout — hides shell navbar/bottom-nav
    this.readerState.enterHome();

    // Set user info
    const user = this.authService.currentUser();
    if (user) {
      this.userName.set(user.name || user.email?.split("@")[0] || "Guest");
      this.userInitials.set(this.userName().charAt(0).toUpperCase());
      const isPremium = !!user.isPremium || user.subStatus === "active";
      this.isPremiumUser.set(isPremium);
      this.membershipLabel.set(isPremium ? "Premium Member" : "Member");
    }

    // Continue watching
    this.watchApi.getWatchHistory({ page: 1, limit: 10 }).subscribe({
      next: (res) => {
        const progressMap: Record<string, number> = {};
        for (const item of res.data || []) {
          if (!item.movie?.id || item.progressPercentage <= 0) continue;
          progressMap[item.movie.id] = Math.max(
            0,
            Math.min(100, item.progressPercentage),
          );
        }
        this.movieProgressById.set(progressMap);

        const rows = (res.data || []).filter(
          (item) => item.progressPercentage > 0 && item.progressPercentage < 95,
        );
        this.continueWatching.set(rows);
        this.isLoadingContinue.set(false);
      },
      error: () => this.isLoadingContinue.set(false),
    });

    // Download movies (portrait cards — isStreamOnly=false)
    this.homeApi.getDownloadMovies().subscribe({
      next: (res) => {
        this.downloadMovies.set((res.data || []).slice(0, 10));
        this.isLoadingMovies.set(false);
      },
      error: () => this.isLoadingMovies.set(false),
    });

    // Trending Anime
    this.homeApi.getTrendingAnime().subscribe({
      next: (res) => {
        this.trendingAnime.set((res.data?.media || []).slice(0, 10));
        this.isLoadingAnime.set(false);
      },
      error: () => this.isLoadingAnime.set(false),
    });

    // Stream-only / YouTube movies (landscape 16:9 cards — isStreamOnly=true)
    this.homeApi.getStreamMovies().subscribe({
      next: (res) => {
        this.streamMovies.set((res.data || []).slice(0, 6));
        this.isLoadingStreamMovies.set(false);
      },
      error: () => this.isLoadingStreamMovies.set(false),
    });

    // Books
    this.homeApi.getFeaturedBooks().subscribe({
      next: (res) => {
        const nextBooks = (res.data || []).slice(0, 4);
        this.books.set(nextBooks);
        this.loadBookProgress(nextBooks.map((book) => book.slug));
      },
      error: () => {
        /* no dedicated loading signal */
      },
    });

    // Music
    this.homeApi.getMusicFeatured().subscribe({
      next: (res) =>
        this.musicTrending.set((res.data?.trending || []).slice(0, 5)),
      error: () => {
        /* no dedicated loading signal */
      },
    });

    // Continue Reading (Books)
    this.homeApi.getContinueReading().subscribe({
      next: (res) => {
        const rows = (res.data || []).filter((item) => item.page > 0);
        this.continueReading.set(rows);
      },
      error: () => {
        /* no dedicated loading signal */
      },
    });

    // Continue Watching TV
    this.homeApi.getContinueTv().subscribe({
      next: (res) => {
        const rows = (res.data || []).filter(
          (item) => item.progressPercentage > 0 && item.progressPercentage < 95,
        );
        this.continueTv.set(rows);
      },
      error: () => {
        /* no dedicated loading signal */
      },
    });

    // Continue Watching Anime
    this.homeApi.getContinueAnime().subscribe({
      next: (res) => {
        const rows = (res.data || []).filter((item) => item.progress > 0);
        this.continueAnime.set(rows);
      },
      error: () => {
        /* no dedicated loading signal */
      },
    });
  }

  ngOnDestroy(): void {
    // Restore shell navbar when leaving home
    this.readerState.exitHome();
  }

  getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }

  onHomeSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value || "";
    this.homeSearchQuery.set(value);
  }

  openGlobalSearch(rawQuery?: string): void {
    const q = (rawQuery || "").trim();
    void this.router.navigate(["/search"], {
      queryParams: q.length >= 2 ? { q } : {},
    });
  }

  getMovieProgress(movieId?: string): number | null {
    if (!movieId) return null;
    const value = this.movieProgressById()[movieId];
    if (typeof value !== "number" || Number.isNaN(value) || value <= 0)
      return null;
    return Math.max(0, Math.min(100, value));
  }

  getBookProgress(slug?: string): number | null {
    if (!slug) return null;
    const value = this.bookProgressBySlug()[slug];
    if (typeof value !== "number" || Number.isNaN(value) || value <= 0)
      return null;
    return Math.max(0, Math.min(100, value));
  }

  getBookProgressWidth(value: number): number {
    return Math.max(4, Math.min(100, value));
  }

  getBookCover(slug?: string, coverUrl?: string | null): string {
    if (coverUrl && coverUrl.trim().length > 0) return coverUrl;
    if (!slug) return "";
    return `/api/v1/books/cover/${encodeURIComponent(slug)}`;
  }

  getAnimeProgressPct(item: ContinueAnimeItem): number {
    if (!item.duration || item.duration <= 0) return 0;
    return Math.min(100, Math.round((item.progress / item.duration) * 100));
  }

  private loadBookProgress(slugs: string[]) {
    const uniqueSlugs = Array.from(new Set(slugs.filter(Boolean))).slice(0, 10);
    if (uniqueSlugs.length === 0) return;

    const requests = uniqueSlugs.map((slug) =>
      this.homeApi.getBookProgress(slug).pipe(
        map((response) => {
          const page = response?.data?.page ?? 0;
          return { slug, percentage: Math.max(0, Math.min(100, page)) };
        }),
        catchError(() => of({ slug, percentage: 0 })),
      ),
    );

    forkJoin(requests).subscribe((entries) => {
      const next: Record<string, number> = { ...this.bookProgressBySlug() };
      for (const entry of entries) {
        if (entry.percentage > 0) {
          next[entry.slug] = entry.percentage;
        }
      }
      this.bookProgressBySlug.set(next);
    });
  }
}
