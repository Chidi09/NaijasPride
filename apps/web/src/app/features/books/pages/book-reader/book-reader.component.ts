import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Book } from '@naijaspride/types';
import screenfull from 'screenfull';
import { Subscription } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatSidenavModule } from '@angular/material/sidenav';

import { ReaderStateService } from '../../../../core/services/reader-state.service';
import { BookOfflineService } from '../../../../core/services/book-offline.service';
import { ReaderGesturesService } from '../../reader/services/reader-gestures.service';
import { ReaderService } from '../../reader/services/reader.service';
import { ReaderTtsService } from '../../reader/services/reader-tts.service';

import { ReaderToolbarComponent } from '../../reader/components/reader-toolbar.component';
import { ReaderSidebarComponent } from '../../reader/components/reader-sidebar.component';
import { EpubViewerComponent } from '../../reader/components/epub-viewer.component';
import { PdfViewerComponent } from '../../reader/components/pdf-viewer.component';

import type {
  HighlightColor,
  HighlightEntry,
  ReaderFlow,
  ReaderTheme,
  SearchResultEntry,
  TocEntry,
} from '../../reader/models/reader.models';

@Component({
  selector: 'app-book-reader',
  standalone: true,
  imports: [
    CommonModule,
    MatSidenavModule,
    MatButtonModule,
    ReaderToolbarComponent,
    ReaderSidebarComponent,
    EpubViewerComponent,
    PdfViewerComponent,
  ],
  providers: [ReaderService],
  styles: [
    `
      .np-book-reader-shell {
        --np-reader-bg: #0b0b0b;
        --np-reader-fg: #f7f2ec;
        --np-reader-muted: rgba(255, 255, 255, 0.7);
        --np-reader-surface: rgba(0, 0, 0, 0.75);
        --np-reader-border: rgba(255, 255, 255, 0.12);
        --np-reader-accent: #800020;
      }

      .np-book-reader-shell[data-theme='paper'] {
        --np-reader-bg: #f7f2ec;
        --np-reader-fg: #1d1416;
        --np-reader-muted: rgba(29, 20, 22, 0.65);
        --np-reader-surface: rgba(255, 255, 255, 0.86);
        --np-reader-border: rgba(29, 20, 22, 0.14);
      }

      .np-book-reader-shell[data-theme='sepia'] {
        --np-reader-bg: #f4eadb;
        --np-reader-fg: #2b201b;
        --np-reader-muted: rgba(43, 32, 27, 0.66);
        --np-reader-surface: rgba(255, 255, 255, 0.72);
        --np-reader-border: rgba(43, 32, 27, 0.14);
      }

      .np-book-reader-shell[data-theme='night'] {
        --np-reader-bg: #070708;
        --np-reader-fg: #f2efe9;
        --np-reader-muted: rgba(242, 239, 233, 0.68);
        --np-reader-surface: rgba(8, 8, 10, 0.88);
        --np-reader-border: rgba(255, 255, 255, 0.12);
      }

      .np-book-reader-shell {
        background: var(--np-reader-bg);
        color: var(--np-reader-fg);
      }

      .np-reader-viewer {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }

      .np-turn-next {
        animation: npTurnNext 240ms ease;
      }

      .np-turn-prev {
        animation: npTurnPrev 240ms ease;
      }

      @keyframes npTurnNext {
        0% {
          transform: translateX(0);
          filter: brightness(1);
        }
        30% {
          transform: translateX(-10px);
          filter: brightness(0.98);
        }
        100% {
          transform: translateX(0);
          filter: brightness(1);
        }
      }

      @keyframes npTurnPrev {
        0% {
          transform: translateX(0);
          filter: brightness(1);
        }
        30% {
          transform: translateX(10px);
          filter: brightness(0.98);
        }
        100% {
          transform: translateX(0);
          filter: brightness(1);
        }
      }
    `,
  ],
  template: `
    <div
      class="np-book-reader-shell relative h-screen w-screen overflow-hidden"
      [attr.data-theme]="theme()"
      (mousemove)="bumpControls()"
      (touchstart)="bumpControls()"
    >
      <mat-drawer-container class="h-full w-full" autosize>
        <mat-drawer position="end" mode="over" [opened]="drawerOpen()" (closedStart)="drawerOpen.set(false)">
          <app-reader-sidebar
            [bookTitle]="book()?.title || ''"
            [readerType]="readerType()"
            [flow]="flow()"
            [spread]="spread()"
            [theme]="theme()"
            [fontFamily]="fontFamily()"
            [fontSize]="fontSize()"
            [lineHeight]="lineHeight()"
            [autoScrollEnabled]="autoScrollEnabled()"
            [autoScrollSpeed]="autoScrollSpeed()"
            [pdfPage]="pdfPage()"
            [pdfPageCount]="pdfPageCount()"
            [pdfZoom]="pdfZoom()"
            [currentCfi]="currentCfi()"
            [bookmarks]="reader.bookmarks()"
            [highlights]="reader.highlights()"
            [highlightMode]="highlightMode()"
            [highlightColor]="highlightColor()"
            [toc]="toc()"
            [searchText]="searchText"
            (searchTextChange)="searchText = $event"
            [isSearching]="isSearching()"
            [searchStatus]="searchStatus()"
            [searchError]="searchError()"
            [searchResults]="searchResults()"

            [ttsAvailable]="tts.available()"
            [ttsSpeaking]="tts.state().speaking"
            [ttsPaused]="tts.state().paused"
            [ttsRate]="ttsRate()"
            [ttsError]="tts.state().lastError"
            [ttsVoices]="tts.voices()"
            [ttsVoiceUri]="ttsVoiceUri()"
            (close)="drawerOpen.set(false)"
            (runSearch)="runSearch()"
            (goToHref)="goToHref($event)"
            (goToCfi)="goToCfi($event)"
            (setFlow)="setFlow($event)"
            (setSpread)="setSpread($event)"
            (setTheme)="setTheme($event)"
            (setFontFamily)="setFontFamily($event)"
            (setFontSize)="setFontSize($event)"
            (setLineHeight)="setLineHeight($event)"
            (toggleAutoScroll)="toggleAutoScroll()"
            (setAutoScrollSpeed)="setAutoScrollSpeed($event)"
            (setPdfZoom)="setPdfZoom($event)"
            (addBookmark)="addBookmark()"
            (clearBookmarks)="clearBookmarks()"
            (toggleHighlightMode)="toggleHighlightMode()"
            (setHighlightColor)="setHighlightColor($event)"
            (goToHighlight)="goToHighlight($event)"
            (deleteHighlight)="deleteHighlight($event)"
            (clearHighlights)="clearHighlights()"

            (ttsStart)="startTts()"
            (ttsTogglePause)="tts.togglePause()"
            (ttsStop)="tts.stop()"
            (ttsRateChange)="setTtsRate($event)"
            (ttsVoiceChange)="setTtsVoiceUri($event)"
          />
        </mat-drawer>

        <mat-drawer-content>
          <app-reader-toolbar
            [show]="showControls()"
            [title]="book()?.title || ''"
            [subtitle]="book()?.author || ''"
            (fullscreen)="toggleFullscreen()"
            (openPanel)="drawerOpen.set(true)"
          />

          @if (isLoading()) {
            <div class="flex h-full items-center justify-center text-sm text-[var(--np-reader-muted)]">
              Loading book...
            </div>
          } @else if (error()) {
            <div class="flex h-full items-center justify-center px-6">
              <div class="max-w-xl rounded border border-[var(--np-reader-border)] bg-[var(--np-reader-surface)] p-5 text-center text-sm">
                <p class="font-semibold">Reader error</p>
                <p class="mt-2 text-[var(--np-reader-muted)]">{{ error() }}</p>
                @if (book()?.downloadUrl) {
                  <a
                    class="mt-4 inline-block rounded border border-[var(--np-reader-border)] px-4 py-2 text-xs"
                    [href]="book()!.downloadUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open download link
                  </a>
                }
              </div>
            </div>
          } @else {
            <div class="np-reader-viewer" (click)="toggleControls()">
              <div
                #viewerWrap
                class="h-full w-full"
                [class.np-turn-next]="turnAnim() === 'next'"
                [class.np-turn-prev]="turnAnim() === 'prev'"
              >
                @if (readerType() === 'epub') {
                  <app-epub-viewer
                    [slug]="slug()"
                    [fileUrl]="fileUrl()"
                    [flow]="flow()"
                    [spread]="spread()"
                    [theme]="theme()"
                    [fontFamily]="fontFamily()"
                    [fontSize]="fontSize()"
                    [lineHeight]="lineHeight()"
                    [autoScrollEnabled]="autoScrollEnabled()"
                    [autoScrollSpeed]="autoScrollSpeed()"
                    [serverProgress]="reader.serverProgress()"
                    [serverProgressLoaded]="reader.serverProgressLoaded()"
                    [highlightMode]="highlightMode()"
                    [highlightColor]="highlightColor()"
                    [highlights]="reader.highlights()"
                    (readyChange)="epubReady.set($event)"
                    (loadingChange)="viewerLoading.set($event)"
                    (errorChange)="onViewerError($event)"
                    (tocChange)="toc.set($event)"
                    (currentCfiChange)="onCurrentCfi($event)"
                    (progressChange)="progress.set($event)"
                    (searchingChange)="isSearching.set($event)"
                    (searchErrorChange)="searchError.set($event)"
                    (searchResultsChange)="searchResults.set($event)"
                    (createHighlight)="onCreateEpubHighlight($event)"
                  />
                } @else {
                  <app-pdf-viewer
                    [slug]="slug()"
                    [fileUrl]="fileUrl()"
                    [zoom]="pdfZoom()"
                    [cacheVersion]="book()?.updatedAt || ''"
                    [serverProgress]="reader.serverProgress()"
                    [serverProgressLoaded]="reader.serverProgressLoaded()"
                    [highlightMode]="highlightMode()"
                    [highlightColor]="highlightColor()"
                    [highlights]="reader.highlights()"
                    (loadingChange)="viewerLoading.set($event)"
                    (errorChange)="onViewerError($event)"
                    (pageChange)="pdfPage.set($event)"
                    (pageCountChange)="pdfPageCount.set($event)"
                    (progressChange)="progress.set($event)"
                    (currentCfiChange)="onCurrentCfi($event)"
                    (searchingChange)="isSearching.set($event)"
                    (searchStatusChange)="searchStatus.set($event)"
                    (searchErrorChange)="searchError.set($event)"
                    (searchResultsChange)="searchResults.set($event)"
                    (createHighlight)="onCreatePdfHighlight($event)"
                  />
                }

                @if (!highlightMode() && (readerType() === 'pdf' || flow() === 'paginated')) {
                  <button
                    type="button"
                    (click)="prev()"
                    class="absolute inset-y-0 left-0 z-20 w-1/4 bg-transparent"
                    aria-label="Previous page"
                  ></button>
                  <button
                    type="button"
                    (click)="toggleControls()"
                    class="absolute inset-y-0 left-1/4 z-20 w-2/4 bg-transparent"
                    aria-label="Toggle controls"
                  ></button>
                  <button
                    type="button"
                    (click)="next()"
                    class="absolute inset-y-0 right-0 z-20 w-1/4 bg-transparent"
                    aria-label="Next page"
                  ></button>
                }
              </div>
            </div>
          }

          <div
            class="pointer-events-none fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--np-reader-border)] bg-[var(--np-reader-surface)] transition-transform duration-300"
            [class.translate-y-full]="!showControls()"
          >
            <div class="pointer-events-auto mx-auto w-full max-w-5xl px-4 py-4">
              <div class="mb-3 flex items-center justify-between text-[11px] text-[var(--np-reader-muted)]">
                <span>Progress</span>
                <span>{{ (progress() * 100) | number:'1.0-0' }}%</span>
              </div>

              <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
                <button mat-stroked-button type="button" (click)="prev()" [disabled]="!canPrev()">Prev</button>
                <button mat-flat-button color="primary" type="button" (click)="next()" [disabled]="!canNext()">Next</button>
                <button
                  mat-stroked-button
                  type="button"
                  (click)="addBookmark()"
                  [disabled]="readerType() === 'epub' && !currentCfi()"
                >
                  Bookmark
                </button>
                <button mat-stroked-button type="button" (click)="drawerOpen.set(true)">TOC</button>
              </div>
            </div>
          </div>
        </mat-drawer-content>
      </mat-drawer-container>
    </div>
  `,
})
export class BookReaderComponent implements OnInit, AfterViewInit, OnDestroy {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private readerState = inject(ReaderStateService);
  private gestures = inject(ReaderGesturesService);
  private bookOffline = inject(BookOfflineService);
  readonly tts = inject(ReaderTtsService);

