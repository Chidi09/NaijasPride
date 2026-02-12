import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

type Counter = {
  label: string;
  value: number;
  helper: string;
};

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="space-y-6">
      <section class="rounded-xl border border-[#2d1a21] bg-[#140d11] p-6">
        <h2 class="text-xl font-semibold text-white">Dashboard</h2>
        <p class="mt-1 text-sm text-[#9f7d73]">Operational snapshot across movies, books, comics, and manga channels.</p>
      </section>

      <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        @for (card of counters(); track card.label) {
          <article class="rounded-xl border border-[#2d1a21] bg-[#1b1014] p-5">
            <p class="text-xs uppercase tracking-[0.2em] text-[#9f7d73]">{{ card.label }}</p>
            <p class="mt-3 text-3xl font-bold text-white">{{ card.value }}</p>
            <p class="mt-2 text-xs text-[#b59c95]">{{ card.helper }}</p>
          </article>
        }
      </section>

      <section class="rounded-xl border border-[#2d1a21] bg-[#140d11] p-6">
        <h3 class="text-lg font-semibold text-white">Quick Actions</h3>
        <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <a routerLink="/admin/movies/new" class="rounded-lg border border-[#5f1327] bg-[#1b1014] px-4 py-3 text-sm text-[#d6b87a] hover:bg-[#2a131a]">+ Add Movie</a>
          <a routerLink="/admin/books" class="rounded-lg border border-[#5f1327] bg-[#1b1014] px-4 py-3 text-sm text-[#d6b87a] hover:bg-[#2a131a]">+ Upload Book/Comic</a>
          <a routerLink="/admin/discovery" class="rounded-lg border border-[#5f1327] bg-[#1b1014] px-4 py-3 text-sm text-[#d6b87a] hover:bg-[#2a131a]">Manage YouTube Channels</a>
          <a routerLink="/books/comics" class="rounded-lg border border-[#5f1327] bg-[#1b1014] px-4 py-3 text-sm text-[#d6b87a] hover:bg-[#2a131a]">Open Comics Library</a>
        </div>
      </section>
    </div>
  `,
})
export class AdminDashboardComponent {
  private readonly http = inject(HttpClient);

  counters = signal<Counter[]>([
    { label: 'Movies', value: 0, helper: 'Total published movies' },
    { label: 'Books', value: 0, helper: 'Uploaded downloadable books' },
    { label: 'Comics Source', value: 0, helper: 'Discover feed items (ReadComicsOnline)' },
    { label: 'YouTube Channels', value: 0, helper: 'Tracked import channels' },
  ]);

  constructor() {
    this.loadStats();
  }

  private loadStats() {
    this.http.get<{ success: boolean; meta: { total: number } }>('/api/v1/movies?page=1&limit=1').subscribe({
      next: (response) => this.patchCounter('Movies', response.meta?.total ?? 0),
    });

    this.http.get<{ status: string; meta: { total: number } }>('/api/v1/books?page=1&limit=1&kind=book').subscribe({
      next: (response) => this.patchCounter('Books', response.meta?.total ?? 0),
    });

    this.http
      .get<{ status: string; data: { trending: unknown[] } }>('/api/v1/books/manga/source/readcomicsonline/discover?limit=24')
      .subscribe({
        next: (response) => this.patchCounter('Comics Source', response.data?.trending?.length ?? 0),
      });

    this.http.get<{ status: string; data: unknown[] }>('/api/v1/admin/youtube/channels').subscribe({
      next: (response) => this.patchCounter('YouTube Channels', response.data?.length ?? 0),
    });
  }

  private patchCounter(label: string, value: number) {
    this.counters.update((cards) => cards.map((card) => (card.label === label ? { ...card, value } : card)));
  }
}
