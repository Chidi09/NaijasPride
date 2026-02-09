import { CommonModule, NgOptimizedImage } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

type MangaSummary = {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  status: string | null;
  year: number | null;
  originalLanguage: string | null;
  tags: string[];
};

type MangaChapter = {
  id: string;
  chapter: string | null;
  volume: string | null;
  title: string | null;
  pages: number;
  publishedAt: string | null;
};

@Component({
  selector: 'app-manga-library',
  standalone: true,
  imports: [CommonModule, RouterLink, NgOptimizedImage, FormsModule],
  template: `
    <div class="container mx-auto px-4 py-10">
      <div class="mb-8 flex items-center justify-between gap-3">
        <div>
          <h1 class="font-['Cinzel'] text-3xl text-white">Manga Library</h1>
          <p class="mt-2 text-sm text-gray-400">Search MangaDex and read instantly with auto reader mode.</p>
        </div>
        <a routerLink="/books" class="rounded border border-[#5f1327] px-4 py-2 text-sm text-[#d6b87a] hover:bg-[#5f1327]/20">Back to Books</a>
      </div>

      <div class="mb-8 rounded-xl border border-[#5f1327]/50 bg-[#120a0d]/70 p-4">
        <div class="flex flex-col gap-3 sm:flex-row">
          <input
            [(ngModel)]="query"
            (keyup.enter)="search()"
            type="text"
            placeholder="Search manga e.g. Solo Leveling, One Piece"
            class="w-full rounded-lg border border-[#5f1327] bg-[#1b1014] px-4 py-3 text-[#f7eee7] placeholder-[#a88a78] outline-none focus:border-[#800020]"
          >
          <button
            (click)="search()"
            [disabled]="isLoading() || !query().trim()"
            class="rounded-lg bg-[#800020] px-5 py-3 text-sm font-semibold text-white hover:bg-[#660019] disabled:opacity-50"
          >
            {{ isLoading() ? 'Searching...' : 'Search' }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-8 lg:grid-cols-[1.2fr_1fr]">
        <section>
          <h2 class="mb-4 text-lg font-semibold text-[#d6b87a]">Results</h2>
          @if (results().length === 0 && !isLoading()) {
            <div class="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-gray-400">No manga loaded yet. Search to begin.</div>
          }
          <div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            @for (manga of results(); track manga.id) {
              <button
                type="button"
                (click)="selectManga(manga)"
                class="group overflow-hidden rounded-lg border border-[#5f1327]/30 bg-[#120a0d] text-left transition hover:border-[#800020]"
              >
                <div class="relative aspect-[3/4]">
                  @if (manga.coverUrl) {
                    <img [ngSrc]="manga.coverUrl" [alt]="manga.title" fill sizes="200px" class="object-cover">
                  } @else {
                    <div class="flex h-full items-center justify-center bg-zinc-800 text-4xl">📘</div>
                  }
                </div>
                <div class="p-3">
                  <p class="line-clamp-2 text-sm font-semibold text-white">{{ manga.title }}</p>
                  <p class="mt-1 text-xs text-gray-400">{{ manga.year || 'Unknown year' }}</p>
                </div>
              </button>
            }
          </div>
        </section>

        <section>
          <h2 class="mb-4 text-lg font-semibold text-[#d6b87a]">Chapters</h2>
          @if (!selectedManga()) {
            <div class="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-gray-400">Select a manga to load chapters.</div>
          }
          @if (selectedManga(); as manga) {
            <div class="mb-4 rounded-lg border border-[#5f1327]/40 bg-[#120a0d]/80 p-4">
              <h3 class="text-white font-semibold">{{ manga.title }}</h3>
              <p class="mt-2 line-clamp-4 text-xs text-gray-400">{{ manga.description || 'No description available.' }}</p>
            </div>

            <div class="max-h-[60vh] space-y-2 overflow-auto pr-1">
              @for (chapter of chapters(); track chapter.id) {
                <a
                  [routerLink]="['/books/manga/read', chapter.id]"
                  [queryParams]="{ title: manga.title, chapter: chapter.chapter || '' }"
                  class="block rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm text-gray-200 hover:border-[#800020] hover:bg-[#800020]/10"
                >
                  <div class="font-medium">Chapter {{ chapter.chapter || '?' }} <span class="text-gray-400">{{ chapter.title || '' }}</span></div>
                  <div class="mt-1 text-xs text-gray-500">{{ chapter.pages }} pages</div>
                </a>
              }
            </div>
          }
        </section>
      </div>
    </div>
  `,
})
export class MangaLibraryComponent {
  private http = inject(HttpClient);

  query = signal('');
  isLoading = signal(false);
  results = signal<MangaSummary[]>([]);
  selectedManga = signal<MangaSummary | null>(null);
  chapters = signal<MangaChapter[]>([]);

  search() {
    const q = this.query().trim();
    if (!q) return;

    this.isLoading.set(true);
    this.http.get<{ status: string; data: MangaSummary[] }>(`/api/v1/books/manga/search?q=${encodeURIComponent(q)}`)
      .subscribe({
        next: (response) => {
          this.results.set(response.data);
          this.isLoading.set(false);
          this.selectedManga.set(null);
          this.chapters.set([]);
        },
        error: (error) => {
          console.error('Failed to search manga:', error);
          this.isLoading.set(false);
        },
      });
  }

  selectManga(manga: MangaSummary) {
    this.selectedManga.set(manga);
    this.chapters.set([]);
    this.http.get<{ status: string; data: MangaChapter[] }>(`/api/v1/books/manga/${manga.id}/chapters`)
      .subscribe({
        next: (response) => this.chapters.set(response.data),
        error: (error) => console.error('Failed to load chapters:', error),
      });
  }
}