  readonly reader = inject(ReaderService);

  @ViewChild('viewerWrap') viewerWrap?: ElementRef<HTMLElement>;
  @ViewChild(EpubViewerComponent) epubViewer?: EpubViewerComponent;
  @ViewChild(PdfViewerComponent) pdfViewer?: PdfViewerComponent;
  @ViewChild(ReaderSidebarComponent) sidebar?: ReaderSidebarComponent;

  drawerOpen = signal(false);
  showControls = signal(true);
  turnAnim = signal<'next' | 'prev' | null>(null);

  book = signal<Book | null>(null);
  slug = signal<string | null>(null);
  fileUrl = signal<string | null>(null);
  readerType = signal<'epub' | 'pdf'>('epub');

  toc = signal<TocEntry[]>([]);
  currentCfi = signal<string | null>(null);
  progress = signal(0);

  pdfPage = signal(1);
  pdfPageCount = signal(0);

  metaLoading = signal(true);
  viewerLoading = signal(false);
  isLoading = computed(() => this.metaLoading() || this.viewerLoading());
  error = signal<string | null>(null);
  epubReady = signal(false);

  searchText = '';
  isSearching = signal(false);
  searchStatus = signal<string | null>(null);
  searchError = signal<string | null>(null);
  searchResults = signal<SearchResultEntry[]>([]);

