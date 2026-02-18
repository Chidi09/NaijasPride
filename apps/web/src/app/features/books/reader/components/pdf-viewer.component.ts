import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';

import { ReaderProgressService } from '../services/reader-progress.service';
import { ReaderStorageService } from '../services/reader-storage.service';
import type { HighlightColor, HighlightEntry, SearchResultEntry } from '../models/reader.models';
import { PdfSearchIndexService } from '../services/pdf-search-index.service';

type ServerProgress = { page: number; updatedAt: number } | null;

@Component({
  selector: 'app-pdf-viewer',
  standalone: true,
  imports: [CommonModule],
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
    `,
  ],
  template: `
    <div
      #wrap
      class="relative flex h-full w-full items-center justify-center"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp($event)"
      (pointercancel)="onPointerUp($event)"
    >
      <canvas #canvas class="max-h-full max-w-full"></canvas>

      @if (selectionBox) {
        <div
          class="pointer-events-none absolute border-2 border-[var(--np-reader-accent)] bg-[color:rgba(128,0,32,0.12)]"
          [style.left.px]="selectionBox.left"
          [style.top.px]="selectionBox.top"
          [style.width.px]="selectionBox.width"
          [style.height.px]="selectionBox.height"
        ></div>
      }
    </div>
  `,
})
export class PdfViewerComponent implements AfterViewInit, OnChanges, OnDestroy {
  private storage = inject(ReaderStorageService);
  private progressApi = inject(ReaderProgressService);
  private searchIndex = inject(PdfSearchIndexService);

  @ViewChild('canvas') canvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('wrap') wrap?: ElementRef<HTMLElement>;

  @Input() slug: string | null = null;
  @Input() fileUrl: string | null = null;
  @Input() zoom = 1.15;
  @Input() cacheVersion: string | null = null;

  @Input() serverProgress: ServerProgress = null;
  @Input() serverProgressLoaded = false;

  @Input() highlightMode = false;
  @Input() highlightColor: HighlightColor = 'yellow';
  @Input() highlights: HighlightEntry[] = [];

  @Output() loadingChange = new EventEmitter<boolean>();
  @Output() errorChange = new EventEmitter<string | null>();
  @Output() pageChange = new EventEmitter<number>();
  @Output() pageCountChange = new EventEmitter<number>();
  @Output() progressChange = new EventEmitter<number>();
  @Output() currentCfiChange = new EventEmitter<string | null>();

  @Output() searchingChange = new EventEmitter<boolean>();
  @Output() searchStatusChange = new EventEmitter<string | null>();
  @Output() searchErrorChange = new EventEmitter<string | null>();
  @Output() searchResultsChange = new EventEmitter<SearchResultEntry[]>();

  @Output() createHighlight = new EventEmitter<{ page: number; rect: { x: number; y: number; w: number; h: number }; color: HighlightColor }>();

  private viewReady = false;
  private initKey: string | null = null;

  private pdfLibPromise: Promise<any> | null = null;
  private pdfDoc: any = null;
  private rendering = false;
  private currentPage = 1;
  private totalPages = 0;

  private pageTextCache = new Map<number, string>();
  private pageTextInflight = new Map<number, Promise<string>>();
  private searchId = 0;

  private lastSearchQuery: string | null = null;
  private highlightUntil = 0;
  private pageTextContentCache = new Map<number, any>();

  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  selectionBox: { left: number; top: number; width: number; height: number } | null = null;
  private drag: {
    pointerId: number;
    startX: number;
    startY: number;
    canvasRect: DOMRect;
  } | null = null;

  ngAfterViewInit(): void {
    this.viewReady = true;
    void this.ensureInit();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.viewReady) return;

    const shouldReinit = 'fileUrl' in changes || 'slug' in changes || 'cacheVersion' in changes;
    if (shouldReinit) {
      void this.ensureInit();
      return;
    }

    if ('zoom' in changes) {
      void this.renderPage(this.currentPage);
    }

    if ('highlights' in changes) {
      void this.renderPage(this.currentPage);
    }

    if ('serverProgress' in changes || 'serverProgressLoaded' in changes) {
      // If we haven't applied a page yet, ensureInit will handle start page.
    }
  }

  ngOnDestroy(): void {
    this.destroy();
  }

  next(): void {
    this.goToPage(this.currentPage + 1);
  }

  prev(): void {
    this.goToPage(this.currentPage - 1);
  }

  async getReadableText(maxChars = 4000): Promise<string> {
    const n = Math.max(200, Math.min(40_000, Math.floor(maxChars)));
    if (!this.pdfDoc) return '';
    try {
      const text = await this.getPageText(this.currentPage);
      return text.slice(0, n);
    } catch {
      return '';
    }
  }

  goToPage(page: number): void {
    const next = Math.max(1, Math.min(this.totalPages || 1, Math.floor(page)));
    if (next === this.currentPage) return;
    void this.renderPage(next);
  }

  onPointerDown(event: PointerEvent): void {
    if (!this.highlightMode) return;
    const canvas = this.canvas?.nativeElement;
    if (!canvas) return;
    if (event.pointerType !== 'touch' && event.button !== 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;

    event.preventDefault();
    event.stopPropagation();

    this.drag = {
      pointerId: event.pointerId,
      startX: x,
      startY: y,
      canvasRect: rect,
    };
    this.selectionBox = { left: x - rect.left, top: y - rect.top, width: 0, height: 0 };

    try {
      (event.target as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.highlightMode) return;
    if (!this.drag) return;
    if (event.pointerId !== this.drag.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    const rect = this.drag.canvasRect;
    const x = Math.max(rect.left, Math.min(rect.right, event.clientX));
    const y = Math.max(rect.top, Math.min(rect.bottom, event.clientY));

    const left = Math.min(this.drag.startX, x) - rect.left;
    const top = Math.min(this.drag.startY, y) - rect.top;
    const width = Math.abs(x - this.drag.startX);
    const height = Math.abs(y - this.drag.startY);
    this.selectionBox = { left, top, width, height };
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.highlightMode) return;
    if (!this.drag) return;
    if (event.pointerId !== this.drag.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    const canvas = this.canvas?.nativeElement;
    const rect = this.drag.canvasRect;
    const box = this.selectionBox;
    this.drag = null;
    this.selectionBox = null;

    if (!canvas || !box) return;
    if (box.width < 8 || box.height < 8) return;

    const sx = rect.width > 0 ? canvas.width / rect.width : 1;
    const sy = rect.height > 0 ? canvas.height / rect.height : 1;

    const x = box.left * sx;
    const y = box.top * sy;
    const w = box.width * sx;
    const h = box.height * sy;

    const nx = canvas.width > 0 ? x / canvas.width : 0;
    const ny = canvas.height > 0 ? y / canvas.height : 0;
    const nw = canvas.width > 0 ? w / canvas.width : 0;
    const nh = canvas.height > 0 ? h / canvas.height : 0;

    this.createHighlight.emit({
      page: this.currentPage,
      rect: {
        x: Math.max(0, Math.min(1, nx)),
        y: Math.max(0, Math.min(1, ny)),
        w: Math.max(0, Math.min(1, nw)),
        h: Math.max(0, Math.min(1, nh)),
      },
      color: this.highlightColor,
    });
  }

  async search(query: string): Promise<void> {
    const q = (query || '').trim();
    if (!q) return;
    if (!this.pdfDoc) {
      this.searchErrorChange.emit('Search is not available yet.');
      return;
    }

    const mySearchId = ++this.searchId;
    const needle = q.toLowerCase();

    this.lastSearchQuery = q;
    this.highlightUntil = Date.now() + 5 * 60 * 1000;

    this.searchingChange.emit(true);
    this.searchStatusChange.emit(null);
    this.searchErrorChange.emit(null);
    this.searchResultsChange.emit([]);

    const results: SearchResultEntry[] = [];
    const maxResults = 80;

    try {
      const total = this.totalPages || Number(this.pdfDoc?.numPages) || 0;
      let lastStatusAt = 0;
      for (let page = 1; page <= total; page++) {
        if (mySearchId !== this.searchId) return; // cancelled
        if (results.length >= maxResults) break;

        const now = Date.now();
        if (now - lastStatusAt > 120) {
          lastStatusAt = now;
          this.searchStatusChange.emit(`Searching page ${page}/${total} (${results.length} hits)...`);
        }

        const text = await this.getPageText(page);
        const hay = text.toLowerCase();
        let fromIndex = 0;
        let matchesForPage = 0;

        while (results.length < maxResults) {
          const idx = hay.indexOf(needle, fromIndex);
          if (idx < 0) break;
          matchesForPage++;
          if (matchesForPage > 3) break;

          const excerpt = this.buildExcerpt(text, idx, needle.length);
          results.push({
            cfi: `pdf-page:${page}`,
            href: `Page ${page}`,
            excerpt,
          });
          fromIndex = idx + needle.length;
        }

        if (page % 6 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      if (mySearchId !== this.searchId) return;
      this.searchResultsChange.emit(results);
    } catch (error) {
      if (mySearchId !== this.searchId) return;
      this.searchErrorChange.emit(error instanceof Error ? error.message : 'Search failed');
    } finally {
      if (mySearchId === this.searchId) {
        this.searchingChange.emit(false);
        this.searchStatusChange.emit(null);
      }
    }
  }

  private async ensureInit(): Promise<void> {
    const slug = this.slug;
    const url = this.fileUrl;
    if (!slug || !url || !this.canvas?.nativeElement) {
      this.destroy();
      return;
    }

    const key = [slug, url].join('|');
    if (this.initKey === key && this.pdfDoc) {
      return;
    }

    this.initKey = key;
    this.destroy();

    this.loadingChange.emit(true);
    this.errorChange.emit(null);
    this.pageCountChange.emit(0);
    this.pageChange.emit(1);
    this.progressChange.emit(0);
    this.currentCfiChange.emit(null);

    try {
      const pdfjsLib = await this.getPdfLib();
      const loadingTask = pdfjsLib.getDocument({ url });
      this.pdfDoc = await loadingTask.promise;

      this.totalPages = Number(this.pdfDoc?.numPages) || 0;
      this.pageCountChange.emit(this.totalPages);

      const local = this.storage.loadPdfProgress(slug);
      const server = this.serverProgress;

      const localAt = local?.at || 0;
      const serverAt = server?.updatedAt || 0;

      const startPage =
        server && serverAt >= localAt && server.page
          ? server.page
          : local?.page
            ? local.page
            : 1;

      const nextPage = Math.max(1, Math.min(this.totalPages || 1, Math.floor(startPage)));
      await this.renderPage(nextPage);
      this.loadingChange.emit(false);
    } catch (error) {
      this.loadingChange.emit(false);
      this.errorChange.emit(error instanceof Error ? error.message : 'Failed to open PDF');
    }
  }

  private destroy(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.pdfDoc = null;
    this.totalPages = 0;
    this.currentPage = 1;
    this.rendering = false;

    this.pageTextCache.clear();
    this.pageTextInflight.clear();
    this.pageTextContentCache.clear();
    this.searchId++;
    this.lastSearchQuery = null;
    this.highlightUntil = 0;

    const canvas = this.canvas?.nativeElement;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  private async getPageText(page: number): Promise<string> {
    const cached = this.pageTextCache.get(page);
    if (cached != null) return cached;

    const slug = this.slug;
    const version = (this.cacheVersion || '').trim();
    if (slug && version) {
      const fromDb = await this.searchIndex.getPageText({ slug, version, page });
      if (fromDb != null) {
        this.pageTextCache.set(page, fromDb);
        return fromDb;
      }
    }

    const inflight = this.pageTextInflight.get(page);
    if (inflight) return inflight;

    const promise = (async () => {
      const pdfPage = await this.pdfDoc.getPage(page);
      const content = await pdfPage.getTextContent();
      this.pageTextContentCache.set(page, content);
      const parts: string[] = [];

      for (const item of (content?.items || []) as any[]) {
        const str = typeof item?.str === 'string' ? item.str : '';
        if (str) parts.push(str);
      }

      const raw = parts.join(' ');
      const normalized = raw.replace(/\s+/g, ' ').trim();
      this.pageTextCache.set(page, normalized);

      if (slug && version) {
        void this.searchIndex.setPageText({ slug, version, page }, normalized);
      }
      return normalized;
    })().finally(() => {
      this.pageTextInflight.delete(page);
    });

    this.pageTextInflight.set(page, promise);
    return promise;
  }

  private buildExcerpt(text: string, matchIndex: number, matchLength: number): string {
    const start = Math.max(0, matchIndex - 42);
    const end = Math.min(text.length, matchIndex + matchLength + 64);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < text.length ? '...' : '';
    return prefix + text.slice(start, end).trim() + suffix;
  }

  private async renderPage(pageNumber: number): Promise<void> {
    if (!this.pdfDoc) return;
    if (this.rendering) return;
    const canvas = this.canvas?.nativeElement;
    if (!canvas) return;

    const page = Math.max(1, Math.min(this.totalPages || 1, Math.floor(pageNumber)));
    this.rendering = true;
    try {
      const pdfPage = await this.pdfDoc.getPage(page);
      const viewport = pdfPage.getViewport({ scale: this.zoom });
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      await pdfPage.render({ canvasContext: ctx, viewport }).promise;

      await this.drawSearchHighlightsIfNeeded(page, pdfPage, viewport, ctx);
      this.drawStoredHighlights(page, ctx, canvas);

      this.currentPage = page;
      this.pageChange.emit(page);
      this.currentCfiChange.emit(`pdf-page:${page}`);

      const pct = this.totalPages > 1 ? (page - 1) / (this.totalPages - 1) : 0;
      this.progressChange.emit(Math.max(0, Math.min(1, pct)));

      this.storage.savePdfProgress(this.slug as string, { page, at: Date.now() });
      this.scheduleServerSave(page);
    } finally {
      this.rendering = false;
    }
  }

  private async drawSearchHighlightsIfNeeded(
    page: number,
    pdfPage: any,
    viewport: any,
    ctx: CanvasRenderingContext2D
  ): Promise<void> {
    const q = (this.lastSearchQuery || '').trim();
    if (!q) return;
    if (Date.now() > this.highlightUntil) return;

    const needle = q.toLowerCase();

    try {
      const content = this.pageTextContentCache.get(page) ?? (await pdfPage.getTextContent());
      this.pageTextContentCache.set(page, content);

      const items = (content?.items || []) as any[];
      if (!items.length) return;

      const scale = typeof viewport?.scale === 'number' ? viewport.scale : this.zoom;
      ctx.save();
      ctx.fillStyle = 'rgba(255, 209, 102, 0.28)';
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.55)';
      ctx.lineWidth = 1;

      for (const item of items) {
        const str = typeof item?.str === 'string' ? item.str : '';
        if (!str) continue;
        if (!str.toLowerCase().includes(needle)) continue;

        const rect = this.computeTextItemRect(item, viewport, scale);
        if (!rect) continue;
        const { x, y, w, h } = rect;
        if (w < 2 || h < 2) continue;

        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
      }

      ctx.restore();
    } catch {
      // ignore
    }
  }

  private computeTextItemRect(
    item: any,
    viewport: any,
    scale: number
  ): { x: number; y: number; w: number; h: number } | null {
    const vT = viewport?.transform as number[] | undefined;
    const iT = item?.transform as number[] | undefined;
    if (!Array.isArray(vT) || vT.length !== 6) return null;
    if (!Array.isArray(iT) || iT.length !== 6) return null;

    const tx = this.mul6(vT, iT);
    const x = tx[4];
    const y = tx[5];

    const width = typeof item?.width === 'number' ? Math.abs(item.width * scale) : 0;
    const heightFromItem = typeof item?.height === 'number' ? Math.abs(item.height * scale) : 0;
    const fontHeight = Math.max(1, Math.hypot(tx[2], tx[3]));

    const h = heightFromItem > 0.5 ? heightFromItem : fontHeight;
    const w = width > 0.5 ? width : 0;

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
      return null;
    }

    return { x, y: y - h, w, h };
  }

  private mul6(a: number[], b: number[]): number[] {
    return [
      a[0] * b[0] + a[2] * b[1],
      a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4],
      a[1] * b[4] + a[3] * b[5] + a[5],
    ];
  }

  private scheduleServerSave(page: number): void {
    const slug = this.slug;
    if (!slug) return;
    if (!this.progressApi.isAuthenticated()) return;
    if (!this.serverProgressLoaded) return;

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.progressApi.saveProgress(slug, page).subscribe();
    }, 700);
  }

  private drawStoredHighlights(page: number, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    const list = (this.highlights || []).filter((h) => h.kind === 'pdf') as Extract<HighlightEntry, { kind: 'pdf' }>[];
    const matches = list.filter((h) => h.page === page);
    if (matches.length === 0) return;

    ctx.save();
    for (const hl of matches) {
      const fill = this.highlightFill(hl.color);
      ctx.fillStyle = fill;
      const x = hl.rect.x * canvas.width;
      const y = hl.rect.y * canvas.height;
      const w = hl.rect.w * canvas.width;
      const h = hl.rect.h * canvas.height;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }

  private highlightFill(color: HighlightColor): string {
    switch (color) {
      case 'green':
        return 'rgba(74, 222, 128, 0.22)';
      case 'blue':
        return 'rgba(96, 165, 250, 0.22)';
      case 'pink':
        return 'rgba(244, 114, 182, 0.22)';
      default:
        return 'rgba(252, 211, 77, 0.22)';
    }
  }

  private async getPdfLib(): Promise<any> {
    if (this.pdfLibPromise) return this.pdfLibPromise;
    this.pdfLibPromise = import('pdfjs-dist/build/pdf.mjs').then((module: any) => {
      const lib = module;
      try {
        lib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();
      } catch {
        // ignore
      }
      return lib;
    });
    return this.pdfLibPromise;
  }
}
