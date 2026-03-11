import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import type {
  BookmarkEntry,
  HighlightColor,
  HighlightEntry,
  ReaderFlow,
  ReaderTheme,
  SearchResultEntry,
  TocEntry,
} from '../models/reader.models';
import type { TtsVoice } from '../services/reader-tts.service';

@Component({
  selector: 'app-reader-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatListModule,
    MatSliderModule,
    MatTooltipModule,
  ],
  template: `
    <div class="h-full w-[min(92vw,420px)] bg-[var(--np-reader-bg)] text-[var(--np-reader-fg)]">
      <div class="flex items-center justify-between gap-3 border-b border-[var(--np-reader-border)] px-4 py-3">
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold">Reader</p>
          <p class="truncate text-[11px] text-[var(--np-reader-muted)]">{{ bookTitle || 'Loading...' }}</p>
        </div>
        <button mat-icon-button type="button" (click)="close.emit()" aria-label="Close panel">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="h-full overflow-auto px-4 py-4">
        <p class="text-[11px] uppercase tracking-[0.18em] text-[var(--np-reader-muted)]">Search</p>
        <div class="mt-3 flex items-center gap-2">
          <input
            #searchBox
            [ngModel]="searchText"
            (ngModelChange)="searchTextChange.emit($event)"
            (keyup.enter)="runSearch.emit()"
            type="text"
            placeholder="Find in book..."
            class="w-full rounded-lg border border-[var(--np-reader-border)] bg-transparent px-3 py-2 text-sm outline-none"
          >
          <button
            mat-flat-button
            color="primary"
            type="button"
            (click)="runSearch.emit()"
            [disabled]="isSearching || !searchText.trim()"
          >
            Go
          </button>
        </div>

        @if (searchError) {
          <p class="mt-2 text-xs text-red-400">{{ searchError }}</p>
        }

        @if (isSearching) {
          <p class="mt-2 text-xs text-[var(--np-reader-muted)]">{{ searchStatus || 'Searching...' }}</p>
        } @else if (searchResults.length > 0) {
          <mat-nav-list class="mt-2">
            @for (hit of searchResults; track hit.cfi) {
              <a mat-list-item (click)="goToCfi.emit(hit.cfi)" class="cursor-pointer">
                <span matListItemTitle class="text-sm">{{ hit.excerpt }}</span>
                <span matListItemLine class="text-[11px] text-[var(--np-reader-muted)]">{{ hit.href }}</span>
              </a>
            }
          </mat-nav-list>
        } @else if (searchText.trim().length > 0) {
          <p class="mt-2 text-xs text-[var(--np-reader-muted)]">No results.</p>
        }

        <mat-divider class="my-6"></mat-divider>

        <div class="rounded-lg border border-[var(--np-reader-accent)] bg-[var(--np-reader-surface)] p-4">
          <p class="text-[11px] uppercase tracking-[0.18em] text-[var(--np-reader-accent)] font-semibold">Reading Mode</p>
          <p class="mt-1 text-xs text-[var(--np-reader-muted)]">Choose how to navigate through the book</p>
          <div class="mt-3 grid grid-cols-2 gap-3">
            <button
              mat-raised-button
              type="button"
              (click)="setFlow.emit('paginated')"
              [disabled]="readerType === 'pdf'"
              [class.bg-[var(--np-reader-accent)]]="flow === 'paginated'"
              [class.text-white]="flow === 'paginated'"
            >
              <mat-icon class="mr-1 text-[18px]">auto_stories</mat-icon>
              Pages
            </button>
            <button
              mat-raised-button
              type="button"
              (click)="setFlow.emit('scrolled')"
              [disabled]="readerType === 'pdf'"
              [class.bg-[var(--np-reader-accent)]]="flow === 'scrolled'"
              [class.text-white]="flow === 'scrolled'"
            >
              <mat-icon class="mr-1 text-[18px]">swap_vert</mat-icon>
              Scroll
            </button>
          </div>
          @if (readerType === 'pdf') {
            <p class="mt-2 text-xs text-[var(--np-reader-muted)] italic">PDF files only support page mode</p>
          }
        </div>

        @if (readerType === 'epub') {
          <div class="mt-6 rounded-lg border border-[var(--np-reader-border)] p-3">
            <p class="text-[11px] uppercase tracking-[0.18em] text-[var(--np-reader-accent)] font-medium">Layout</p>
            <div class="mt-3 grid grid-cols-3 gap-2">
              <button mat-stroked-button type="button" (click)="setSpread.emit('auto')" [class.mat-accent]="spread === 'auto'">
                Auto
              </button>
              <button mat-stroked-button type="button" (click)="setSpread.emit('single')" [class.mat-accent]="spread === 'single'">
                Single
              </button>
              <button mat-stroked-button type="button" (click)="setSpread.emit('double')" [class.mat-accent]="spread === 'double'">
                Double
              </button>
            </div>
          </div>

          <div class="mt-6 rounded-lg border border-[var(--np-reader-border)] p-3">
            <p class="text-[11px] uppercase tracking-[0.18em] text-[var(--np-reader-accent)] font-medium">Font</p>
            <div class="mt-3 grid grid-cols-3 gap-2">
              <button mat-stroked-button type="button" (click)="setFontFamily.emit('serif')" [class.mat-accent]="fontFamily === 'serif'">
                Serif
              </button>
              <button mat-stroked-button type="button" (click)="setFontFamily.emit('sans')" [class.mat-accent]="fontFamily === 'sans'">
                Sans
              </button>
              <button mat-stroked-button type="button" (click)="setFontFamily.emit('mono')" [class.mat-accent]="fontFamily === 'mono'">
                Mono
              </button>
            </div>
          </div>
        } @else {
          <div class="mt-6">
            <p class="text-[11px] uppercase tracking-[0.18em] text-[var(--np-reader-muted)]">PDF</p>
            <p class="mt-2 text-xs text-[var(--np-reader-muted)]">Page {{ pdfPage }} / {{ pdfPageCount || '?' }}</p>
          </div>
        }

        <div class="mt-6 rounded-lg border border-[var(--np-reader-border)] p-3">
          <p class="text-[11px] uppercase tracking-[0.18em] text-[var(--np-reader-accent)] font-medium">Theme</p>
          <div class="mt-3 grid grid-cols-3 gap-2">
            <button mat-stroked-button type="button" (click)="setTheme.emit('paper')" [class.mat-accent]="theme === 'paper'">Paper</button>
            <button mat-stroked-button type="button" (click)="setTheme.emit('sepia')" [class.mat-accent]="theme === 'sepia'">Sepia</button>
            <button mat-stroked-button type="button" (click)="setTheme.emit('night')" [class.mat-accent]="theme === 'night'">Night</button>
          </div>
        </div>

        @if (readerType === 'epub') {
          <div class="mt-6">
            <p class="text-[11px] uppercase tracking-[0.18em] text-[var(--np-reader-muted)]">Font Size</p>
            <div class="mt-2 flex items-center gap-3">
              <span class="w-10 text-xs text-[var(--np-reader-muted)]">{{ fontSize }}%</span>
              <mat-slider class="w-full" [min]="80" [max]="180" [step]="5">
                <input matSliderThumb [value]="fontSize" (valueChange)="setFontSize.emit($event)" />
              </mat-slider>
            </div>
          </div>

          <div class="mt-6">
            <p class="text-[11px] uppercase tracking-[0.18em] text-[var(--np-reader-muted)]">Line Height</p>
            <div class="mt-2 flex items-center gap-3">
              <span class="w-10 text-xs text-[var(--np-reader-muted)]">{{ lineHeight.toFixed(1) }}</span>
              <mat-slider class="w-full" [min]="1.2" [max]="2.2" [step]="0.1">
                <input matSliderThumb [value]="lineHeight" (valueChange)="setLineHeight.emit($event)" />
              </mat-slider>
            </div>
          </div>

          @if (flow === 'scrolled') {
            <div class="mt-6">
              <p class="text-[11px] uppercase tracking-[0.18em] text-[var(--np-reader-muted)]">Musician Mode</p>
              <div class="mt-3 flex items-center justify-between gap-3">
                <button mat-stroked-button type="button" (click)="toggleAutoScroll.emit()">
                  {{ autoScrollEnabled ? 'Stop Auto-Scroll' : 'Start Auto-Scroll' }}
                </button>
                <span class="text-xs text-[var(--np-reader-muted)]">{{ autoScrollSpeed }} px/s</span>
              </div>
              <div class="mt-2">
                <mat-slider class="w-full" [min]="4" [max]="80" [step]="2">
                  <input matSliderThumb [value]="autoScrollSpeed" (valueChange)="setAutoScrollSpeed.emit($event)" />
                </mat-slider>
              </div>
            </div>
          }
        } @else {
          <div class="mt-6">
            <p class="text-[11px] uppercase tracking-[0.18em] text-[var(--np-reader-muted)]">Zoom</p>
            <div class="mt-2 flex items-center gap-3">
              <span class="w-12 text-xs text-[var(--np-reader-muted)]">{{ (pdfZoom * 100) | number:'1.0-0' }}%</span>
              <mat-slider class="w-full" [min]="0.6" [max]="2.6" [step]="0.1">
                <input matSliderThumb [value]="pdfZoom" (valueChange)="setPdfZoom.emit($event)" />
              </mat-slider>
            </div>
          </div>
        }

        <div class="mt-6">
          <p class="text-[11px] uppercase tracking-[0.18em] text-[var(--np-reader-muted)]">Bookmarks</p>
          <div class="mt-3 flex items-center gap-2">
            <button mat-flat-button color="primary" type="button" (click)="addBookmark.emit()" [disabled]="readerType === 'epub' && !currentCfi">
              Add
            </button>
            <button mat-stroked-button type="button" (click)="clearBookmarks.emit()" [disabled]="bookmarks.length === 0">
              Clear
            </button>
          </div>
          @if (bookmarks.length > 0) {
            <mat-nav-list class="mt-2">
              @for (bm of bookmarks; track bm.id) {
                <a mat-list-item (click)="goToCfi.emit(bm.cfi)" class="cursor-pointer">
                  <span matListItemTitle class="text-sm">{{ bm.label }}</span>
                  <span matListItemLine class="text-[11px] text-[var(--np-reader-muted)]">{{ bm.createdAt | date:'medium' }}</span>
                </a>
              }
            </mat-nav-list>
          } @else {
            <p class="mt-2 text-xs text-[var(--np-reader-muted)]">No bookmarks yet.</p>
          }
        </div>

        <div class="mt-6">
          <p class="text-[11px] uppercase tracking-[0.18em] text-[var(--np-reader-muted)]">Highlights</p>
          <div class="mt-3 flex items-center gap-2">
            <button mat-stroked-button type="button" (click)="toggleHighlightMode.emit()">
              {{ highlightMode ? 'Exit Highlight' : 'Highlight Mode' }}
            </button>
            <button mat-stroked-button type="button" (click)="clearHighlights.emit()" [disabled]="highlights.length === 0">
              Clear
            </button>
          </div>

          <div class="mt-3 grid grid-cols-4 gap-2">
            <button mat-stroked-button type="button" (click)="setHighlightColor.emit('yellow')" [disabled]="highlightColor === 'yellow'">Yellow</button>
            <button mat-stroked-button type="button" (click)="setHighlightColor.emit('green')" [disabled]="highlightColor === 'green'">Green</button>
            <button mat-stroked-button type="button" (click)="setHighlightColor.emit('blue')" [disabled]="highlightColor === 'blue'">Blue</button>
            <button mat-stroked-button type="button" (click)="setHighlightColor.emit('pink')" [disabled]="highlightColor === 'pink'">Pink</button>
          </div>

          @if (highlights.length > 0) {
            <mat-nav-list class="mt-2">
              @for (hl of highlights; track hl.id) {
                <div class="flex items-center justify-between gap-3 rounded px-2 py-1 hover:bg-black/5">
                  <button mat-button type="button" class="min-w-0 flex-1 justify-start" (click)="goToHighlight.emit(hl)">
                    <span class="truncate text-sm">
                      @if (hl.kind === 'pdf') {
                        Page {{ hl.page }}
                      } @else {
                        {{ hl.excerpt || 'EPUB highlight' }}
                      }
                    </span>
                  </button>
                  <button mat-icon-button type="button" aria-label="Delete highlight" (click)="deleteHighlight.emit(hl.id)">
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>
              }
            </mat-nav-list>
          } @else {
            <p class="mt-2 text-xs text-[var(--np-reader-muted)]">
              {{ highlightMode ? 'Select text (EPUB) or drag on page (PDF) to highlight.' : 'No highlights yet.' }}
            </p>
          }
        </div>

        <div class="mt-6">
          <p class="text-[11px] uppercase tracking-[0.18em] text-[var(--np-reader-muted)]">Read Aloud</p>
          @if (!ttsAvailable) {
            <p class="mt-2 text-xs text-[var(--np-reader-muted)]">Text-to-speech is not available in this browser.</p>
          } @else {
            <div class="mt-3 grid grid-cols-3 gap-2">
              <button mat-stroked-button type="button" (click)="ttsStart.emit()">Start</button>
              <button mat-stroked-button type="button" (click)="ttsTogglePause.emit()" [disabled]="!ttsSpeaking">
                {{ ttsPaused ? 'Resume' : 'Pause' }}
              </button>
              <button mat-stroked-button type="button" (click)="ttsStop.emit()" [disabled]="!ttsSpeaking">Stop</button>
            </div>

            <div class="mt-4">
              <p class="text-[11px] uppercase tracking-[0.18em] text-[var(--np-reader-muted)]">Voice</p>
              <select
                class="mt-2 w-full rounded-lg border border-[var(--np-reader-border)] bg-transparent px-3 py-2 text-sm outline-none"
                [ngModel]="ttsVoiceUri || ''"
                (ngModelChange)="ttsVoiceChange.emit($event ? $event : null)"
              >
                <option value="">Default</option>
                @for (v of ttsVoices; track v.uri) {
                  <option [value]="v.uri">{{ v.name }} @if (v.lang) { ({{ v.lang }}) }</option>
                }
              </select>
            </div>

            <div class="mt-4">
              <p class="text-[11px] uppercase tracking-[0.18em] text-[var(--np-reader-muted)]">Speed</p>
              <div class="mt-2 flex items-center gap-3">
                <span class="w-10 text-xs text-[var(--np-reader-muted)]">{{ ttsRate.toFixed(1) }}x</span>
                <mat-slider class="w-full" [min]="0.6" [max]="1.6" [step]="0.1">
                  <input matSliderThumb [value]="ttsRate" (valueChange)="ttsRateChange.emit($event)" />
                </mat-slider>
              </div>
            </div>

            @if (ttsError) {
              <p class="mt-2 text-xs text-red-400">{{ ttsError }}</p>
            }
          }
        </div>

        <mat-divider class="my-6"></mat-divider>

        <p class="text-[11px] uppercase tracking-[0.18em] text-[var(--np-reader-muted)]">Table of Contents</p>
        @if (toc.length === 0) {
          <p class="mt-2 text-xs text-[var(--np-reader-muted)]">No TOC found for this book.</p>
        } @else {
          <mat-nav-list class="mt-2">
            @for (entry of toc; track entry.href) {
              <a mat-list-item (click)="goToHref.emit(entry.href)" class="cursor-pointer">
                <span matListItemTitle class="text-sm" [style.paddingLeft.px]="entry.level * 12">{{ entry.label }}</span>
              </a>
            }
          </mat-nav-list>
        }
      </div>
    </div>
  `,
})
export class ReaderSidebarComponent {
  @ViewChild('searchBox') searchBox?: ElementRef<HTMLInputElement>;