  highlightMode = signal(false);
  highlightColor = computed<HighlightColor>(
    () => (this.reader.settings().highlightColor as HighlightColor) || 'yellow'
  );

  private controlsTimer: ReturnType<typeof setTimeout> | null = null;
  private teardownGestures: (() => void) | null = null;
  private routeSub: Subscription | null = null;

  flow = computed(() => this.reader.settings().flow);
  spread = computed(() => this.reader.settings().spread);
  theme = computed(() => this.reader.settings().theme);
  fontFamily = computed(() => this.reader.settings().fontFamily);
  fontSize = computed(() => this.reader.settings().fontSize);
  lineHeight = computed(() => this.reader.settings().lineHeight);
  autoScrollEnabled = computed(() => this.reader.settings().autoScrollEnabled);
  autoScrollSpeed = computed(() => this.reader.settings().autoScrollSpeed);
  pdfZoom = computed(() => this.reader.settings().pdfZoom);
  ttsRate = computed(() => this.reader.settings().ttsRate || 1.0);
  ttsVoiceUri = computed(() => this.reader.settings().ttsVoiceUri || null);

  canPrev = computed(() => {
    if (this.isLoading() || !!this.error()) return false;
    if (this.readerType() === 'pdf') return this.pdfPage() > 1;
    return this.epubReady();
  });

