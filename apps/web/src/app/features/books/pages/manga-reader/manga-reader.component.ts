import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, debounceTime, takeUntil } from 'rxjs';

type ApiReaderMode = 'webtoon' | 'manga' | 'comic';
type ReaderMode = 'webtoon' | 'single' | 'double' | 'rtl' | 'ltr';

type MangaPagesPayload = {
  chapterId: string;
  readerMode: ApiReaderMode;
  pages: string[];
};

type ReadingProgress = {
  pageIndex: number;
  totalPages: number;
  isCompleted: boolean;
};

@Component({
  selector: 'app-manga-reader',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="min-h-screen bg-black px-4 py-6 text-white">
      <div class="mx-auto mb-4 flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
        <a routerLink="/books/manga" class="rounded border border-[#5f1327] px-3 py-2 text-xs text-[#d6b87a] hover:bg-[#5f1327]/20">Back to Manga</a>
        <div class="text-right">
          <p class="text-sm font-semibold text-[#d6b87a]">{{ title() || 'Manga Reader' }}</p>
          <p class="text-xs text-gray-400">Page {{ pageIndex() + 1 }} / {{ pages().length }}</p>
        </div>
      </div>

      <div class="mx-auto mb-6 w-full max-w-6xl rounded border border-zinc-800 bg-zinc-900/40 p-3">
        <p class="mb-2 text-xs text-gray-400">Reading Mode</p>
        <div class="flex flex-wrap gap-2">
          @for (mode of modeOptions; track mode.value) {
            <button
              type="button"
              (click)="setMode(mode.value)"
              class="rounded border px-3 py-1.5 text-xs"
              [class.border-[#800020]]="selectedMode() === mode.value"
              [class.text-[#d6b87a]]="selectedMode() === mode.value"
              [class.border-zinc-700]="selectedMode() !== mode.value"
              [class.text-gray-300]="selectedMode() !== mode.value"
            >{{ mode.label }}</button>
          }
        </div>
      </div>

      @if (isLoading()) {
        <div class="mx-auto max-w-4xl text-center text-gray-400">Loading chapter...</div>
      }

      @if (!isLoading() && pages().length === 0) {
        <div class="mx-auto max-w-4xl text-center text-gray-400">No pages found for this chapter.</div>
      }

      @if (!isLoading() && selectedMode() === 'webtoon') {
        <div class="mx-auto flex max-w-3xl flex-col gap-2">
          @for (page of pages(); track page) {
            <img [src]="page" alt="Manga page" class="h-auto w-full rounded-sm" loading="lazy">
          }
        </div>
      }

      @if (!isLoading() && selectedMode() === 'double') {
        <div class="mx-auto max-w-6xl">
          <div class="mb-4 flex items-center justify-between">
            <button (click)="prev()" [disabled]="!canGoPrev()" class="rounded border border-zinc-700 px-3 py-2 text-xs disabled:opacity-40">Prev</button>
            <span class="text-xs text-gray-400">Spread {{ spreadLabel() }}</span>
            <button (click)="next()" [disabled]="!canGoNext()" class="rounded border border-zinc-700 px-3 py-2 text-xs disabled:opacity-40">Next</button>
          </div>
          <div class="grid gap-2 md:grid-cols-2">
            <img [src]="currentPage()" alt="Left page" class="h-auto w-full rounded-sm">
            @if (nextPage()) {
              <img [src]="nextPage()" alt="Right page" class="h-auto w-full rounded-sm">
            }
          </div>
        </div>
      }

      @if (!isLoading() && (selectedMode() === 'single' || selectedMode() === 'ltr' || selectedMode() === 'rtl')) {
        <div class="mx-auto max-w-4xl">
          <div class="mb-4 flex items-center justify-between">
            <button (click)="prev()" [disabled]="!canGoPrev()" class="rounded border border-zinc-700 px-3 py-2 text-xs disabled:opacity-40">Prev</button>
            <span class="text-xs text-gray-400">Page {{ pageIndex() + 1 }} / {{ pages().length }}</span>
            <button (click)="next()" [disabled]="!canGoNext()" class="rounded border border-zinc-700 px-3 py-2 text-xs disabled:opacity-40">Next</button>
          </div>
          <img [src]="currentPage()" alt="Current manga page" class="mx-auto h-auto max-h-[85vh] w-auto rounded-sm" loading="eager">
        </div>
      }

      <div class="fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-black/90 p-2 text-center text-xs text-gray-300 md:hidden">
        {{ selectedModeLabel() }} - Page {{ pageIndex() + 1 }} / {{ pages().length }}
      </div>
    </div>
  `,
})
export class MangaReaderComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private destroy$ = new Subject<void>();
  private progressUpdate$ = new Subject<number>();

  modeOptions: Array<{ label: string; value: ReaderMode }> = [
    { label: 'Webtoon', value: 'webtoon' },
    { label: 'Single Page', value: 'single' },
    { label: 'Double Page', value: 'double' },
    { label: 'Right-to-Left', value: 'rtl' },
    { label: 'Left-to-Right', value: 'ltr' },
  ];

  isLoading = signal(true);
  title = signal('');
  pages = signal<string[]>([]);
  pageIndex = signal(0);
  mangaId = signal('');
  chapterId = signal('');
  selectedMode = signal<ReaderMode>('single');
  autoMode = signal<ApiReaderMode>('manga');

  currentPage = computed(() => this.pages()[this.pageIndex()] || '');
  nextPage = computed(() => this.pages()[this.pageIndex() + 1] || '');
  canGoPrev = computed(() => this.selectedMode() === 'rtl' ? this.pageIndex() < this.pages().length - 1 : this.pageIndex() > 0);
  canGoNext = computed(() => this.selectedMode() === 'rtl' ? this.pageIndex() > 0 : this.pageIndex() < this.pages().length - 1);
  spreadLabel = computed(() => {
    const left = this.pageIndex() + 1;
    const right = this.pageIndex() + 2;
    return this.nextPage() ? `${left}-${right}` : `${left}`;
  });
  selectedModeLabel = computed(() => this.modeOptions.find((m) => m.value === this.selectedMode())?.label || 'Single Page');

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

    this.progressUpdate$.pipe(debounceTime(1000), takeUntil(this.destroy$)).subscribe((pageIndex) => {
      this.saveProgress(pageIndex);
    });

    this.loadChapter(chapterId, mangaId);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.chapterId() && this.pages().length > 0) {
      this.saveProgress(this.pageIndex());
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowRight') {
      this.selectedMode() === 'rtl' ? this.prev() : this.next();
    } else if (event.key === 'ArrowLeft') {
      this.selectedMode() === 'rtl' ? this.next() : this.prev();
    }
  }

  setMode(mode: ReaderMode) {
    this.selectedMode.set(mode);
    localStorage.setItem('np_reader_mode', mode);
  }

  private inferInitialMode(mode: ApiReaderMode): ReaderMode {
    const saved = localStorage.getItem('np_reader_mode') as ReaderMode | null;
    if (saved && this.modeOptions.some((item) => item.value === saved)) return saved;
    if (mode === 'webtoon') return 'webtoon';
    if (mode === 'comic') return 'double';
    return 'rtl';
  }

  private loadChapter(chapterId: string, mangaId: string) {
    this.http.get<{ status: string; data: MangaPagesPayload }>(`/api/v1/books/manga/chapter/${chapterId}/pages`).subscribe({
      next: (response) => {
        this.autoMode.set(response.data.readerMode);
        this.selectedMode.set(this.inferInitialMode(response.data.readerMode));
        this.pages.set(response.data.pages);
        this.isLoading.set(false);

        if (mangaId) {
          this.loadProgress(chapterId);
        }
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  private loadProgress(chapterId: string) {
    this.http.get<{ status: string; data: ReadingProgress | null }>(`/api/v1/books/manga/progress/${chapterId}`).subscribe({
      next: (response) => {
        if (!response.data) return;
        this.pageIndex.set(Math.min(response.data.pageIndex, Math.max(0, this.pages().length - 1)));
      },
    });
  }

  private saveProgress(pageIndex: number) {
    if (!this.mangaId() || !this.chapterId() || this.pages().length === 0) return;
    this.http.post('/api/v1/books/manga/progress', {
      mangaId: this.mangaId(),
      chapterId: this.chapterId(),
      pageIndex,
      totalPages: this.pages().length,
      isCompleted: pageIndex >= this.pages().length - 1,
    }).subscribe();
  }

  next() {
    const step = this.selectedMode() === 'double' ? 2 : 1;
    const nextIndex = this.selectedMode() === 'rtl'
      ? Math.max(0, this.pageIndex() - step)
      : Math.min(this.pages().length - 1, this.pageIndex() + step);
    if (nextIndex === this.pageIndex()) return;
    this.pageIndex.set(nextIndex);
    this.progressUpdate$.next(nextIndex);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  prev() {
    const step = this.selectedMode() === 'double' ? 2 : 1;
    const nextIndex = this.selectedMode() === 'rtl'
      ? Math.min(this.pages().length - 1, this.pageIndex() + step)
      : Math.max(0, this.pageIndex() - step);
    if (nextIndex === this.pageIndex()) return;
    this.pageIndex.set(nextIndex);
    this.progressUpdate$.next(nextIndex);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
