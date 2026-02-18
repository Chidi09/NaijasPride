import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  AfterViewInit,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import screenfull from 'screenfull';
import { ReaderStateService } from '../../../../core/services/reader-state.service';
import { MangaOfflineService } from '../../../../core/services/manga-offline.service';

type ApiReaderMode = 'webtoon' | 'reversed' | 'standard' | 'double-page';
type ReaderMode = ApiReaderMode;

type MangaPagesPayload = {
  chapterId: string;
  readerMode: ApiReaderMode;
  pages: string[];
  externalUrl: string | null;
  isExternal: boolean;
};

type MangaChapter = {
  id: string;
  chapter: string;
  volume: string | null;
  title: string | null;
  publishedAt: string | null;
  branch: string | null;
  scanlationGroup: string | null;
  externalUrl: string | null;
  isExternal: boolean;
};

type ReadingProgress = {
  pageIndex: number;
  totalPages: number;
  isCompleted: boolean;
};

const parseSourceEntityId = (entityId: string): { sourceId: string; rawId: string } | null => {
  const separator = entityId.indexOf(':');
  if (separator <= 0 || separator === entityId.length - 1) return null;
  try {
    return {
      sourceId: entityId.slice(0, separator),
      rawId: decodeURIComponent(entityId.slice(separator + 1)),
    };
  } catch {
    return null;
  }
};