  canNext = computed(() => {
    if (this.isLoading() || !!this.error()) return false;
    if (this.readerType() === 'pdf') {
      return this.pdfPageCount() > 0 && this.pdfPage() < this.pdfPageCount();
    }
    return this.epubReady();
  });

  ngOnInit(): void {
    this.readerState.enterReader();

    this.routeSub = this.route.paramMap.subscribe((params) => {
      const slug = params.get('slug');
      if (!slug) return;
      this.slug.set(slug);
      this.fileUrl.set(this.bookFileUrl(slug));
      this.reader.setSlug(slug);

      this.error.set(null);
      this.toc.set([]);
      this.currentCfi.set(null);
      this.progress.set(0);
      this.searchError.set(null);
      this.searchResults.set([]);
      this.isSearching.set(false);

      this.loadBook(slug);

      // Keep TTS rate in sync with persisted setting.
      this.tts.setRate(this.ttsRate());
      this.tts.setVoiceUri(this.ttsVoiceUri());
    });
  }

  ngAfterViewInit(): void {
    const wrap = this.viewerWrap?.nativeElement;
    if (wrap) {
      this.teardownGestures = this.gestures.setup(wrap, {
        onTapCenter: () => this.toggleControls(),
        onSwipeLeft: () => {
          if (this.highlightMode()) return;
          this.next();
        },
        onSwipeRight: () => {
          if (this.highlightMode()) return;
          this.prev();
        },
      });
    }
  }

