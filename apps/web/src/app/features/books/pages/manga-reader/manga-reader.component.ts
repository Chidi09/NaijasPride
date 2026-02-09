import { CommonModule, NgOptimizedImage } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

type MangaPagesPayload = {
  chapterId: string;
  readerMode: 'webtoon' | 'manga' | 'comic';
  pages: string[];
};

@Component({
  selector: 'app-manga-reader',
  standalone: true,
  imports: [CommonModule, RouterLink, NgOptimizedImage],
  template: `
    <div class="min-h-screen bg-black px-4 py-6 text-white">
      <div class="mx-auto mb-6 flex w-full max-w-6xl items-center justify-between">
        <a routerLink="/books/manga" class="rounded border border-[#5f1327] px-3 py-2 text-xs text-[#d6b87a] hover:bg-[#5f1327]/20">Back to Manga</a>
        <div class="text-right">
          <p class="text-sm font-semibold text-[#d6b87a]">{{ title() || 'Manga Reader' }}</p>
          <p class="text-xs text-gray-400">Mode: {{ modeLabel() }}</p>
        </div>
      </div>

      @if (isLoading()) {
        <div class="mx-auto max-w-4xl text-center text-gray-400">Loading chapter...</div>
      }

      @if (!isLoading() && pages().length === 0) {
        <div class="mx-auto max-w-4xl text-center text-gray-400">No pages found for this chapter.</div>
      }

      @if (!isLoading() && pages().length > 0 && readerMode() === 'webtoon') {
        <div class="mx-auto flex max-w-3xl flex-col gap-2">
          @for (page of pages(); track page; let i = $index) {
            <img [ngSrc]="page" [alt]="'Page ' + (i + 1)" width="1200" height="1800" class="h-auto w-full rounded-sm" loading="lazy">
          }
        </div>
      }

      @if (!isLoading() && pages().length > 0 && readerMode() === 'comic') {
        <div class="mx-auto grid max-w-6xl grid-cols-1 gap-3 md:grid-cols-2">
          @for (page of pages(); track page; let i = $index) {
            <img [ngSrc]="page" [alt]="'Page ' + (i + 1)" width="1200" height="1800" class="h-auto w-full rounded-sm" loading="lazy">
          }
        </div>
      }

      @if (!isLoading() && pages().length > 0 && readerMode() === 'manga') {
        <div class="mx-auto max-w-4xl">
          <div class="mb-4 flex items-center justify-between">
            <button (click)="prev()" [disabled]="pageIndex() === 0" class="rounded border border-zinc-700 px-3 py-2 text-xs disabled:opacity-40">Prev</button>
            <span class="text-xs text-gray-400">Page {{ pageIndex() + 1 }} / {{ pages().length }}</span>
            <button (click)="next()" [disabled]="pageIndex() >= pages().length - 1" class="rounded border border-zinc-700 px-3 py-2 text-xs disabled:opacity-40">Next</button>
          </div>
          <img [ngSrc]="currentPage()" alt="Current manga page" width="1400" height="2000" class="mx-auto h-auto max-h-[85vh] w-auto rounded-sm" loading="eager">
        </div>
      }
    </div>
  `,
})
export class MangaReaderComponent {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  isLoading = signal(true);
  title = signal('');
  readerMode = signal<'webtoon' | 'manga' | 'comic'>('manga');
  pages = signal<string[]>([]);
  pageIndex = signal(0);
  currentPage = computed(() => this.pages()[this.pageIndex()] || '');
  modeLabel = computed(() => {
    const mode = this.readerMode();
    if (mode === 'webtoon') return 'Webtoon (vertical)';
    if (mode === 'comic') return 'Comic (spread)';
    return 'Manga (paged)';
  });

  constructor() {
    const chapterId = this.route.snapshot.paramMap.get('chapterId');
    this.title.set(this.route.snapshot.queryParamMap.get('title') || '');

    if (!chapterId) {
      this.isLoading.set(false);
      return;
    }

    this.http.get<{ status: string; data: MangaPagesPayload }>(`/api/v1/books/manga/chapter/${chapterId}/pages`)
      .subscribe({
        next: (response) => {
          this.readerMode.set(response.data.readerMode);
          this.pages.set(response.data.pages);
          this.pageIndex.set(0);
          this.isLoading.set(false);
        },
        error: (error) => {
          console.error('Failed to load chapter pages:', error);
          this.isLoading.set(false);
        },
      });
  }

  next() {
    if (this.pageIndex() < this.pages().length - 1) {
      this.pageIndex.set(this.pageIndex() + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  prev() {
    if (this.pageIndex() > 0) {
      this.pageIndex.set(this.pageIndex() - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}
