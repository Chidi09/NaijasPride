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
import ePub from 'epubjs';

import type {
  HighlightColor,
  HighlightEntry,
  ReaderFlow,
  ReaderFontFamily,
  ReaderSpread,
  ReaderTheme,
  SearchResultEntry,
  TocEntry,
} from '../models/reader.models';
import { ReaderProgressService } from '../services/reader-progress.service';
import { ReaderStorageService } from '../services/reader-storage.service';

type ServerProgress = { page: number; updatedAt: number } | null;

@Component({
  selector: 'app-epub-viewer',
  standalone: true,
  imports: [CommonModule],
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }

      .np-epub-mount {
        width: 100%;
        height: 100%;
      }

      .np-epub-mount iframe {
        border: none;
        width: 100% !important;
        height: 100% !important;
        background: transparent;
      }
    `,
  ],
  template: `
    <div #mount class="np-epub-mount"></div>
  `,
})
export class EpubViewerComponent implements AfterViewInit, OnChanges, OnDestroy {
  private storage = inject(ReaderStorageService);
  private progressApi = inject(ReaderProgressService);

  @ViewChild('mount') mount?: ElementRef<HTMLElement>;

  @Input() slug: string | null = null;
  @Input() fileUrl: string | null = null;

  @Input() flow: ReaderFlow = 'paginated';
  @Input() spread: ReaderSpread = 'auto';
  @Input() theme: ReaderTheme = 'paper';
  @Input() fontFamily: ReaderFontFamily = 'serif';
  @Input() fontSize = 110;
  @Input() lineHeight = 1.6;

  @Input() autoScrollEnabled = false;
  @Input() autoScrollSpeed = 18;

  @Input() serverProgress: ServerProgress = null;
  @Input() serverProgressLoaded = false;

  @Input() highlightMode = false;
  @Input() highlightColor: HighlightColor = 'yellow';
  @Input() highlights: HighlightEntry[] = [];

  @Output() readyChange = new EventEmitter<boolean>();
  @Output() loadingChange = new EventEmitter<boolean>();
  @Output() errorChange = new EventEmitter<string | null>();
  @Output() tocChange = new EventEmitter<TocEntry[]>();
  @Output() currentCfiChange = new EventEmitter<string | null>();
  @Output() progressChange = new EventEmitter<number>();

  @Output() searchingChange = new EventEmitter<boolean>();
  @Output() searchErrorChange = new EventEmitter<string | null>();
  @Output() searchResultsChange = new EventEmitter<SearchResultEntry[]>();

  @Output() createHighlight = new EventEmitter<{ cfiRange: string; excerpt: string; color: HighlightColor }>();

  private viewReady = false;
  private initKey: string | null = null;

  private epubBook: any = null;
  private rendition: any = null;

  private locationsReady = false;
  private appliedServerProgress = false;

  private autoScrollRaf: number | null = null;
  private autoScrollLastAt = 0;

  private progressSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSaveCfi: string | null = null;

  private appliedHighlightRanges = new Set<string>();

  ngAfterViewInit(): void {
    this.viewReady = true;
    void this.ensureInit();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.viewReady) return;

    const shouldReinit =
      'fileUrl' in changes ||
      'flow' in changes ||
      'spread' in changes ||
      'slug' in changes;

    if (shouldReinit) {
      void this.ensureInit();
      return;
    }

    if ('theme' in changes || 'fontFamily' in changes || 'fontSize' in changes || 'lineHeight' in changes) {
      this.registerThemes();
      this.applySettingsToRendition();
    }

    if ('autoScrollEnabled' in changes || 'autoScrollSpeed' in changes) {
      if (this.flow === 'scrolled' && this.autoScrollEnabled) {
        this.startAutoScroll();
      } else {
        this.stopAutoScroll();
      }
    }

    if ('serverProgress' in changes || 'serverProgressLoaded' in changes) {
      this.applyServerProgressIfAvailable();
    }

    if ('highlights' in changes || 'highlightColor' in changes) {
      this.applyHighlightsToRendition();
    }
  }

  ngOnDestroy(): void {
    this.destroy();
  }

  next(): void {
    this.rendition?.next?.();
  }

  prev(): void {
    this.rendition?.prev?.();
  }

  getReadableText(maxChars = 4000): string {
    const n = Math.max(200, Math.min(40_000, Math.floor(maxChars)));
    try {
      const contents = (this.rendition?.getContents?.() || []) as any[];
      const parts: string[] = [];
      for (const c of contents) {
        const text = c?.document?.body?.innerText;
        if (typeof text === 'string' && text.trim()) {
          parts.push(text);
        }
      }
      const joined = parts.join('\n\n').replace(/\s+/g, ' ').trim();
      return joined.slice(0, n);
    } catch {
      return '';
    }
  }

  getSelectedText(maxChars = 2500): string {
    const n = Math.max(80, Math.min(20_000, Math.floor(maxChars)));
    try {
      const contents = (this.rendition?.getContents?.() || []) as any[];
      for (const c of contents) {
        const selected = c?.window?.getSelection?.()?.toString?.() || '';
        const trimmed = String(selected).replace(/\s+/g, ' ').trim();
        if (trimmed) {
          return trimmed.slice(0, n);
        }
      }
      return '';
    } catch {
      return '';
    }
  }

  goToHref(href: string): void {
    this.rendition?.display?.(href);
  }

  goToCfi(cfi: string): void {
    this.rendition?.display?.(cfi);
  }

  async search(query: string): Promise<void> {
    const q = (query || '').trim();
    if (!q) return;
    if (!this.epubBook?.spine?.spineItems) {
      this.searchErrorChange.emit('Search is not available yet.');
      return;
    }

    this.searchingChange.emit(true);
    this.searchErrorChange.emit(null);
    this.searchResultsChange.emit([]);

    const results: SearchResultEntry[] = [];
    const maxResults = 80;
    const maxSections = 120;

    try {
      const sections: any[] = this.epubBook.spine.spineItems || [];
      for (let i = 0; i < sections.length && i < maxSections; i++) {
        const section = sections[i];
        if (!section || !section.linear) continue;
        if (results.length >= maxResults) break;

        try {
          await section.load(this.epubBook.load.bind(this.epubBook));
          const matches = typeof section.search === 'function' ? section.search(q) : [];
          for (const match of matches || []) {
            if (results.length >= maxResults) break;
            const cfi = typeof match?.cfi === 'string' ? match.cfi : null;
            const excerpt = typeof match?.excerpt === 'string' ? match.excerpt : '';
            if (!cfi) continue;
            results.push({
              cfi,
              excerpt: excerpt ? excerpt : q,
              href: typeof section.href === 'string' ? section.href : `Section ${i + 1}`,
            });
          }
        } catch {
          // ignore per-section failures
        } finally {
          try {
            section.unload?.();
          } catch {
            // ignore
          }
        }
      }

      this.searchResultsChange.emit(results);
    } catch (error) {
      this.searchErrorChange.emit(error instanceof Error ? error.message : 'Search failed');
    } finally {
      this.searchingChange.emit(false);
    }
  }

  private async ensureInit(): Promise<void> {
    const mount = this.mount?.nativeElement;
    const slug = this.slug;
    const url = this.fileUrl;
    if (!mount || !slug || !url) {
      this.destroy();
      return;
    }

    const key = [slug, url, this.flow, this.spread].join('|');
    if (this.initKey === key && this.rendition) {
      this.registerThemes();
      this.applySettingsToRendition();
      this.applyServerProgressIfAvailable();
      return;
    }

    this.initKey = key;
    this.destroy();

    this.loadingChange.emit(true);
    this.errorChange.emit(null);
    this.readyChange.emit(false);
    this.tocChange.emit([]);
    this.currentCfiChange.emit(null);
    this.progressChange.emit(0);

    this.locationsReady = false;
    this.appliedServerProgress = false;
    this.pendingSaveCfi = null;

    try {
      this.epubBook = (ePub as any)(url);
      const spreadSetting =
        this.flow === 'paginated'
          ? this.spread === 'double'
            ? 'always'
            : this.spread === 'single'
              ? 'none'
              : 'auto'
          : 'none';

      this.rendition = this.epubBook.renderTo(mount, {
        width: '100%',
        height: '100%',
        flow: this.flow === 'scrolled' ? 'scrolled' : 'paginated',
        spread: spreadSetting,
      });

      this.readyChange.emit(true);
      this.registerThemes();
      this.applySettingsToRendition();

      this.rendition.on('relocated', (location: any) => {
        const cfi = location?.start?.cfi;
        if (typeof cfi === 'string') {
          this.currentCfiChange.emit(cfi);
          this.persistLocalProgress(cfi);
          this.scheduleServerProgressSave(cfi);
        }

        const pct = typeof location?.start?.percentage === 'number' ? location.start.percentage : null;
        if (pct !== null && Number.isFinite(pct)) {
          this.progressChange.emit(Math.max(0, Math.min(1, pct)));
        }
      });

      this.rendition.on('selected', (cfiRange: string, contents: any) => {
        try {
          if (!this.highlightMode) {
            contents?.window?.getSelection?.()?.removeAllRanges?.();
            return;
          }
          const rawText = contents?.window?.getSelection?.()?.toString?.() || '';
          const excerpt = (rawText || '').replace(/\s+/g, ' ').trim().slice(0, 180);
          const cleanExcerpt = excerpt || 'Highlight';

          if (typeof cfiRange === 'string' && cfiRange.trim()) {
            this.addHighlightAnnotation(cfiRange.trim(), this.highlightColor);
            this.createHighlight.emit({ cfiRange: cfiRange.trim(), excerpt: cleanExcerpt, color: this.highlightColor });
          }
        } finally {
          try {
            contents?.window?.getSelection?.()?.removeAllRanges?.();
          } catch {
            // ignore
          }
        }
      });

      const nav = await this.epubBook.loaded.navigation;
      this.tocChange.emit(this.flattenToc(nav?.toc || []));

      const localProgress = this.storage.loadEpubProgress(slug);
      await this.rendition.display(localProgress?.cfi || undefined);

      this.applyHighlightsToRendition();

      if (this.flow === 'scrolled' && this.autoScrollEnabled) {
        this.startAutoScroll();
      }

      this.loadingChange.emit(false);

      this.epubBook.ready
        .then(() => this.epubBook.locations?.generate?.(1600))
        .then(() => {
          this.locationsReady = true;
          this.applyServerProgressIfAvailable();
          this.flushServerProgressSave();
          const cfi = localProgress?.cfi || null;
          if (cfi && this.epubBook?.locations?.percentageFromCfi) {
            const pct = this.epubBook.locations.percentageFromCfi(cfi);
            if (typeof pct === 'number' && Number.isFinite(pct)) {
              this.progressChange.emit(Math.max(0, Math.min(1, pct)));
            }
          }
        })
        .catch(() => {
          // ignore
        });
    } catch (error) {
      this.loadingChange.emit(false);
      this.errorChange.emit(error instanceof Error ? error.message : 'Failed to open EPUB');
    }
  }

  private destroy(): void {
    this.stopAutoScroll();
    if (this.progressSaveTimer) {
      clearTimeout(this.progressSaveTimer);
      this.progressSaveTimer = null;
    }

    try {
      this.rendition?.destroy?.();
    } catch {
      // ignore
    }
    try {
      this.epubBook?.destroy?.();
    } catch {
      // ignore
    }
    this.rendition = null;
    this.epubBook = null;
    this.appliedHighlightRanges.clear();

    if (this.mount?.nativeElement) {
      this.mount.nativeElement.innerHTML = '';
    }
    this.readyChange.emit(false);
  }

  private registerThemes(): void {
    if (!this.rendition?.themes) return;

    this.rendition.themes.register('paper', {
      body: {
        color: '#1d1416',
        background: '#f7f2ec',
      },
      a: { color: '#800020' },
      p: { 'line-height': String(this.lineHeight) },
    });

    this.rendition.themes.register('sepia', {
      body: {
        color: '#2b201b',
        background: '#f4eadb',
      },
      a: { color: '#7a2f2f' },
      p: { 'line-height': String(this.lineHeight) },
    });

    this.rendition.themes.register('night', {
      body: {
        color: '#f2efe9',
        background: '#070708',
      },
      a: { color: '#d6b87a' },
      p: { 'line-height': String(this.lineHeight) },
    });
  }

  private applyHighlightsToRendition(): void {
    if (!this.rendition?.annotations) return;

    const wanted = (this.highlights || []).filter((h) => h.kind === 'epub') as Extract<HighlightEntry, { kind: 'epub' }>[];
    const wantedRanges = new Set(wanted.map((h) => h.cfiRange));

    // Remove ranges that are no longer present.
    for (const existing of this.appliedHighlightRanges) {
      if (wantedRanges.has(existing)) continue;
      try {
        this.rendition.annotations.remove(existing, 'highlight');
      } catch {
        // ignore
      }
      this.appliedHighlightRanges.delete(existing);
    }

    for (const hl of wanted) {
      if (this.appliedHighlightRanges.has(hl.cfiRange)) continue;
      this.addHighlightAnnotation(hl.cfiRange, hl.color);
    }
  }

  private addHighlightAnnotation(cfiRange: string, color: HighlightColor): void {
    if (!this.rendition?.annotations) return;
    const styles = this.highlightStyles(color);
    try {
      this.rendition.annotations.add('highlight', cfiRange, {}, undefined, 'np-hl', styles);
      this.appliedHighlightRanges.add(cfiRange);
    } catch {
      // ignore
    }
  }

  private highlightStyles(color: HighlightColor): Record<string, string> {
    const fill =
      color === 'green'
        ? '#4ade80'
        : color === 'blue'
          ? '#60a5fa'
          : color === 'pink'
            ? '#f472b6'
            : '#fcd34d';
    return {
      fill,
      'fill-opacity': '0.28',
      'mix-blend-mode': 'multiply',
    };
  }

  private applySettingsToRendition(): void {
    if (!this.rendition?.themes) return;

    this.rendition.themes.select(this.theme);
    this.rendition.themes.fontSize(`${this.fontSize}%`);

    const fontValue =
      this.fontFamily === 'sans'
        ? 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif'
        : this.fontFamily === 'mono'
          ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
          : 'Georgia, "Times New Roman", Times, serif';
    this.rendition.themes.override('font-family', fontValue);

    this.rendition.themes.override('line-height', String(this.lineHeight));
    this.rendition.themes.override('font-kerning', 'normal');
  }

  private flattenToc(items: any[], level = 0): TocEntry[] {
    const result: TocEntry[] = [];
    for (const item of items || []) {
      const label = typeof item?.label === 'string' ? item.label : '';
      const href = typeof item?.href === 'string' ? item.href : '';
      if (label && href) {
        result.push({ label, href, level });
      }
      const sub = Array.isArray(item?.subitems) ? item.subitems : [];
      if (sub.length > 0) {
        result.push(...this.flattenToc(sub, level + 1));
      }
    }
    return result;
  }

  private persistLocalProgress(cfi: string): void {
    const slug = this.slug;
    if (!slug) return;
    this.storage.saveEpubProgress(slug, { cfi, at: Date.now() });
  }

  private scheduleServerProgressSave(cfi: string): void {
    if (!this.slug) return;
    if (!this.progressApi.isAuthenticated()) return;
    if (!this.serverProgressLoaded) return;

    this.pendingSaveCfi = cfi;
    if (this.progressSaveTimer) {
      clearTimeout(this.progressSaveTimer);
    }
    this.progressSaveTimer = setTimeout(() => {
      this.flushServerProgressSave();
    }, 900);
  }

  private flushServerProgressSave(): void {
    const slug = this.slug;
    const cfi = this.pendingSaveCfi;
    if (!slug || !cfi) return;
    if (!this.progressApi.isAuthenticated()) return;
    if (!this.serverProgressLoaded) return;
    if (!this.locationsReady) return;
    if (!this.epubBook?.locations?.locationFromCfi) return;

    const loc = this.epubBook.locations.locationFromCfi(cfi);
    if (typeof loc !== 'number' || !Number.isFinite(loc) || loc < 0) return;
    const page = Math.floor(loc) + 1;

    this.progressApi.saveProgress(slug, page).subscribe();
  }

  private applyServerProgressIfAvailable(): void {
    if (this.appliedServerProgress) return;
    const slug = this.slug;
    if (!slug) return;
    if (!this.locationsReady) return;
    if (!this.rendition) return;
    if (!this.epubBook?.locations?.cfiFromLocation) return;

    const server = this.serverProgress;
    if (!server) return;

    const local = this.storage.loadEpubProgress(slug);
    const localAt = local?.at || 0;
    const serverAt = server.updatedAt || 0;

    if (localAt > 0 && serverAt > 0 && localAt > serverAt) {
      this.appliedServerProgress = true;
      return;
    }

    const loc = Math.max(0, Math.floor(server.page) - 1);
    const cfi = this.epubBook.locations.cfiFromLocation(loc);
    this.appliedServerProgress = true;
    if (typeof cfi === 'string' && cfi.trim()) {
      this.rendition.display(cfi);
    }
  }

  private getScrollContainer(): HTMLElement | null {
    const mount = this.mount?.nativeElement;
    if (!mount) return null;
    const candidates = [
      mount.querySelector('.epub-container'),
      mount.querySelector('.epub-view'),
      mount.querySelector('.epubjs'),
    ].filter(Boolean) as HTMLElement[];
    return candidates[0] || mount;
  }

  private startAutoScroll(): void {
    if (this.autoScrollRaf !== null) return;
    const container = this.getScrollContainer();
    if (!container) return;

    this.autoScrollLastAt = performance.now();
    const tick = (now: number) => {
      if (!this.autoScrollEnabled || this.flow !== 'scrolled') {
        this.stopAutoScroll();
        return;
      }
      const dt = Math.max(0, now - this.autoScrollLastAt);
      this.autoScrollLastAt = now;
      const pxPerMs = this.autoScrollSpeed / 1000;
      container.scrollTop += dt * pxPerMs;

      const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
      if (container.scrollTop >= maxScroll - 2) {
        this.stopAutoScroll();
        return;
      }

      this.autoScrollRaf = requestAnimationFrame(tick);
    };

    this.autoScrollRaf = requestAnimationFrame(tick);
  }

  private stopAutoScroll(): void {
    if (this.autoScrollRaf === null) return;
    cancelAnimationFrame(this.autoScrollRaf);
    this.autoScrollRaf = null;
  }
}
