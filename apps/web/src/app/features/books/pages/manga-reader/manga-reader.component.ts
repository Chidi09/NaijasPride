import { CommonModule, NgOptimizedImage } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, takeUntil, debounceTime } from 'rxjs';

type MangaPagesPayload = {
  chapterId: string;
  readerMode: 'webtoon' | 'manga' | 'comic';
  pages: string[];
};

type ReadingProgress = {
  id: string;
  userId: string;
  mangaId: string;
  chapterId: string;
  pageIndex: number;
  totalPages: number;
  isCompleted: boolean;
  lastReadAt: string;
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
          <p class="text-xs text-gray-400">Mode: {{ modeLabel() }} | Page {{ pageIndex() + 1 }} / {{ pages().length }}</p>
          @if (isCompleted()) {
            <span class="mt-1 inline-block rounded bg-green-900/50 px-2 py-0.5 text-xs text-green-400">Completed</span>
          }
        </div>
      </div>

      @if (isLoading()) {
        <div class="mx-auto max-w-4xl text-center text-gray-400">Loading chapter...</div>
      }

      @if (!isLoading() && pages().length === 0) {
        <div class="mx-auto max-w-4xl text-center text-gray-400">No pages found for this chapter.</div>
      }

      @if (!isLoading() && pages().length > 0 && readerMode() === 'webtoon') {
        <div #scrollContainer class="mx-auto flex max-w-3xl flex-col gap-2">
          @for (page of pages(); track page; let i = $index) {
            <img
              [ngSrc]="page"
              [alt]="'Page ' + (i + 1)"
              width="1200"
              height="1800"
              class="h-auto w-full rounded-sm"
              loading="lazy"
              (load)="onImageLoad(i)"
            >
          }
        </div>
      }

      @if (!isLoading() && pages().length > 0 && readerMode() === 'comic') {
        <div class="mx-auto grid max-w-6xl grid-cols-1 gap-3 md:grid-cols-2">
          @for (page of pages(); track page; let i = $index) {
            <img
              [ngSrc]="page"
              [alt]="'Page ' + (i + 1)"
              width="1200"
              height="1800"
              class="h-auto w-full rounded-sm"
              loading="lazy"
            >
          }
        </div>
      }

      @if (!isLoading() && pages().length > 0 && readerMode() === 'manga') {
        <div class="mx-auto max-w-4xl">
          <div class="mb-4 flex items-center justify-between">
            <button
              (click)="prev()"
              [disabled]="pageIndex() === 0"
              class="rounded border border-zinc-700 px-3 py-2 text-xs disabled:opacity-40"
            >
              Prev
            </button>
            <span class="text-xs text-gray-400">Page {{ pageIndex() + 1 }} / {{ pages().length }}</span>
            <button
              (click)="next()"
              [disabled]="pageIndex() >= pages().length - 1"
              class="rounded border border-zinc-700 px-3 py-2 text-xs disabled:opacity-40"
            >
              Next
            </button>
          </div>
          <img
            [ngSrc]="currentPage()"
            alt="Current manga page"
            width="1400"
            height="2000"
            class="mx-auto h-auto max-h-[85vh] w-auto rounded-sm"
            loading="eager"
          >
        </div>
      }

      <!-- Completion overlay -->
      @if (showCompletion()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div class="max-w-md rounded-xl border border-[#800020] bg-[#120a0d] p-6 text-center">
            <h3 class="mb-2 text-xl font-bold text-[#d6b87a]">Chapter Completed!</h3>
            <p class="mb-4 text-sm text-gray-400">You've finished reading this chapter.</p>
            <div class="flex justify-center gap-3">
              <button
                (click)="showCompletion.set(false)"
                class="rounded border border-zinc-700 px-4 py-2 text-sm text-gray-300 hover:bg-zinc-800"
              >
                Continue Reading
              </button>
              <a
                routerLink="/books/manga"
                class="rounded bg-[#800020] px-4 py-2 text-sm text-white hover:bg-[#660019]"
              >
                Back to Library
              </a>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class MangaReaderComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private destroy$ = new Subject<void>();
  private progressUpdate$ = new Subject<number>();

  isLoading = signal(true);
  title = signal('');
  readerMode = signal<'webtoon' | 'manga' | 'comic'>('manga');
  pages = signal<string[]>([]);
  pageIndex = signal(0);
  mangaId = signal('');
  chapterId = signal('');
  isCompleted = signal(false);
  showCompletion = signal(false);

  currentPage = computed(() => this.pages()[this.pageIndex()] || '');
  modeLabel = computed(() => {
    const mode = this.readerMode();
    if (mode === 'webtoon') return 'Webtoon (vertical)';
    if (mode === 'comic') return 'Comic (spread)';
    return 'Manga (paged)';
  });

  ngOnInit() {
    const chapterId = this.route.snapshot.paramMap.get('chapterId');
    const mangaId = this.route.snapshot.queryParamMap.get('mangaId') || '';
    this.title.set(this.route.snapshot.queryParamMap.get('title') || '');
    this.mangaId.set(mangaId);
    this.chapterId.set(chapterId || '');

    if (!chapterId) {
      this.isLoading.set(false);
      return;
    }

    // Setup debounced progress saving
    this.progressUpdate$
      .pipe(debounceTime(1000), takeUntil(this.destroy$))
      .subscribe((pageIndex) => {
        this.saveProgress(pageIndex);
      });

    // Load chapter pages and existing progress
    this.loadChapter(chapterId, mangaId);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    // Save final progress on destroy
    if (this.chapterId() && this.pages().length > 0) {
      this.saveProgress(this.pageIndex(), this.isCompleted());
    }
  }

  private loadChapter(chapterId: string, mangaId: string) {
    this.http
      .get<{ status: string; data: MangaPagesPayload }>(`/api/v1/books/manga/chapter/${chapterId}/pages`)
      .subscribe({
        next: (response) => {
          this.readerMode.set(response.data.readerMode);
          this.pages.set(response.data.pages);
          this.isLoading.set(false);

          // Load existing progress
          if (mangaId) {
            this.loadProgress(chapterId);
          } else {
            this.pageIndex.set(0);
          }
        },
        error: (error) => {
          console.error('Failed to load chapter pages:', error);
          this.isLoading.set(false);
        },
      });
  }

  private loadProgress(chapterId: string) {
    this.http
      .get<{ status: string; data: ReadingProgress | null }>(`/api/v1/books/manga/progress/${chapterId}`)
      .subscribe({
        next: (response) => {
          if (response.data) {
            this.pageIndex.set(response.data.pageIndex);
            this.isCompleted.set(response.data.isCompleted);
            console.log('[Manga] Loaded progress:', response.data.pageIndex + 1, '/', response.data.totalPages);
          }
        },
        error: (error) => {
          console.error('Failed to load reading progress:', error);
        },
      });
  }

  private saveProgress(pageIndex: number, isCompleted = false) {
    if (!this.mangaId() || !this.chapterId()) return;

    const body = {
      mangaId: this.mangaId(),
      chapterId: this.chapterId(),
      pageIndex,
      totalPages: this.pages().length,
      isCompleted: isCompleted || pageIndex >= this.pages().length - 1,
    };

    this.http.post<{ status: string; data: ReadingProgress }>('/api/v1/books/manga/progress', body).subscribe({
      next: () => {
        console.log('[Manga] Saved progress:', pageIndex + 1);
      },
      error: (error) => {
        console.error('Failed to save progress:', error);
      },
    });
  }

  onImageLoad(pageIndex: number) {
    // Track which images have loaded in webtoon mode
    if (this.readerMode() === 'webtoon') {
      // Could implement intersection observer here for more accurate tracking
    }
  }

  next() {
    if (this.pageIndex() < this.pages().length - 1) {
      this.pageIndex.set(this.pageIndex() + 1);
      this.progressUpdate$.next(this.pageIndex());
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Check if completed
      if (this.pageIndex() >= this.pages().length - 1) {
        this.isCompleted.set(true);
        this.showCompletion.set(true);
        this.saveProgress(this.pageIndex(), true);
      }
    }
  }

  prev() {
    if (this.pageIndex() > 0) {
      this.pageIndex.set(this.pageIndex() - 1);
      this.progressUpdate$.next(this.pageIndex());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}