@Component({
  selector: 'app-manga-reader',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="reader-shell relative h-screen w-screen overflow-hidden bg-black text-white">
      <div
        class="pointer-events-none fixed left-0 right-0 top-0 z-40 bg-gradient-to-b from-black/90 to-transparent px-4 py-3 transition-transform duration-300"
        [class.-translate-y-full]="!showControls()"
      >
        <div class="pointer-events-auto mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
          <a [routerLink]="libraryRootPath()" class="rounded border border-white/20 dark:border-[#5f1327] px-3 py-2 text-xs text-[#d6b87a] hover:bg-white/10 dark:hover:bg-[#5f1327]/20">Back</a>
          <div class="min-w-0 text-center">
            <p class="truncate text-sm font-semibold text-[#d6b87a]">{{ title() || 'Reader' }}</p>
            <div class="mt-1 flex items-center justify-center gap-2 text-[11px] text-gray-300 dark:text-gray-300">
              <span>{{ sourceLabel() }}</span>
              @if (currentChapterMeta()?.branch) {
                <span>• {{ currentChapterMeta()?.branch }}</span>
              }
            </div>
          </div>
          <button type="button" (click)="toggleFullscreen()" class="rounded border border-white/20 dark:border-zinc-700 px-3 py-2 text-xs hover:bg-white/10 dark:hover:bg-zinc-800 text-white">Fullscreen</button>
          <button type="button" (click)="toggleIncognito()" class="rounded border border-white/20 dark:border-zinc-700 px-3 py-2 text-xs hover:bg-white/10 dark:hover:bg-zinc-800 text-white">
            {{ incognito() ? 'Incognito On' : 'Incognito Off' }}
          </button>
        </div>
      </div>

      @if (isLoading()) {
        <div class="flex h-full items-center justify-center text-sm text-gray-300 dark:text-gray-300">Loading chapter...</div>
      } @else if (pages().length === 0) {
        <div class="flex h-full items-center justify-center px-6">
          <div class="max-w-xl rounded border border-white/20 dark:border-zinc-700 bg-black/40 dark:bg-zinc-900/60 p-5 text-center text-sm text-gray-300 dark:text-gray-300">
            <p>No pages available in-app for this chapter.</p>
            @if (externalUrl()) {
              <a [href]="externalUrl()" target="_blank" rel="noopener noreferrer" class="mt-4 inline-block rounded border border-amber-700/60 px-4 py-2 text-amber-300 dark:text-amber-300 hover:bg-amber-900/30">Open source site</a>
            }
          </div>
        </div>
      } @else {
        @if (readingMode() === 'webtoon') {
          <div #webtoonScroll class="h-full w-full overflow-y-auto overflow-x-hidden" (click)="toggleControls()" (scroll)="onWebtoonScroll()">
            <div class="mx-auto w-full max-w-3xl">
              @for (page of pages(); track page) {
                <img [src]="page" alt="Manga page" loading="lazy" referrerpolicy="no-referrer" class="block w-full m-0 p-0 select-none" draggable="false">
              }
            </div>
          </div>
        } @else {
          <div class="relative h-full w-full bg-black">
            <swiper-container #swiperEl init="false" class="h-full w-full">
              @for (page of pages(); track page; let i = $index) {
                <swiper-slide class="flex h-full w-full items-center justify-center bg-black">
                  <div class="swiper-zoom-container flex h-full w-full items-center justify-center">
                    <img [src]="page" [alt]="'Page ' + (i + 1)" loading="lazy" referrerpolicy="no-referrer" class="max-h-screen max-w-full object-contain select-none" draggable="false">
                  </div>
                </swiper-slide>
              }
            </swiper-container>

            <button type="button" (click)="tapZone('left')" class="absolute inset-y-0 left-0 z-20 w-1/4 bg-transparent"></button>
            <button type="button" (click)="toggleControls()" class="absolute inset-y-0 left-1/4 z-20 w-2/4 bg-transparent"></button>
            <button type="button" (click)="tapZone('right')" class="absolute inset-y-0 right-0 z-20 w-1/4 bg-transparent"></button>
          </div>
        }
      }

      <div
        class="pointer-events-none fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 dark:border-zinc-800 bg-black/90 dark:bg-zinc-900/95 transition-transform duration-300"
        [class.translate-y-full]="!showControls()"
      >
        <div class="pointer-events-auto mx-auto w-full max-w-5xl px-4 py-4">
          @if (readingMode() !== 'webtoon') {
            <div class="mb-4 flex items-center gap-3">
              <span class="w-10 text-right text-xs text-gray-300 dark:text-gray-300">{{ pageIndex() + 1 }}</span>
              <input type="range" class="w-full accent-[#800020]" [min]="1" [max]="pages().length" [value]="pageIndex() + 1" (input)="onPageSlider($event)">
              <span class="w-10 text-xs text-gray-300 dark:text-gray-300">{{ pages().length }}</span>
            </div>
          } @else {
            <div class="mb-4 text-center text-xs text-gray-300 dark:text-gray-300">Page {{ pageIndex() + 1 }} / {{ pages().length }}</div>
          }

          <div class="grid grid-cols-2 gap-3 md:grid-cols-6">
            <div class="col-span-2 rounded border border-white/10 dark:border-zinc-700 bg-white/5 dark:bg-zinc-800/60 p-1 md:col-span-3">
              <div class="grid grid-cols-4 gap-1">
                <button type="button" (click)="setMode('standard')" class="rounded px-2 py-2 text-xs text-white" [class.bg-zinc-600]="readingMode() === 'standard'">Standard</button>
                <button type="button" (click)="setMode('reversed')" class="rounded px-2 py-2 text-xs text-white" [class.bg-zinc-600]="readingMode() === 'reversed'">Reversed</button>
                <button type="button" (click)="setMode('double-page')" class="rounded px-2 py-2 text-xs text-white" [class.bg-zinc-600]="readingMode() === 'double-page'">Double</button>
                <button type="button" (click)="setMode('webtoon')" class="rounded px-2 py-2 text-xs text-white" [class.bg-zinc-600]="readingMode() === 'webtoon'">Webtoon</button>
              </div>
            </div>

            <button type="button" (click)="goPrevChapter()" [disabled]="!prevChapterId()" class="rounded border border-white/10 dark:border-zinc-700 px-3 py-2 text-xs text-white disabled:opacity-40">Prev Ch.</button>
            <button type="button" (click)="goNextChapter()" [disabled]="!nextChapterId()" class="rounded bg-[#800020] px-3 py-2 text-xs text-white disabled:opacity-40">Next Ch.</button>
            <button type="button" (click)="goPrevPage()" [disabled]="!canPrevPage()" class="rounded border border-white/10 dark:border-zinc-700 px-3 py-2 text-xs text-white disabled:opacity-40">Prev Page</button>
            <button type="button" (click)="goNextPage()" [disabled]="!canNextPage()" class="rounded border border-white/10 dark:border-zinc-700 px-3 py-2 text-xs text-white disabled:opacity-40">Next Page</button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class MangaReaderComponent implements OnInit, AfterViewInit, OnDestroy {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private readerState = inject(ReaderStateService);
  private mangaOffline = inject(MangaOfflineService);
  private destroy$ = new Subject<void>();
  private progressUpdate$ = new Subject<number>();

  @ViewChild('swiperEl') swiperEl?: ElementRef<any>;
  @ViewChild('webtoonScroll') webtoonScroll?: ElementRef<HTMLElement>;

  libraryMode = signal<'manga' | 'comics'>('manga');
  isLoading = signal(true);
  title = signal('');
  sourceId = signal('mangadex');
  mangaId = signal('');
  chapterId = signal('');
  pages = signal<string[]>([]);
  pageIndex = signal(0);
  readingMode = signal<ReaderMode>('webtoon');
  showControls = signal(true);
  incognito = signal(false);
  externalUrl = signal<string | null>(null);
  chapterList = signal<MangaChapter[]>([]);
  prevChapterId = signal<string | null>(null);
  nextChapterId = signal<string | null>(null);

  currentChapterMeta = computed(() => this.chapterList().find((chapter) => chapter.id === this.chapterId()) || null);
  canPrevPage = computed(() => (this.readingMode() === 'reversed' ? this.pageIndex() < this.pages().length - 1 : this.pageIndex() > 0));
  canNextPage = computed(() => (this.readingMode() === 'reversed' ? this.pageIndex() > 0 : this.pageIndex() < this.pages().length - 1));

  ngOnInit() {
    // Hide main navbar when entering reader (Kotatsu-style)
    this.readerState.enterReader();
    
    this.progressUpdate$.pipe(debounceTime(900), takeUntil(this.destroy$)).subscribe((pageIndex) => {
      this.saveProgress(pageIndex);
    });

    this.incognito.set(localStorage.getItem('np_reader_incognito') === '1');

    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.resolveLibraryMode();
      const chapterId = this.fromRouteParam(params.get('chapterId'));
      if (!chapterId) return;

      this.chapterId.set(chapterId);
      this.title.set(this.route.snapshot.queryParamMap.get('title') || 'Reader');
      this.mangaId.set(this.route.snapshot.queryParamMap.get('mangaId') || '');

      // Persist a lightweight "continue reading" pointer for the detail page.
      this.rememberContinueFromReader();

      const parsed = parseSourceEntityId(chapterId);
      this.sourceId.set(parsed?.sourceId || 'mangadex');

      this.loadChapter();
      this.loadChapterContext();
    });
  }

  private rememberContinueFromReader() {
    if (this.incognito()) return;
    const mangaId = this.mangaId();
    const chapterId = this.chapterId();
    if (!mangaId || !chapterId) return;

    const chapterParam = (this.route.snapshot.queryParamMap.get('chapter') || '').trim();
    const label = chapterParam
      ? /^(ch\.?|chapter)\b/i.test(chapterParam)
        ? chapterParam
        : `Chapter ${chapterParam}`
      : '';

    try {
      localStorage.setItem(
        `np_books_continue_${mangaId}`,
        JSON.stringify({ chapterId, label, at: Date.now() })
      );
    } catch {
      // ignore
    }
  }

  ngAfterViewInit() {
    setTimeout(() => this.initSwiper(), 0);
  }

  ngOnDestroy() {
    // Show main navbar when exiting reader (Kotatsu-style)
    this.readerState.exitReader();
    
    this.destroy$.next();
    this.destroy$.complete();
    if (this.chapterId() && this.pages().length > 0) {
      this.saveProgress(this.pageIndex());
    }

    if (this.swiperEl?.nativeElement?.swiper) {
      this.swiperEl.nativeElement.swiper.destroy(true, true);
    }
  }

  @HostListener('window:keyup', ['$event'])
  onKey(event: KeyboardEvent) {
    if (event.key === 'ArrowRight') {
      this.readingMode() === 'reversed' ? this.goPrevPage() : this.goNextPage();
    }
    if (event.key === 'ArrowLeft') {
      this.readingMode() === 'reversed' ? this.goNextPage() : this.goPrevPage();
    }
  }

  setMode(mode: ReaderMode) {
    this.readingMode.set(mode);
    localStorage.setItem('np_reader_mode', mode);

    if (mode !== 'webtoon') {
      setTimeout(() => this.initSwiper(), 0);
    }
  }

  toggleControls() {
    this.showControls.update((current) => !current);
  }

  tapZone(zone: 'left' | 'right') {
    if (zone === 'left') {
      this.readingMode() === 'reversed' ? this.goNextPage() : this.goPrevPage();
      return;
    }
    this.readingMode() === 'reversed' ? this.goPrevPage() : this.goNextPage();
  }

  toggleFullscreen() {
    if (!screenfull.isEnabled) return;
    screenfull.toggle();
  }

  toggleIncognito() {
    this.incognito.update((current) => {
      const next = !current;
      localStorage.setItem('np_reader_incognito', next ? '1' : '0');
      return next;
    });
  }

  onPageSlider(event: Event) {
    const target = event.target as HTMLInputElement;
    const next = Math.max(1, Math.min(this.pages().length, Number(target.value) || 1)) - 1;
    this.setPageIndex(next, true);
  }

  onWebtoonScroll() {
    if (this.readingMode() !== 'webtoon') return;
    const container = this.webtoonScroll?.nativeElement;
    if (!container || this.pages().length <= 1) return;

    const maxScroll = Math.max(1, container.scrollHeight - container.clientHeight);
    const ratio = container.scrollTop / maxScroll;
    const estimatedIndex = Math.round(ratio * (this.pages().length - 1));
    if (estimatedIndex !== this.pageIndex()) {
      this.pageIndex.set(estimatedIndex);
      this.progressUpdate$.next(estimatedIndex);
    }
  }

  goNextPage() {
    if (!this.canNextPage()) return;
    const next = this.readingMode() === 'reversed' ? this.pageIndex() - 1 : this.pageIndex() + 1;
    this.setPageIndex(next, true);
  }

  goPrevPage() {
    if (!this.canPrevPage()) return;
    const next = this.readingMode() === 'reversed' ? this.pageIndex() + 1 : this.pageIndex() - 1;
    this.setPageIndex(next, true);
  }

  goNextChapter() {
    const next = this.nextChapterId();
    if (!next) return;
    this.router.navigate([this.readBasePath(), this.toRouteParam(next)], {
      queryParams: {
        mangaId: this.mangaId(),
        title: this.title(),
      },
    });
  }

  goPrevChapter() {
    const prev = this.prevChapterId();
    if (!prev) return;
    this.router.navigate([this.readBasePath(), this.toRouteParam(prev)], {
      queryParams: {
        mangaId: this.mangaId(),
        title: this.title(),
      },
    });
  }

  sourceLabel() {
    const source = this.sourceId();
    if (source === 'mangadex') return 'MangaDex';
    if (source === 'weebcentral') return 'WeebCentral';
    if (source === 'asura') return 'AsuraScans';
    if (source === 'manhwatop') return 'ManhwaTop';
    if (source === 'readcomicsonline') return 'ReadComicsOnline';
    return source;
  }

  libraryRootPath() {
    return this.libraryMode() === 'comics' ? '/books/comics' : '/books/manga';
  }

  private readBasePath() {
    return this.libraryMode() === 'comics' ? '/books/comics/read' : '/books/manga/read';
  }

  private async loadChapter() {
    this.isLoading.set(true);
    this.externalUrl.set(null);

    const chapterId = this.chapterId();
    const parsed = parseSourceEntityId(chapterId);
    if (!parsed) {
      this.pages.set([]);
      this.isLoading.set(false);
      return;
    }

    // Try offline cache first (Kotatsu-style offline reading)
    if (this.mangaOffline.isAvailable(chapterId)) {
      const offlinePages = await this.mangaOffline.getAllPageUrls(chapterId);
      const validPages = offlinePages.filter((u): u is string => u !== null);
      if (validPages.length > 0) {
        this.pages.set(validPages);
        this.externalUrl.set(null);
        this.pageIndex.set(0);

        const preferred = localStorage.getItem('np_reader_mode') as ReaderMode | null;
        this.readingMode.set(
          preferred && ['webtoon', 'reversed', 'standard', 'double-page'].includes(preferred)
            ? (preferred as ReaderMode)
            : 'webtoon'
        );

        this.isLoading.set(false);
        if (this.mangaId() && this.isAuthenticated()) {
          this.loadProgress(chapterId);
        }
        if (this.readingMode() !== 'webtoon') {
          setTimeout(() => this.initSwiper(), 0);
        }
        return;
      }
    }

    const endpoint = `/api/v1/books/manga/source/${encodeURIComponent(parsed.sourceId)}/pages-by-id?chapterId=${encodeURIComponent(chapterId)}`;

    this.http.get<{ status: string; data: MangaPagesPayload }>(endpoint).subscribe({
      next: (response) => {
        this.pages.set(response.data.pages || []);
        this.externalUrl.set(response.data.externalUrl || null);
        this.pageIndex.set(0);

        const preferred = localStorage.getItem('np_reader_mode') as ReaderMode | null;
        if (preferred && ['webtoon', 'reversed', 'standard', 'double-page'].includes(preferred)) {
          this.readingMode.set(preferred);
        } else if (response.data.readerMode === 'webtoon') {
          this.readingMode.set('webtoon');
        } else if (response.data.readerMode === 'standard') {
          this.readingMode.set('standard');
        } else if (response.data.readerMode === 'reversed') {
          this.readingMode.set('reversed');
        } else if (response.data.readerMode === 'double-page') {
          this.readingMode.set('double-page');
        } else {
          this.readingMode.set('standard');
        }

        this.isLoading.set(false);

        if (this.mangaId() && this.isAuthenticated()) {
          this.loadProgress(chapterId);
        }

        if (this.readingMode() !== 'webtoon') {
          setTimeout(() => this.initSwiper(), 0);
        }
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  private loadChapterContext() {
    const mangaId = this.mangaId();
    if (!mangaId) {
      this.chapterList.set([]);
      this.prevChapterId.set(null);
      this.nextChapterId.set(null);
      return;
    }

    const parsed = parseSourceEntityId(mangaId);
    if (!parsed) {
      this.chapterList.set([]);
      this.prevChapterId.set(null);
      this.nextChapterId.set(null);
      return;
    }

    const endpoint = `/api/v1/books/manga/source/${encodeURIComponent(parsed.sourceId)}/chapters-by-id?mangaId=${encodeURIComponent(mangaId)}&limit=500`;

    this.http.get<{ status: string; data: MangaChapter[] }>(endpoint).subscribe({
      next: (response) => {
        const chapters = response.data || [];
        this.chapterList.set(chapters);
        this.resolveAdjacentChapters(chapters);
      },
      error: () => {
        this.chapterList.set([]);
        this.prevChapterId.set(null);
        this.nextChapterId.set(null);
      },
    });
  }

  private resolveAdjacentChapters(chapters: MangaChapter[]) {
    const currentId = this.chapterId();
    const index = chapters.findIndex((chapter) => chapter.id === currentId);
    if (index < 0) {
      this.prevChapterId.set(null);
      this.nextChapterId.set(null);
      return;
    }

    const isDescending = this.inferDescendingOrder(chapters);
    const nextIndex = isDescending ? index - 1 : index + 1;
    const prevIndex = isDescending ? index + 1 : index - 1;

    this.nextChapterId.set(chapters[nextIndex]?.id || null);
    this.prevChapterId.set(chapters[prevIndex]?.id || null);
  }

  private inferDescendingOrder(chapters: MangaChapter[]): boolean {
    const parseNumber = (chapter: MangaChapter) => {
      const value = Number(chapter.chapter || '');
      return Number.isFinite(value) ? value : null;
    };
    const first = chapters[0] ? parseNumber(chapters[0]) : null;
    const second = chapters[1] ? parseNumber(chapters[1]) : null;
    if (first === null || second === null) return true;
    return first > second;
  }

  private initSwiper() {
    if (this.readingMode() === 'webtoon') return;

    const element = this.swiperEl?.nativeElement;
    if (!element || this.pages().length === 0) return;

    if (element.swiper) {
      element.swiper.destroy(true, true);
    }

    Object.assign(element, {
      direction: 'horizontal',
      slidesPerView: 1,
      spaceBetween: 0,
      speed: 250,
      threshold: 12,
      resistanceRatio: 0.85,
      centeredSlides: false,
      watchSlidesProgress: true,
      lazy: true,
      zoom: { maxRatio: 3, minRatio: 1 },
      observer: true,
      observeParents: true,
      allowTouchMove: true,
      grabCursor: true,
      on: {
        slideChange: (swiper: any) => {
          const next = Number(swiper.activeIndex) || 0;
          this.pageIndex.set(next);
          this.progressUpdate$.next(next);
        },
      },
    });

    element.setAttribute('dir', this.readingMode() === 'reversed' ? 'rtl' : 'ltr');
    element.initialize();

    if (this.pageIndex() > 0) {
      element.swiper.slideTo(this.pageIndex(), 0);
    }
  }

  private setPageIndex(nextIndex: number, syncSwiper = false) {
    const clamped = Math.min(Math.max(nextIndex, 0), Math.max(this.pages().length - 1, 0));
    if (clamped === this.pageIndex()) return;

    this.pageIndex.set(clamped);
    this.progressUpdate$.next(clamped);

    if (this.readingMode() !== 'webtoon' && syncSwiper && this.swiperEl?.nativeElement?.swiper) {
      this.swiperEl.nativeElement.swiper.slideTo(clamped);
    }
  }

  private loadProgress(chapterId: string) {
    this.http.get<{ status: string; data: ReadingProgress | null }>(`/api/v1/books/manga/progress/${chapterId}`).subscribe({
      next: (response) => {
        if (!response.data) return;
        const index = Math.min(response.data.pageIndex, Math.max(0, this.pages().length - 1));
        this.pageIndex.set(index);
        if (this.readingMode() !== 'webtoon') {
          setTimeout(() => {
            if (this.swiperEl?.nativeElement?.swiper) {
              this.swiperEl.nativeElement.swiper.slideTo(index, 0);
            }
          }, 0);
        }
      },
    });
  }

  private saveProgress(pageIndex: number) {
    if (this.incognito()) return;
    if (!this.isAuthenticated() || !this.mangaId() || !this.chapterId() || this.pages().length === 0) return;
    this.http
      .post('/api/v1/books/manga/progress', {
        mangaId: this.mangaId(),
        chapterId: this.chapterId(),
        pageIndex,
        totalPages: this.pages().length,
        isCompleted: pageIndex >= this.pages().length - 1,
      })
      .subscribe();
  }

  private isAuthenticated() {
    return !!localStorage.getItem('token');
  }

  private toRouteParam(value: string) {
    return value;
  }

  private fromRouteParam(value: string | null): string | null {
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  private resolveLibraryMode() {
    const routePath = this.route.snapshot.routeConfig?.path || '';
    this.libraryMode.set(routePath.startsWith('books/comics') ? 'comics' : 'manga');
  }
}