  ngOnDestroy(): void {
    this.readerState.exitReader();
    this.reader.destroy();
    this.routeSub?.unsubscribe();
    this.routeSub = null;

    if (this.controlsTimer) {
      clearTimeout(this.controlsTimer);
      this.controlsTimer = null;
    }
    this.teardownGestures?.();
    this.teardownGestures = null;

    this.tts.stop();
  }

  @HostListener('window:keyup', ['$event'])
  onKey(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    const tag = (target?.tagName || '').toLowerCase();
    const isTypingTarget = tag === 'input' || tag === 'textarea' || !!target?.isContentEditable;

    const isMeta = event.metaKey || event.ctrlKey;

    if (isMeta && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      this.drawerOpen.set(true);
      setTimeout(() => this.sidebar?.focusSearch(), 0);
      return;
    }

    if (isMeta && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      this.addBookmark();
      return;
    }

    if (isMeta && event.key.toLowerCase() === 'h') {
      event.preventDefault();
      this.toggleHighlightMode();
      return;
    }

    if (!isTypingTarget && event.key === ' ') {
      if (this.tts.available() && this.tts.state().speaking) {
        event.preventDefault();
        this.tts.togglePause();
        return;
      }
    }

    if (event.key === 'ArrowRight') this.next();
    if (event.key === 'ArrowLeft') this.prev();
    if (!isTypingTarget && event.key.toLowerCase() === 'f') this.toggleFullscreen();
    if (event.key === 'Escape' && this.drawerOpen()) this.drawerOpen.set(false);
  }

  toggleFullscreen(): void {
    if (!screenfull.isEnabled) return;
    screenfull.toggle();
  }

  bumpControls(): void {
    this.showControls.set(true);
    if (this.controlsTimer) {
      clearTimeout(this.controlsTimer);
    }
    this.controlsTimer = setTimeout(() => this.showControls.set(false), 2200);
  }

  toggleControls(): void {
    this.showControls.update((current) => !current);
    this.bumpControls();
  }

