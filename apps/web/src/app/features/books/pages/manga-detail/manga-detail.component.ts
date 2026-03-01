import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MangaOfflineService } from '../../../../core/services/manga-offline.service';
import { LibraryService } from '../../../../core/services/library.service';
import { AuthService } from '../../../../core/auth/auth.service';

type MangaDetail = {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  status: string | null;
  year: number | null;
  originalLanguage: string | null;
  tags: string[];
  latestChapter: string | null;
  author: string | null;
  artist: string | null;
  contentRating: string | null;
  publicationDemographic: string | null;
  availableTranslatedLanguages: string[];
};

type MangaChapter = {
  id: string;
  chapter: string | null;
  volume: string | null;
  title: string | null;
  publishedAt: string | null;
  branch: string | null;
  scanlationGroup: string | null;
  externalUrl: string | null;
  isExternal: boolean;
};

type MangaSummary = {
  id: string;
  title: string;
  coverUrl: string | null;
  latestChapter: string | null;
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
  selector: 'app-manga-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <div class="container mx-auto px-4 py-10 books-theme">
      <a mat-stroked-button color="primary" [routerLink]="libraryRootPath()" class="mb-6">
        Back to {{ isComicsMode() ? 'Comics' : 'Manga' }} Library
      </a>

      @if (isLoading()) {
        <section class="grid gap-6 md:grid-cols-[280px_1fr]">
          <mat-card class="np-cover-card animate-pulse">
            <div class="np-cover-media"></div>
          </mat-card>
          <mat-card class="np-surface-card p-6">
            <div class="space-y-3">
              <div class="h-8 w-3/4 animate-pulse rounded bg-[#e5d2c6] dark:bg-cinema-800"></div>
              <div class="h-4 w-2/3 animate-pulse rounded bg-[#e5d2c6] dark:bg-cinema-800"></div>
              <div class="h-4 w-full animate-pulse rounded bg-[#e5d2c6] dark:bg-cinema-800"></div>
              <div class="h-4 w-5/6 animate-pulse rounded bg-[#e5d2c6] dark:bg-cinema-800"></div>
              <div class="h-4 w-4/6 animate-pulse rounded bg-[#e5d2c6] dark:bg-cinema-800"></div>
            </div>
          </mat-card>
        </section>
      }

      @if (detail(); as manga) {
        <section class="mb-8 grid gap-6 md:grid-cols-[280px_1fr]">
          <mat-card class="np-cover-card">
            <div class="np-cover-media">
              @if (manga.coverUrl) {
                <img [src]="manga.coverUrl" [alt]="manga.title" loading="lazy" decoding="async" referrerpolicy="no-referrer">
              } @else {
                <div class="absolute inset-0 flex items-center justify-center text-4xl">📘</div>
              }
            </div>
          </mat-card>

          <div class="min-w-0">
            <h1 class="text-2xl font-semibold text-[var(--text-primary)] md:text-3xl">{{ manga.title }}</h1>

            <mat-chip-set class="mt-3" aria-label="Manga metadata">
              <mat-chip>{{ sourceLabel() }}</mat-chip>
              @if (manga.status) { <mat-chip>{{ manga.status }}</mat-chip> }
              @if (manga.year) { <mat-chip>{{ manga.year }}</mat-chip> }
              @if (manga.originalLanguage) { <mat-chip>{{ manga.originalLanguage }}</mat-chip> }
              @if (manga.contentRating) { <mat-chip>{{ manga.contentRating }}</mat-chip> }
              @if (manga.publicationDemographic) { <mat-chip>{{ manga.publicationDemographic }}</mat-chip> }
            </mat-chip-set>

            <mat-card class="np-surface-card mt-4 p-4">
              <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <p class="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Source</p>
                  <p class="text-sm text-[var(--text-primary)]">{{ sourceLabel() }}</p>
                </div>
                @if (manga.author) {
                  <div>
                    <p class="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Author</p>
                    <p class="text-sm text-[var(--text-primary)]">{{ manga.author }}</p>
                  </div>
                }
                @if (manga.artist) {
                  <div>
                    <p class="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Artist</p>
                    <p class="text-sm text-[var(--text-primary)]">{{ manga.artist }}</p>
                  </div>
                }
                <div>
                  <p class="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Chapters</p>
                  <p class="text-sm text-[var(--text-primary)]">{{ isChaptersLoading() ? 'Loading…' : chapters().length }}</p>
                </div>
                @if (manga.availableTranslatedLanguages?.length) {
                  <div class="sm:col-span-2 lg:col-span-2">
                    <p class="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Languages</p>
                    <p class="text-sm text-[var(--text-primary)]">{{ manga.availableTranslatedLanguages.length }} available</p>
                  </div>
                }
              </div>
            </mat-card>

            <mat-card class="np-surface-card mt-4 p-4">
              <p class="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Description</p>
              <p class="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">{{ manga.description || 'No description available.' }}</p>
            </mat-card>

            @if (manga.tags?.length) {
              <mat-card class="np-surface-card mt-4 p-4">
                <p class="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Tags</p>
                <mat-chip-set class="mt-2" aria-label="Manga tags">
                  @for (tag of manga.tags; track tag) {
                    <mat-chip>{{ tag }}</mat-chip>
                  }
                </mat-chip-set>
              </mat-card>
            }

            <div class="mt-5 flex flex-wrap gap-2 items-center">
              <button mat-stroked-button color="primary" type="button" (click)="toggleFavorite()">
                {{ isFavorite() ? '★ Favorited' : '☆ Add to Favorites' }}
              </button>

              @if (auth.currentUser()) {
                <button
                  mat-stroked-button
                  type="button"
                  [color]="library.isWatchingManga(currentMangaId()) ? 'warn' : 'primary'"
                  (click)="toggleChapterWatch()"
                  [title]="library.isWatchingManga(currentMangaId()) ? 'Stop notifications for new chapters' : 'Notify me when new chapters drop'"
                >
                  {{ library.isWatchingManga(currentMangaId()) ? '🔔 Watching' : '🔕 Watch Chapters' }}
                </button>
              }

              @if (mangaOffline.downloadedChapterCount(currentMangaId()) > 0) {
                <span class="text-xs text-green-500 border border-green-500/30 px-2 py-1 rounded">
                  {{ mangaOffline.downloadedChapterCount(currentMangaId()) }} chapter(s) offline
                </span>
              }
            </div>
          </div>
        </section>

        <mat-card class="np-surface-card mb-8 p-4">
          <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 class="text-lg font-semibold text-[var(--text-primary)]">Chapters</h2>
              <p class="mt-1 text-xs text-[var(--text-muted)]">
                @if (isChaptersLoading()) {
                  Loading chapters...
                } @else {
                  Showing {{ visibleFilteredChapterCount() }} of {{ filteredChapterCount() }}
                }
              </p>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              @if (continueReadingChapterId(); as contId) {
                <a
                  mat-flat-button
                  color="primary"
                  [routerLink]="[readBasePath(), toRouteParam(contId)]"
                  [queryParams]="{ title: manga.title, chapter: continueReadingChapterLabel() || '', mangaId: manga.id }"
                >
                  Continue
                  @if (continueReadingChapterLabel(); as cLabel) {
                    <span class="ml-2 text-xs font-normal opacity-80">{{ cLabel }}</span>
                  }
                </a>
              }
              <button mat-stroked-button color="primary" type="button" (click)="toggleChapterOrder()">
                {{ chapterOrder() === 'newest' ? 'Newest' : 'Oldest' }}
              </button>
            </div>
          </div>
          @if (hasExternalChapters()) {
            <div class="mb-3 rounded border border-amber-700/50 bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              Some chapters are hosted externally and will open on their original source.
            </div>
          }
          @if (!isChaptersLoading() && chapters().length === 0) {
            <p class="text-sm text-[#8a756e] dark:text-gray-400">No chapters found.</p>
          }
          @if (isChaptersLoading()) {
            <div class="space-y-2">
              @for (_ of [1,2,3,4,5]; track _) {
                <div class="h-14 animate-pulse rounded border border-[#d8c2b8] dark:border-zinc-800 bg-[#e5d2c6] dark:bg-zinc-900/60"></div>
              }
            </div>
          }
          @if (!isChaptersLoading() && chapters().length > 0) {
            <div class="np-chapters-scroll space-y-2">
              <div class="np-chapters-toolbar">
                <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
                    @if (supportsLanguages()) {
                      <mat-form-field
                        appearance="fill"
                        floatLabel="never"
                        subscriptSizing="dynamic"
                        class="np-search-field w-full sm:w-52"
                      >
                        <mat-select
                          [ngModel]="selectedLanguage()"
                          (ngModelChange)="onLanguageChange($event)"
                          aria-label="Chapter language"
                        >
                          <mat-option value="all">All languages</mat-option>
                          @if (detail(); as current) {
                            @for (lang of current.availableTranslatedLanguages; track lang) {
                              <mat-option [value]="lang">{{ languageLabel(lang) }}</mat-option>
                            }
                          }
                        </mat-select>
                      </mat-form-field>
                    }

                    <mat-form-field
                      appearance="fill"
                      floatLabel="never"
                      subscriptSizing="dynamic"
                      class="np-search-field w-full sm:w-72"
                    >
                      <span matPrefix class="np-search-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <circle cx="11" cy="11" r="7"></circle>
                          <path d="M21 21l-4.3-4.3"></path>
                        </svg>
                      </span>
                      <input
                        matInput
                        [ngModel]="chapterFilter()"
                        (ngModelChange)="onChapterFilterChange($event)"
                        aria-label="Filter chapters"
                        placeholder="Filter chapters"
                      />
                    </mat-form-field>
                  </div>

                  <div class="flex items-end gap-2">
                    <mat-form-field
                      appearance="fill"
                      floatLabel="never"
                      subscriptSizing="dynamic"
                      class="np-search-field w-36"
                    >
                      <input
                        matInput
                        [ngModel]="chapterJump()"
                        (ngModelChange)="chapterJump.set($event)"
                        (keyup.enter)="jumpToChapter()"
                        aria-label="Jump to chapter"
                        placeholder="Jump to"
                      />
                    </mat-form-field>
                    <button mat-stroked-button color="primary" type="button" (click)="jumpToChapter()">Go</button>
                  </div>
                </div>

                <div class="mt-2 flex items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                  <span>Order: {{ chapterOrder() === 'newest' ? 'Newest first' : 'Oldest first' }}</span>
                  <span>{{ filteredChapterCount() }} total</span>
                </div>
              </div>

              @for (chapter of visibleChapters(); track chapter.id) {
                @if (chapter.isExternal && chapter.externalUrl) {
                  <a
                    [attr.id]="'np-chapter-' + chapter.id"
                    [href]="chapter.externalUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="np-chapter-row np-chapter-row--external"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="np-chapter-title">
                          {{ chapterLabel(chapter) }}
                          @if (chapterSubtitle(chapter)) {
                            <span class="np-chapter-subtitle">{{ chapterSubtitle(chapter) }}</span>
                          }
                        </div>
                        <div class="np-chapter-meta">
                          @if (chapter.branch) { <span>{{ chapter.branch }}</span> }
                          @if (chapter.volume) { <span>Vol. {{ chapter.volume }}</span> }
                          <span>External</span>
                        </div>
                      </div>
                      <span class="shrink-0 rounded border border-amber-600/50 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">Open</span>
                    </div>
                  </a>
                } @else {
                  <div
                    [attr.id]="'np-chapter-' + chapter.id"
                    class="np-chapter-row flex items-center gap-2"
                  >
                    <a
                      class="flex-1 min-w-0"
                      [routerLink]="[readBasePath(), toRouteParam(chapter.id)]"
                      [queryParams]="{ title: manga.title, chapter: chapter.chapter || '', mangaId: manga.id }"
                      (click)="rememberContinue(chapter)"
                    >
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <div class="np-chapter-title">
                            {{ chapterLabel(chapter) }}
                            @if (mangaOffline.isAvailable(chapter.id)) {
                              <span class="ml-1 text-[10px] text-green-500">● offline</span>
                            }
                            @if (chapterSubtitle(chapter)) {
                              <span class="np-chapter-subtitle">{{ chapterSubtitle(chapter) }}</span>
                            }
                          </div>
                          <div class="np-chapter-meta">
                            @if (chapter.branch) { <span>{{ chapter.branch }}</span> }
                            @if (chapter.volume) { <span>Vol. {{ chapter.volume }}</span> }
                          </div>
                          <!-- Download progress bar -->
                          @if (mangaOffline.getStatus(chapter.id) === 'downloading' || mangaOffline.getStatus(chapter.id) === 'queued') {
                            <div class="mt-1 h-0.5 w-full bg-[#d9c4b7] dark:bg-white/10 rounded overflow-hidden">
                              <div class="h-full bg-cinema-500 transition-all" [style.width.%]="mangaOffline.getProgress(chapter.id)"></div>
                            </div>
                          }
                          @if (mangaOffline.getStatus(chapter.id) === 'error') {
                            <div class="text-[10px] text-red-400">Failed — tap retry</div>
                          }
                        </div>
                        <span class="shrink-0 text-xs text-[var(--text-muted)]">
                          {{ chapter.publishedAt ? (chapter.publishedAt | date: 'MMM d, y') : '' }}
                        </span>
                      </div>
                    </a>

                    <!-- Download / offline button -->
                    @if (mangaOffline.isSupported) {
                      @if (mangaOffline.isAvailable(chapter.id)) {
                        <button
                          type="button"
                          class="shrink-0 p-1.5 rounded text-green-500 hover:text-red-400 transition-colors"
                          title="Downloaded — tap to remove"
                          (click)="removeChapterOffline(chapter.id); $event.stopPropagation()"
                        >
                          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                          </svg>
                        </button>
                      } @else if (mangaOffline.getStatus(chapter.id) === 'downloading' || mangaOffline.getStatus(chapter.id) === 'queued') {
                        <span class="shrink-0 w-4 h-4 border-2 border-cinema-400/30 border-t-cinema-400 rounded-full animate-spin inline-block"></span>
                      } @else {
                        <button
                          type="button"
                          class="shrink-0 p-1.5 rounded text-[var(--text-muted)] hover:text-cinema-500 transition-colors"
                          title="Save chapter for offline reading"
                          (click)="downloadChapter(chapter, manga.title, manga.coverUrl); $event.stopPropagation()"
                        >
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                          </svg>
                        </button>
                      }
                    }
                  </div>
                }
              }
            </div>
          }
          @if (hasMoreChapters()) {
            <div class="mt-4 text-center">
              <button
                mat-stroked-button
                color="primary"
                type="button"
                (click)="visibleChapterCount.set(visibleChapterCount() + 30)"
              >Load 30 more</button>
            </div>
          }
        </mat-card>

        @if (supportsSimilar()) {
          <section>
            <h2 class="mb-4 text-lg font-semibold text-[var(--text-primary)]">Similar {{ isComicsMode() ? 'Comics' : 'Manga' }}</h2>
            @if (isSimilarLoading()) {
              <div class="np-cover-grid">
                @for (_ of [1,2,3,4,5,6]; track _) {
                  <mat-card class="np-cover-card animate-pulse">
                    <div class="np-cover-media"></div>
                    <div class="np-cover-body">
                      <div class="h-4 rounded bg-[#e5d2c6] dark:bg-cinema-800"></div>
                      <div class="mt-2 h-3 w-2/3 rounded bg-[#e5d2c6] dark:bg-cinema-800"></div>
                    </div>
                  </mat-card>
                }
              </div>
            }
            @if (!isSimilarLoading()) {
              <div class="np-cover-grid">
                @for (item of similar(); track item.id) {
                  <mat-card class="np-cover-card">
                    <a [routerLink]="[detailBasePath(), toRouteParam(item.id)]" class="np-cover-link">
                      <div class="np-cover-media">
                        @if (item.coverUrl) {
                          <img [src]="item.coverUrl" [alt]="item.title" loading="lazy" decoding="async" referrerpolicy="no-referrer">
                        } @else {
                          <div class="absolute inset-0 flex items-center justify-center text-4xl">📘</div>
                        }
                      </div>
                      <div class="np-cover-body">
                        <div class="np-cover-title">{{ item.title }}</div>
                        <div class="np-cover-meta">@if (item.latestChapter) { Ch. {{ item.latestChapter }} }</div>
                      </div>
                    </a>
                  </mat-card>
                }
              </div>
            }
          </section>
        }
      }

      @if (showBackToTop()) {
        <button mat-fab color="primary" type="button" (click)="scrollToTop()" class="fixed bottom-6 right-5 z-20">
          Top
        </button>
      }
    </div>
  `,
})
export class MangaDetailComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  mangaOffline = inject(MangaOfflineService);
  library = inject(LibraryService);
  auth = inject(AuthService);

  libraryMode = signal<'manga' | 'comics'>('manga');
  isLoading = signal(true);
  detail = signal<MangaDetail | null>(null);
  chapters = signal<MangaChapter[]>([]);
  similar = signal<MangaSummary[]>([]);
  favorite = signal(false);
  isChaptersLoading = signal(false);
  isSimilarLoading = signal(false);
  showBackToTop = signal(false);
  selectedLanguage = signal('en');
  sourceId = signal('mangadex');
  supportsLanguages = computed(() => this.sourceId() === 'mangadex');
  supportsSimilar = computed(() => this.sourceId() === 'mangadex');
  isComicsMode = computed(() => this.libraryMode() === 'comics');
  visibleChapterCount = signal(30);
  chapterOrder = signal<'newest' | 'oldest'>('newest');
  chapterFilter = signal('');
  chapterJump = signal('');
  continueReadingChapterId = signal<string | null>(null);
  continueReadingChapterLabel = signal<string | null>(null);

  filteredChapters = computed(() => {
    const raw = this.chapters();
    const filter = this.chapterFilter().trim().toLowerCase();
    const ordered = this.chapterOrder() === 'oldest' ? [...raw].reverse() : raw;

    if (!filter) return ordered;

    return ordered.filter((chapter) => {
      const bits = [
        chapter.chapter || '',
        chapter.title || '',
        chapter.volume || '',
        chapter.branch || '',
        chapter.scanlationGroup || '',
      ]
        .join(' ')
        .toLowerCase();
      return bits.includes(filter);
    });
  });

  visibleChapters = computed(() => this.filteredChapters().slice(0, this.visibleChapterCount()));
  hasMoreChapters = computed(() => this.filteredChapters().length > this.visibleChapterCount());
  filteredChapterCount = computed(() => this.filteredChapters().length);
  visibleFilteredChapterCount = computed(() => Math.min(this.visibleChapterCount(), this.filteredChapters().length));
  hasExternalChapters = computed(() => this.chapters().some((chapter) => chapter.isExternal));

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      this.resolveLibraryMode();
      const mangaId = this.fromRouteParam(params.get('mangaId'));
      if (!mangaId) return;
      const parsed = parseSourceEntityId(mangaId);
      this.sourceId.set(parsed?.sourceId || 'mangadex');
      this.loadData(mangaId);
    });
  }

  libraryRootPath() {
    return this.isComicsMode() ? '/books/comics' : '/books/manga';
  }

  detailBasePath() {
    return this.isComicsMode() ? '/books/comics' : '/books/manga';
  }

readBasePath() {
    const mangaId = this.detail()?.id ?? '';
    return this.isComicsMode() ? `/books/comics/${mangaId}/read` : `/books/manga/${mangaId}/read`;
  }

  toRouteParam(value: string) {
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

  sourceLabel() {
    const source = this.sourceId();
    if (source === 'mangadex') return 'MangaDex';
    if (source === 'weebcentral') return 'WeebCentral';
    if (source === 'asura') return 'Asura';
    if (source === 'manhwatop') return 'ManhwaTop';
    if (source === 'readcomicsonline') return 'ReadComicsOnline';
    return source;
  }

  private resolveLibraryMode() {
    const routePath = this.route.snapshot.routeConfig?.path || '';
    this.libraryMode.set(routePath.startsWith('books/comics') ? 'comics' : 'manga');
  }

  @HostListener('window:scroll')
  onWindowScroll() {
    this.showBackToTop.set(window.scrollY > 420);
  }

  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  toggleChapterOrder() {
    this.chapterOrder.update((current) => (current === 'newest' ? 'oldest' : 'newest'));
    this.visibleChapterCount.set(30);
  }

  onChapterFilterChange(value: string) {
    this.chapterFilter.set(value || '');
    this.visibleChapterCount.set(30);
  }

  jumpToChapter() {
    const raw = this.chapterJump().trim();
    if (!raw) return;

    const normalized = raw.toLowerCase();
    const target = this.filteredChapters().find((chapter) => {
      const chapterNo = (chapter.chapter || '').trim().toLowerCase();
      const label = this.chapterLabel(chapter).toLowerCase();
      return chapterNo === normalized || label.includes(normalized);
    });

    if (!target) return;
    this.scrollToChapter(target.id);
  }

  private scrollToChapter(chapterId: string) {
    const elementId = `np-chapter-${chapterId}`;
    setTimeout(() => {
      const el = document.getElementById(elementId);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  }

  rememberContinue(chapter: MangaChapter) {
    const manga = this.detail();
    if (!manga) return;
    try {
      const label = this.chapterLabel(chapter);
      localStorage.setItem(
        this.continueStorageKey(manga.id),
        JSON.stringify({ chapterId: chapter.id, at: Date.now(), label })
      );
      this.continueReadingChapterId.set(chapter.id);
      this.continueReadingChapterLabel.set(label);
    } catch {
      // ignore
    }
  }

  private continueStorageKey(mangaId: string) {
    return `np_books_continue_${mangaId}`;
  }

  languageLabel(code?: string | null) {
    const value = (code || '').toLowerCase();
    if (!value) return 'Unknown';
    const labels: Record<string, string> = {
      en: 'English',
      ja: 'Japanese',
      ko: 'Korean',
      zh: 'Chinese',
      'zh-hk': 'Chinese (HK)',
      'pt-br': 'Portuguese (BR)',
      es: 'Spanish',
      'es-la': 'Spanish (LATAM)',
      fr: 'French',
      de: 'German',
      id: 'Indonesian',
      it: 'Italian',
      ru: 'Russian',
      vi: 'Vietnamese',
      tr: 'Turkish',
      th: 'Thai',
      pl: 'Polish',
      ar: 'Arabic',
    };
    return labels[value] || value.toUpperCase();
  }

  onLanguageChange(language: string) {
    this.selectedLanguage.set(language || 'en');
    const mangaId = this.detail()?.id;
    if (mangaId) {
      this.loadChapters(mangaId);
    }
  }

  private loadChapters(mangaId: string) {
    this.isChaptersLoading.set(true);
    const language = this.selectedLanguage();
    const parsed = parseSourceEntityId(mangaId);
    if (!parsed) {
      this.chapters.set([]);
      this.visibleChapterCount.set(30);
      this.isChaptersLoading.set(false);
      return;
    }

    const query = new URLSearchParams({
      mangaId,
      ...(language && language !== 'all' ? { language } : {}),
    }).toString();
    const endpoint = `/api/v1/books/manga/source/${encodeURIComponent(parsed.sourceId)}/chapters-by-id?${query}`;
    this.http.get<{ status: string; data: MangaChapter[] }>(endpoint).subscribe({
      next: (response) => {
        this.chapters.set(response.data);
        this.visibleChapterCount.set(30);
        this.isChaptersLoading.set(false);
      },
      error: () => this.isChaptersLoading.set(false),
    });
  }

  private loadData(mangaId: string) {
    this.isLoading.set(true);
    this.isChaptersLoading.set(true);
    this.isSimilarLoading.set(false);
    const parsed = parseSourceEntityId(mangaId);
    if (!parsed) {
      this.detail.set(null);
      this.chapters.set([]);
      this.similar.set([]);
      this.isLoading.set(false);
      this.isChaptersLoading.set(false);
      this.isSimilarLoading.set(false);
      this.favorite.set(false);
      return;
    }

    const detailEndpoint = `/api/v1/books/manga/source/${encodeURIComponent(parsed.sourceId)}/detail-by-id?mangaId=${encodeURIComponent(mangaId)}`;
    this.http.get<{ status: string; data: MangaDetail }>(detailEndpoint).subscribe({
      next: (response) => {
        this.detail.set(response.data);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });

    this.loadChapters(mangaId);

    try {
      const stored = localStorage.getItem(this.continueStorageKey(mangaId));
      const parsedStored = stored
        ? (JSON.parse(stored) as { chapterId?: string; label?: string } | null)
        : null;
      this.continueReadingChapterId.set(parsedStored?.chapterId || null);
      this.continueReadingChapterLabel.set(parsedStored?.label || null);
    } catch {
      this.continueReadingChapterId.set(null);
      this.continueReadingChapterLabel.set(null);
    }

    if (parsed.sourceId === 'mangadex') {
      this.isSimilarLoading.set(true);
      const similarEndpoint = `/api/v1/books/manga/source/${encodeURIComponent(parsed.sourceId)}/similar-by-id?mangaId=${encodeURIComponent(mangaId)}&limit=6`;
      this.http.get<{ status: string; data: MangaSummary[] }>(similarEndpoint).subscribe({
        next: (response) => {
          this.similar.set(response.data);
          this.isSimilarLoading.set(false);
        },
        error: () => {
          this.similar.set([]);
          this.isSimilarLoading.set(false);
        },
      });
    } else {
      this.similar.set([]);
      this.isSimilarLoading.set(false);
    }

    if (this.isAuthenticated()) {
      this.http.get<{ status: string; data: { isFavorite: boolean } }>(`/api/v1/books/manga/favorites/${mangaId}/check`).subscribe({
        next: (response) => this.favorite.set(response.data.isFavorite),
        error: () => this.favorite.set(false),
      });
      // Load chapter-watch subscriptions so isWatchingManga() is up to date
      this.library.loadChapterWatches().catch(() => {/* ignore */});
    } else {
      this.favorite.set(false);
    }
  }

  private isAuthenticated() {
    return !!localStorage.getItem('token');
  }

  isFavorite() {
    return this.favorite();
  }

  toggleFavorite() {
    if (!this.isAuthenticated()) {
      return;
    }

    const manga = this.detail();
    if (!manga) return;

    if (this.favorite()) {
      this.http.delete(`/api/v1/books/manga/favorites/${manga.id}`).subscribe({
        next: () => this.favorite.set(false),
      });
      return;
    }

    this.http.post('/api/v1/books/manga/favorites', {
      mangaId: manga.id,
      title: manga.title,
      coverUrl: manga.coverUrl,
      status: manga.status || undefined,
    }).subscribe({
      next: () => this.favorite.set(true),
    });
  }

  /** Returns the composite sourceId:rawId for the currently loaded manga. */
  currentMangaId(): string {
    return this.detail()?.id ?? '';
  }

  toggleChapterWatch() {
    const manga = this.detail();
    if (!manga || !this.auth.currentUser()) return;
    this.library.toggleMangaWatch({
      mangaId: manga.id,
      mangaTitle: manga.title,
      mangaCoverUrl: manga.coverUrl ?? undefined,
    }).catch(console.error);
  }

  downloadChapter(chapter: MangaChapter, mangaTitle: string, coverUrl: string | null) {
    const manga = this.detail();
    if (!manga) return;

    const parsed = parseSourceEntityId(chapter.id);
    if (!parsed) return;

    const endpoint = `/api/v1/books/manga/source/${encodeURIComponent(parsed.sourceId)}/pages-by-id?chapterId=${encodeURIComponent(chapter.id)}`;
    this.http.get<{ status: string; data: { pages: string[] } }>(endpoint).subscribe({
      next: (res) => {
        const pageUrls = res.data?.pages ?? [];
        if (pageUrls.length === 0) return;
        this.mangaOffline.enqueue({
          mangaId: manga.id,
          mangaTitle,
          chapterId: chapter.id,
          chapterTitle: this.chapterLabel(chapter),
          chapterNumber: chapter.chapter ?? '',
          coverUrl: coverUrl ?? undefined,
          pageUrls,
        });
      },
      error: (err) => console.error('[MangaDetail] Failed to fetch pages for offline download', err),
    });
  }

  removeChapterOffline(chapterId: string) {
    this.mangaOffline.remove(chapterId).catch(console.error);
  }

  chapterLabel(chapter: MangaChapter): string {
    if (chapter.chapter) {
      return `Chapter ${chapter.chapter}`;
    }
    return chapter.title || 'Chapter';
  }

  chapterSubtitle(chapter: MangaChapter): string | null {
    const title = (chapter.title || '').trim();
    if (!title) return null;

    const chapterValue = (chapter.chapter || '').trim();
    if (!chapterValue) return title;

    const normalizedTitle = title.toLowerCase().replace(/\s+/g, ' ').trim();
    const chapterPatterns = [
      `ch. ${chapterValue}`,
      `chapter ${chapterValue}`,
      `ch ${chapterValue}`,
      chapterValue,
    ];

    if (chapterPatterns.some((pattern) => normalizedTitle === pattern.toLowerCase())) {
      return null;
    }

    return title;
  }
}