  @Input() bookTitle = '';
  @Input() readerType: 'epub' | 'pdf' = 'epub';

  @Input() flow: ReaderFlow = 'paginated';
  @Input() spread: 'auto' | 'single' | 'double' = 'auto';
  @Input() theme: ReaderTheme = 'paper';
  @Input() fontFamily: 'serif' | 'sans' | 'mono' = 'serif';
  @Input() fontSize = 110;
  @Input() lineHeight = 1.6;

  @Input() autoScrollEnabled = false;
  @Input() autoScrollSpeed = 18;

  @Input() pdfPage = 1;
  @Input() pdfPageCount = 0;
  @Input() pdfZoom = 1.15;

  @Input() currentCfi: string | null = null;

  @Input() bookmarks: BookmarkEntry[] = [];
  @Input() highlights: HighlightEntry[] = [];
  @Input() highlightMode = false;
  @Input() highlightColor: HighlightColor = 'yellow';
  @Input() toc: TocEntry[] = [];

  @Input() searchText = '';
  @Output() searchTextChange = new EventEmitter<string>();
  @Input() isSearching = false;
  @Input() searchStatus: string | null = null;
  @Input() searchError: string | null = null;
  @Input() searchResults: SearchResultEntry[] = [];

  @Input() ttsAvailable = false;
  @Input() ttsSpeaking = false;
  @Input() ttsPaused = false;
  @Input() ttsRate = 1.0;
  @Input() ttsError: string | null = null;
  @Input() ttsVoices: TtsVoice[] = [];
  @Input() ttsVoiceUri: string | null = null;