  private loadBook(slug: string): void {
    this.metaLoading.set(true);
    this.book.set(null);

    this.http.get<{ status: string; data: Book }>(`/api/v1/books/${encodeURIComponent(slug)}`).subscribe({
      next: (response) => {
        const data = response.data;
        this.book.set(data);

        const format = (data?.format || '').trim().toLowerCase();
        this.readerType.set(format === 'pdf' ? 'pdf' : 'epub');

        const normalizedDownloadUrl = (data?.downloadUrl || '').trim();
        const hasLocalDownloadKey = normalizedDownloadUrl.startsWith('/api/v1/books/download?key=');

        // Use offline cached file when available (Kotatsu-style offline reading)
        if (data?.id && this.bookOffline.isAvailable(data.id)) {
          this.fileUrl.set(this.bookOffline.getOfflineFileUrl(data.id));
        } else if (hasLocalDownloadKey) {
          // Prefer key-based endpoint for mirrored books; this avoids slug-specific
          // proxy branches and keeps LN/EPUB reading stable.
          const delimiter = normalizedDownloadUrl.includes('?') ? '&' : '?';
          this.fileUrl.set(`${normalizedDownloadUrl}${delimiter}t=${Date.now()}`);
        } else {
          this.fileUrl.set(this.bookFileUrl(slug));
        }

        this.metaLoading.set(false);
      },
      error: (err) => {
        const message = err?.error?.message || 'Failed to load book metadata';
        this.error.set(message);
        this.metaLoading.set(false);
      },
    });
  }

  private bookFileUrl(slug: string): string {
    const base = `/api/v1/books/${encodeURIComponent(slug)}/file?disposition=inline`;
    return `${base}&t=${Date.now()}`;
  }

  onViewerError(message: string | null): void {
    if (message) {
      this.error.set(message);
    }
  }

  onCurrentCfi(cfi: string | null): void {
    this.currentCfi.set(cfi);
  }

  next(): void {
    const shouldAnim = this.readerType() === 'pdf' || this.flow() === 'paginated';
    if (shouldAnim) {
      this.turnAnim.set('next');
      setTimeout(() => this.turnAnim.set(null), 260);
    }
    this.bumpControls();

    if (this.readerType() === 'pdf') {
      this.pdfViewer?.next();
      return;
    }
    this.epubViewer?.next();
  }

  prev(): void {
    const shouldAnim = this.readerType() === 'pdf' || this.flow() === 'paginated';
    if (shouldAnim) {
      this.turnAnim.set('prev');
      setTimeout(() => this.turnAnim.set(null), 260);
    }
    this.bumpControls();

    if (this.readerType() === 'pdf') {
      this.pdfViewer?.prev();
      return;
    }
    this.epubViewer?.prev();
  }

  goToHref(href: string): void {
    this.drawerOpen.set(false);
    this.epubViewer?.goToHref(href);
    this.bumpControls();
  }

  goToCfi(cfi: string): void {
    this.drawerOpen.set(false);

    if (this.readerType() === 'pdf') {
      const match = cfi.match(/pdf-page:(\d+)/i);
      if (!match) return;
      const page = Number.parseInt(match[1] || '', 10);
      if (!Number.isFinite(page)) return;
      this.pdfViewer?.goToPage(page);
      this.bumpControls();
      return;
    }

    this.epubViewer?.goToCfi(cfi);
    this.bumpControls();
  }

  async runSearch(): Promise<void> {
    const query = this.searchText.trim();
    if (!query) return;

    if (this.readerType() === 'pdf') {
      await this.pdfViewer?.search(query);
      return;
    }

    await this.epubViewer?.search(query);
  }

  async startTts(): Promise<void> {
    this.tts.setRate(this.ttsRate());
    this.tts.setVoiceUri(this.ttsVoiceUri());

    if (this.readerType() === 'pdf') {
      const text = await this.pdfViewer?.getReadableText(5000);
      this.tts.speak(text || '');
      return;
    }

    const selected = this.epubViewer?.getSelectedText(3500) || '';
    const text = selected || this.epubViewer?.getReadableText(7000) || '';
    this.tts.speak(text);
  }

  setTtsRate(value: number | null): void {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    this.reader.patchSettings({ ttsRate: next });
    this.tts.setRate(next);
  }

