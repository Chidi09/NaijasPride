import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

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
                <img [src]="manga.coverUrl" [alt]="manga.title" referrerpolicy="no-referrer">
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

            <div class="mt-5">
              <button mat-stroked-button color="primary" type="button" (click)="toggleFavorite()">
                {{ isFavorite() ? '★ Favorited' : '☆ Add to Favorites' }}
              </button>
            </div>
          </div>
        </section>

        <mat-card class="np-surface-card mb-8 p-4">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-lg font-semibold text-[var(--text-primary)]">Chapters</h2>
            <div class="flex items-center gap-3">
              @if (supportsLanguages()) {
                <mat-form-field
                  appearance="fill"
                  floatLabel="never"
                  subscriptSizing="dynamic"
                  class="np-search-field w-52"
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
              <span class="text-xs text-[#8a756e] dark:text-gray-400">{{ isChaptersLoading() ? 'Loading...' : (chapters().length + ' loaded') }}</span>
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
          <div class="max-h-[70vh] space-y-2 overflow-auto pr-1">
            <div class="sticky top-0 z-10 -mx-1 mb-2 border-b border-[#d8c2b8] dark:border-zinc-800 bg-[#f1e5dd] dark:bg-[#120a0d]/95 px-1 py-2 text-[11px] uppercase tracking-wide text-[#8a756e] dark:text-gray-400">
              Chapter list (newest first)
            </div>
            @for (chapter of visibleChapters(); track chapter.id) {
              @if (chapter.isExternal && chapter.externalUrl) {
                <a
                  [href]="chapter.externalUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="block rounded border border-amber-700/40 bg-amber-900/10 px-3 py-3 text-sm text-[#24181b] dark:text-gray-200 hover:border-amber-500"
                >
                  <div class="flex items-center justify-between gap-2">
                    <p class="font-medium">
                      {{ chapterLabel(chapter) }}
                      @if (chapterSubtitle(chapter)) {
                        <span class="text-[#8a756e] dark:text-gray-400">{{ chapterSubtitle(chapter) }}</span>
                      }
                    </p>
                    <span class="rounded border border-amber-600/50 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">External</span>
                  </div>
                  <div class="mt-1 flex items-center gap-2 text-xs text-[#8a756e] dark:text-gray-400">
                    @if (chapter.branch) {
                      <span>{{ chapter.branch }}</span>
                    }
                    @if (chapter.volume) {
                      <span>Vol. {{ chapter.volume }}</span>
                    }
                    <span>Open source site</span>
                  </div>
                </a>
              } @else {
                <a
                  [routerLink]="[readBasePath(), toRouteParam(chapter.id)]"
                  [queryParams]="{ title: manga.title, chapter: chapter.chapter || '', mangaId: manga.id }"
                  class="block rounded border border-[#d8c2b8] dark:border-zinc-800 bg-[#f1e5dd] dark:bg-zinc-900/50 px-3 py-3 text-sm text-[#24181b] dark:text-gray-200 hover:border-[#800020]"
                >
                  <div class="flex items-center justify-between gap-2">
                    <p class="font-medium">
                      {{ chapterLabel(chapter) }}
                      @if (chapterSubtitle(chapter)) {
                        <span class="text-[#8a756e] dark:text-gray-400">{{ chapterSubtitle(chapter) }}</span>
                      }
                    </p>
                    <span class="text-xs text-[#9a857d] dark:text-gray-500">
                      {{ chapter.publishedAt ? (chapter.publishedAt | date: 'MMM d, y') : '' }}
                    </span>
                  </div>
                  <div class="mt-1 flex items-center gap-2 text-xs text-[#9a857d] dark:text-gray-500">
                    @if (chapter.branch) {
                      <span>{{ chapter.branch }}</span>
                    }
                    @if (chapter.volume) {
                      <span>Vol. {{ chapter.volume }}</span>
                    }
                  </div>
                </a>
              }
            }
          </div>
          @if (hasMoreChapters()) {
            <div class="mt-4 text-center">
              <button
                type="button"
                (click)="visibleChapterCount.set(visibleChapterCount() + 30)"
                class="rounded border border-[#d8c2b8] dark:border-[#5f1327] px-4 py-2 text-xs text-[#9a6d1f] dark:text-[#d6b87a] hover:bg-[#f1e5dd] dark:hover:bg-[#5f1327]/20"
              >Load 30 more chapters</button>
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
                          <img [src]="item.coverUrl" [alt]="item.title" referrerpolicy="no-referrer">
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
        <button
          type="button"
          (click)="scrollToTop()"
          class="fixed bottom-5 right-4 z-20 rounded-full border border-[#d8c2b8] dark:border-[#5f1327] bg-[#f1e5dd] dark:bg-[#120a0d] px-3 py-2 text-xs text-[#9a6d1f] dark:text-[#d6b87a] shadow-lg hover:bg-[#e6d5c9] dark:hover:bg-[#800020] md:bottom-8"
        >Top</button>
      }
    </div>
  `,
})
export class MangaDetailComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

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
  visibleChapters = computed(() => this.chapters().slice(0, this.visibleChapterCount()));
  hasMoreChapters = computed(() => this.chapters().length > this.visibleChapterCount());
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
    return this.isComicsMode() ? '/books/comics/read' : '/books/manga/read';
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
