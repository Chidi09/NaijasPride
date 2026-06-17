import { CommonModule } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { Component, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";

type Counter = {
  label: string;
  value: number;
  helper: string;
};

@Component({
  selector: "app-admin-dashboard",
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="space-y-6">
      <!-- Admin Quick Guide -->
      <section
        class="rounded-xl border border-[#d6b87a]/30 bg-[#fff7f0] p-6 dark:border-[#d6b87a]/20 dark:bg-[#1b1014]"
      >
        <div class="flex items-center gap-3 mb-4">
          <div
            class="w-10 h-10 rounded-full bg-[#d6b87a]/10 flex items-center justify-center text-[#d6b87a]"
          >
            <svg
              class="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <h2 class="text-lg font-bold text-[#24181b] dark:text-white">
              Admin Quick Guide
            </h2>
            <p class="text-xs text-[#7b6660] dark:text-[#9f7d73]">
              How to manage content on NaijasPride
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="space-y-2">
            <h4
              class="text-[#d6b87a] text-sm font-bold uppercase tracking-wider"
            >
              1. Adding Content
            </h4>
            <p
              class="text-xs text-[#7b6660] leading-relaxed dark:text-[#b59c95]"
            >
              Use
              <strong class="text-[#24181b] dark:text-white"
                >Upload Movie</strong
              >
              for high-quality files. Use
              <strong class="text-[#24181b] dark:text-white"
                >Content Scout</strong
              >
              to automate imports from YouTube. Manual links should only be used
              as a last resort.
            </p>
          </div>
          <div class="space-y-2">
            <h4
              class="text-[#d6b87a] text-sm font-bold uppercase tracking-wider"
            >
              2. Metadata Sync
            </h4>
            <p
              class="text-xs text-[#7b6660] leading-relaxed dark:text-[#b59c95]"
            >
              Always click
              <strong class="text-[#24181b] dark:text-white"
                >Auto-Fill Info</strong
              >
              in the Movie List. This fetches posters, cast, and ratings from
              TMDB automatically using the movie title and year.
            </p>
          </div>
          <div class="space-y-2">
            <h4
              class="text-[#d6b87a] text-sm font-bold uppercase tracking-wider"
            >
              3. Monitoring
            </h4>
            <p
              class="text-xs text-[#7b6660] leading-relaxed dark:text-[#b59c95]"
            >
              Check
              <strong class="text-[#24181b] dark:text-white">Job Queues</strong>
              if a movie isn't appearing. Transcoding and image processing
              happen in the background and might take a few minutes for large
              files.
            </p>
          </div>
        </div>
      </section>

      <section
        class="rounded-xl border border-[#dcc5b8] bg-[#fffdf8] p-6 dark:border-[#2d1a21] dark:bg-[#140d11]"
      >
        <h2 class="text-xl font-semibold text-[#24181b] dark:text-white">
          Dashboard
        </h2>
        <p class="mt-1 text-sm text-[#7b6660] dark:text-[#9f7d73]">
          Operational snapshot across movies, books, comics, and manga channels.
        </p>
      </section>

      <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        @for (card of counters(); track card.label) {
          <article
            class="rounded-xl border border-[#dcc5b8] bg-[#fff7f0] p-5 dark:border-[#2d1a21] dark:bg-[#1b1014]"
          >
            <p
              class="text-xs uppercase tracking-[0.2em] text-[#7b6660] dark:text-[#9f7d73]"
            >
              {{ card.label }}
            </p>
            <p class="mt-3 text-3xl font-bold text-[#24181b] dark:text-white">
              {{ card.value }}
            </p>
            <p class="mt-2 text-xs text-[#7b6660] dark:text-[#b59c95]">
              {{ card.helper }}
            </p>
          </article>
        }
      </section>

      <section
        class="rounded-xl border border-[#dcc5b8] bg-[#fffdf8] p-6 dark:border-[#2d1a21] dark:bg-[#140d11]"
      >
        <h3 class="text-lg font-semibold text-[#24181b] dark:text-white">
          Quick Actions
        </h3>
        <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <a
            routerLink="/admin/movies/new"
            class="rounded-lg border border-[#d6b87a]/50 bg-[#fff7f0] px-4 py-3 text-sm text-[#5f1327] hover:bg-[#f6e4d7] dark:border-[#5f1327] dark:bg-[#1b1014] dark:text-[#d6b87a] dark:hover:bg-[#2a131a]"
            >+ Add Movie</a
          >
          <a
            routerLink="/admin/books"
            class="rounded-lg border border-[#d6b87a]/50 bg-[#fff7f0] px-4 py-3 text-sm text-[#5f1327] hover:bg-[#f6e4d7] dark:border-[#5f1327] dark:bg-[#1b1014] dark:text-[#d6b87a] dark:hover:bg-[#2a131a]"
            >+ Upload Book/Comic</a
          >
          <a
            routerLink="/admin/discovery"
            class="rounded-lg border border-[#d6b87a]/50 bg-[#fff7f0] px-4 py-3 text-sm text-[#5f1327] hover:bg-[#f6e4d7] dark:border-[#5f1327] dark:bg-[#1b1014] dark:text-[#d6b87a] dark:hover:bg-[#2a131a]"
            >Manage YouTube Channels</a
          >
          <a
            routerLink="/books/comics"
            class="rounded-lg border border-[#d6b87a]/50 bg-[#fff7f0] px-4 py-3 text-sm text-[#5f1327] hover:bg-[#f6e4d7] dark:border-[#5f1327] dark:bg-[#1b1014] dark:text-[#d6b87a] dark:hover:bg-[#2a131a]"
            >Open Comics Library</a
          >
        </div>
      </section>
    </div>
  `,
})
export class AdminDashboardComponent {
  private readonly http = inject(HttpClient);

  counters = signal<Counter[]>([
    { label: "Movies", value: 0, helper: "Total published movies" },
    { label: "Books", value: 0, helper: "Uploaded downloadable books" },
    {
      label: "Comics Source",
      value: 0,
      helper: "Discover feed items (ReadComicsOnline)",
    },
    { label: "YouTube Channels", value: 0, helper: "Tracked import channels" },
  ]);

  constructor() {
    this.loadStats();
  }

  private loadStats() {
    this.http
      .get<{
        success: boolean;
        meta: { total: number };
      }>("/api/v1/movies?page=1&limit=1")
      .subscribe({
        next: (response) =>
          this.patchCounter("Movies", response.meta?.total ?? 0),
      });

    this.http
      .get<{
        status: string;
        meta: { total: number };
      }>("/api/v1/books?page=1&limit=1&kind=book")
      .subscribe({
        next: (response) =>
          this.patchCounter("Books", response.meta?.total ?? 0),
      });

    this.http
      .get<{
        status: string;
        data: { trending: unknown[] };
      }>("/api/v1/books/manga/source/readcomicsonline/discover?limit=24")
      .subscribe({
        next: (response) =>
          this.patchCounter(
            "Comics Source",
            response.data?.trending?.length ?? 0,
          ),
      });

    this.http
      .get<{
        status: string;
        data: unknown[];
      }>("/api/v1/admin/youtube/channels")
      .subscribe({
        next: (response) =>
          this.patchCounter("YouTube Channels", response.data?.length ?? 0),
      });
  }

  private patchCounter(label: string, value: number) {
    this.counters.update((cards) =>
      cards.map((card) => (card.label === label ? { ...card, value } : card)),
    );
  }
}