  setTtsVoiceUri(value: string | null): void {
    const uri = typeof value === 'string' ? value : null;
    this.reader.patchSettings({ ttsVoiceUri: uri });
    this.tts.setVoiceUri(uri);
  }

  addBookmark(): void {
    const slug = this.slug();
    const cfi = this.currentCfi();
    const title = this.book()?.title || 'Bookmark';
    if (!slug || !cfi) return;

    this.reader.addBookmark(cfi, `${title} • ${new Date().toLocaleString()}`);
  }

  clearBookmarks(): void {
    this.reader.clearBookmarks();
  }

  toggleHighlightMode(): void {
    this.highlightMode.update((value) => !value);
  }

  setHighlightColor(color: HighlightColor): void {
    this.reader.patchSettings({ highlightColor: color });
  }

  onCreateEpubHighlight(payload: { cfiRange: string; excerpt: string; color: HighlightColor }): void {
    const slug = this.slug();
    if (!slug) return;
    const cfiRange = (payload.cfiRange || '').trim();
    if (!cfiRange) return;

    const entry: HighlightEntry = {
      id: this.newId(),
      kind: 'epub',
      cfiRange,
      excerpt: payload.excerpt || 'Highlight',
      color: payload.color,
      createdAt: Date.now(),
    };
    this.reader.addHighlight(entry);
  }

  onCreatePdfHighlight(payload: { page: number; rect: { x: number; y: number; w: number; h: number }; color: HighlightColor }): void {
    const slug = this.slug();
    if (!slug) return;
    const page = Math.max(1, Math.floor(Number(payload.page) || 1));

    const entry: HighlightEntry = {
      id: this.newId(),
      kind: 'pdf',
      page,
      rect: payload.rect,
      color: payload.color,
      createdAt: Date.now(),
    };
    this.reader.addHighlight(entry);
  }

  private newId(): string {
    try {
      const runtimeCrypto = globalThis.crypto;
      if (runtimeCrypto?.randomUUID) {
        return runtimeCrypto.randomUUID();
      }
    } catch {
      // ignore
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  goToHighlight(hl: HighlightEntry): void {
    this.drawerOpen.set(false);
    if (hl.kind === 'pdf') {
      this.pdfViewer?.goToPage(hl.page);
    } else {
      this.epubViewer?.goToCfi(hl.cfiRange);
    }
    this.bumpControls();
  }

  deleteHighlight(id: string): void {
    this.reader.removeHighlight(id);
  }

  clearHighlights(): void {
    this.reader.clearHighlights();
  }

  setFlow(flow: ReaderFlow): void {
    if (flow === this.flow()) return;
    this.reader.patchSettings({
      flow,
      autoScrollEnabled: flow === 'scrolled' ? this.autoScrollEnabled() : false,
    });
  }

  setSpread(mode: 'auto' | 'single' | 'double'): void {
    if (mode === this.spread()) return;
    this.reader.patchSettings({ spread: mode });
  }

  setFontFamily(mode: 'serif' | 'sans' | 'mono'): void {
    if (mode === this.fontFamily()) return;
    this.reader.patchSettings({ fontFamily: mode });
  }

  setTheme(theme: ReaderTheme): void {
    if (theme === this.theme()) return;
    this.reader.patchSettings({ theme });
  }

  setFontSize(value: number | null): void {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    this.reader.patchSettings({ fontSize: next });
  }

  setLineHeight(value: number | null): void {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    this.reader.patchSettings({ lineHeight: next });
  }

  toggleAutoScroll(): void {
    if (this.flow() !== 'scrolled') return;
    this.reader.patchSettings({ autoScrollEnabled: !this.autoScrollEnabled() });
  }

  setAutoScrollSpeed(value: number | null): void {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    this.reader.patchSettings({ autoScrollSpeed: next });
  }

  setPdfZoom(value: number | null): void {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    this.reader.patchSettings({ pdfZoom: next });
  }
}