  @Output() close = new EventEmitter<void>();
  @Output() runSearch = new EventEmitter<void>();
  @Output() goToHref = new EventEmitter<string>();
  @Output() goToCfi = new EventEmitter<string>();

  @Output() setFlow = new EventEmitter<ReaderFlow>();
  @Output() setSpread = new EventEmitter<'auto' | 'single' | 'double'>();
  @Output() setTheme = new EventEmitter<ReaderTheme>();
  @Output() setFontFamily = new EventEmitter<'serif' | 'sans' | 'mono'>();
  @Output() setFontSize = new EventEmitter<number | null>();
  @Output() setLineHeight = new EventEmitter<number | null>();
  @Output() toggleAutoScroll = new EventEmitter<void>();
  @Output() setAutoScrollSpeed = new EventEmitter<number | null>();
  @Output() setPdfZoom = new EventEmitter<number | null>();

  @Output() addBookmark = new EventEmitter<void>();
  @Output() clearBookmarks = new EventEmitter<void>();

  @Output() toggleHighlightMode = new EventEmitter<void>();
  @Output() setHighlightColor = new EventEmitter<HighlightColor>();
  @Output() goToHighlight = new EventEmitter<HighlightEntry>();
  @Output() deleteHighlight = new EventEmitter<string>();
  @Output() clearHighlights = new EventEmitter<void>();

  @Output() ttsStart = new EventEmitter<void>();
  @Output() ttsTogglePause = new EventEmitter<void>();
  @Output() ttsStop = new EventEmitter<void>();
  @Output() ttsRateChange = new EventEmitter<number | null>();
  @Output() ttsVoiceChange = new EventEmitter<string | null>();

  focusSearch(): void {
    const el = this.searchBox?.nativeElement;
    if (!el) return;
    try {
      el.focus();
      el.select();
    } catch {
      // ignore
    }
  }
}
