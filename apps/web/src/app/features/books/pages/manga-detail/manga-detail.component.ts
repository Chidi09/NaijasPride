import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

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
  pages: number;
  publishedAt: string | null;
  readableAt: string | null;
  translatedLanguage: string | null;
  scanlationGroup: string | null;
  isOfficialTranslation?: boolean | null;
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
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="container mx-auto px-4 py-10">
      <a routerLink="/books/manga" class="mb-6 inline-block rounded border border-[#5f1327] px-3 py-2 text-xs text-[#d6b87a] hover:bg-[#5f1327]/20">Back to Manga Library</a>

      @if (isLoading()) {
        <section class="grid gap-6 md:grid-cols-[260px_1fr]">
          <div class="aspect-[3/4] animate-pulse rounded border border-zinc-800 bg-zinc-900"></div>
          <div class="space-y-3">
            <div class="h-8 w-3/4 animate-pulse rounded bg-zinc-900"></div>
            <div class="h-4 w-2/3 animate-pulse rounded bg-zinc-900"></div>
            <div class="h-4 w-full animate-pulse rounded bg-zinc-900"></div>
            <div class="h-4 w-5/6 animate-pulse rounded bg-zinc-900"></div>
            <div class="h-4 w-4/6 animate-pulse rounded bg-zinc-900"></div>
          </div>
        </section>
      }

      @if (detail(); as manga) {
        <section class="mb-8 grid gap-6 md:grid-cols-[260px_1fr]">
          <div class="relative aspect-[3/4] overflow-hidden rounded border border-[#5f1327]/40 bg-zinc-900">
            @if (manga.coverUrl) {
              <img [src]="manga.coverUrl" [alt]="manga.title" class="absolute inset-0 h-full w-full object-cover">
            } @else {
              <div class="flex h-full items-center justify-center text-4xl">📘</div>
            }
          </div>

          <div>
            <h1 class="text-2xl font-semibold text-white md:text-3xl">{{ manga.title }}</h1>
            <div class="mt-3 flex flex-wrap gap-2 text-xs text-gray-300">
              <span class="rounded border border-[#5f1327] px-2 py-1 text-[#d6b87a]">{{ sourceLabel() }}</span>
              @if (manga.status) { <span class="rounded border border-zinc-700 px-2 py-1">{{ manga.status }}</span> }
              @if (manga.year) { <span class="rounded border border-zinc-700 px-2 py-1">{{ manga.year }}</span> }
              @if (manga.originalLanguage) { <span class="rounded border border-zinc-700 px-2 py-1">{{ manga.originalLanguage }}</span> }
              @if (manga.contentRating) { <span class="rounded border border-zinc-700 px-2 py-1">{{ manga.contentRating }}</span> }
              @if (manga.publicationDemographic) { <span class="rounded border border-zinc-700 px-2 py-1">{{ manga.publicationDemographic }}</span> }
            </div>

            <p class="mt-4 text-sm text-gray-300">{{ manga.description || 'No description available.' }}</p>

            <div class="mt-4 text-xs text-gray-400">
              @if (manga.author) { <p>Author: {{ manga.author }}</p> }
              @if (manga.artist) { <p>Artist: {{ manga.artist }}</p> }
            </div>

            <div class="mt-4">
              <p class="mb-2 text-xs uppercase tracking-wide text-gray-400">Available chapter languages</p>
              <div class="flex flex-wrap gap-2">
                @for (lang of manga.availableTranslatedLanguages; track lang) {
                  <span class="rounded border border-zinc-700 px-2 py-1 text-xs text-gray-200">{{ languageLabel(lang) }}</span>
                }
              </div>
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              @for (tag of manga.tags; track tag) {
                <span class="rounded border border-[#5f1327]/60 bg-[#120a0d] px-2 py-1 text-xs text-[#d6b87a]">{{ tag }}</span>
              }
            </div>

            <div class="mt-5">
              <button (click)="toggleFavorite()" class="rounded border border-[#5f1327] px-3 py-2 text-sm text-white hover:bg-[#800020]">
                {{ isFavorite() ? '★ Favorited' : '☆ Add to Favorites' }}
              </button>
            </div>
          </div>
        </section>

        <section class="mb-8 rounded-xl border border-[#5f1327]/40 bg-[#120a0d]/70 p-4">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-lg font-semibold text-[#d6b87a]">Chapters</h2>
            <div class="flex items-center gap-3">
              <label class="text-xs text-gray-300">
                <span class="mr-2">Language</span>
                <select
                  [ngModel]="selectedLanguage()"
                  (ngModelChange)="onLanguageChange($event)"
                  class="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white"
                >
                  <option value="all">All</option>
                  @if (detail(); as current) {
                    @for (lang of current.availableTranslatedLanguages; track lang) {
                      <option [value]="lang">{{ languageLabel(lang) }}</option>
                    }
                  }
                </select>
              </label>
              <span class="text-xs text-gray-400">{{ isChaptersLoading() ? 'Loading...' : (chapters().length + ' loaded') }}</span>
            </div>
          </div>
          @if (hasExternalChapters()) {
            <div class="mb-3 rounded border border-amber-700/50 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
              Some chapters are hosted externally and will open on their original source.
            </div>
          }
          @if (!isChaptersLoading() && chapters().length === 0) {
            <p class="text-sm text-gray-400">No chapters found.</p>
          }
          @if (isChaptersLoading()) {
            <div class="space-y-2">
              @for (_ of [1,2,3,4,5]; track _) {
                <div class="h-14 animate-pulse rounded border border-zinc-800 bg-zinc-900/60"></div>
              }
            </div>
          }
          <div class="max-h-[70vh] space-y-2 overflow-auto pr-1">
            <div class="sticky top-0 z-10 -mx-1 mb-2 border-b border-zinc-800 bg-[#120a0d]/95 px-1 py-2 text-[11px] uppercase tracking-wide text-gray-400">
              Chapter list (newest first)
            </div>
            @for (chapter of visibleChapters(); track chapter.id) {
              @if (chapter.isExternal && chapter.externalUrl) {
                <a
                  [href]="chapter.externalUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="block rounded border border-amber-700/40 bg-amber-900/10 px-3 py-3 text-sm text-gray-200 hover:border-amber-500"
                >
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <p class="font-medium">
                      Ch. {{ chapter.chapter || '?' }}
                      <span class="text-gray-400">{{ chapter.title || '' }}</span>
                    </p>
                    <span class="rounded border border-amber-600/50 px-2 py-0.5 text-[11px] text-amber-300">External</span>
                  </div>
                  <div class="mt-1 flex flex-wrap gap-3 text-xs text-gray-400">
                    <span>{{ languageLabel(chapter.translatedLanguage) }}</span>
                    @if (chapter.scanlationGroup) { <span>{{ chapter.scanlationGroup }}</span> }
                    @if (chapter.isOfficialTranslation === true) {
                      <span class="rounded border border-emerald-700/60 px-1.5 py-0.5 text-emerald-300">Official</span>
                    } @else if (chapter.isOfficialTranslation === false) {
                      <span class="rounded border border-sky-700/60 px-1.5 py-0.5 text-sky-300">Community</span>
                    } @else {
                      <span class="rounded border border-zinc-600/70 px-1.5 py-0.5 text-zinc-300">Unverified</span>
                    }
                    <span>Open source site</span>
                  </div>
                </a>
              } @else {
                <a
                  [routerLink]="['/books/manga/read', chapter.id]"
                  [queryParams]="{ title: manga.title, chapter: chapter.chapter || '', mangaId: manga.id }"
                  class="block rounded border border-zinc-800 bg-zinc-900/50 px-3 py-3 text-sm text-gray-200 hover:border-[#800020]"
                >
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <p class="font-medium">
                      Ch. {{ chapter.chapter || '?' }}
                      <span class="text-gray-400">{{ chapter.title || '' }}</span>
                    </p>
                    <span class="text-xs text-gray-500">{{ chapter.publishedAt ? (chapter.publishedAt | date: 'mediumDate') : 'Unknown date' }}</span>
                  </div>
                  <div class="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
                    <span>{{ chapter.pages }} pages</span>
                    <span>{{ languageLabel(chapter.translatedLanguage) }}</span>
                    @if (chapter.isOfficialTranslation === true) {
                      <span class="rounded border border-emerald-700/60 px-1.5 py-0.5 text-emerald-300">Official</span>
                    } @else if (chapter.isOfficialTranslation === false) {
                      <span class="rounded border border-sky-700/60 px-1.5 py-0.5 text-sky-300">Community</span>
                    } @else {
                      <span class="rounded border border-zinc-600/70 px-1.5 py-0.5 text-zinc-300">Unverified</span>
                    }
                    @if (chapter.volume) { <span>Vol. {{ chapter.volume }}</span> }
                    @if (chapter.scanlationGroup) { <span>{{ chapter.scanlationGroup }}</span> }
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
                class="rounded border border-[#5f1327] px-4 py-2 text-xs text-[#d6b87a] hover:bg-[#5f1327]/20"
              >Load 30 more chapters</button>
            </div>
          }
        </section>

        <section>
          <h2 class="mb-4 text-lg font-semibold text-[#d6b87a]">Similar Manga</h2>
          @if (isSimilarLoading()) {
            <div class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
              @for (_ of [1,2,3,4,5,6]; track _) {
                <div class="aspect-[3/4] animate-pulse rounded border border-zinc-800 bg-zinc-900"></div>
              }
            </div>
          }
          @if (!isSimilarLoading()) {
            <div class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
              @for (item of similar(); track item.id) {
                <a [routerLink]="['/books/manga', item.id]" class="overflow-hidden rounded border border-[#5f1327]/30 bg-[#120a0d] hover:border-[#800020]">
                  <div class="relative aspect-[3/4]">
                    @if (item.coverUrl) {
                      <img [src]="item.coverUrl" [alt]="item.title" class="absolute inset-0 h-full w-full object-cover">
                    } @else {
                      <div class="flex h-full items-center justify-center bg-zinc-800 text-3xl">📘</div>
                    }
                  </div>
                  <div class="p-2">
                    <p class="line-clamp-2 text-xs text-white">{{ item.title }}</p>
                    @if (item.latestChapter) {
                      <p class="mt-1 text-[11px] text-[#d6b87a]">Ch. {{ item.latestChapter }}</p>
                    }
                  </div>
                </a>
              }
            </div>
          }
        </section>
      }

      @if (showBackToTop()) {
        <button
          type="button"
          (click)="scrollToTop()"
          class="fixed bottom-5 right-4 z-20 rounded-full border border-[#5f1327] bg-[#120a0d] px-3 py-2 text-xs text-[#d6b87a] shadow-lg hover:bg-[#800020] md:bottom-8"
        >Top</button>
      }
    </div>
  `,
})
export class MangaDetailComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  isLoading = signal(true);
  detail = signal<MangaDetail | null>(null);
  chapters = signal<MangaChapter[]>([]);
  similar = signal<MangaSummary[]>([]);
  favorite = signal(false);
  isChaptersLoading = signal(false);
  isSimilarLoading = signal(false);
  showBackToTop = signal(false);
  selectedLanguage = signal('all');
  sourceId = signal('mangadex');
  visibleChapterCount = signal(30);
  visibleChapters = computed(() => this.chapters().slice(0, this.visibleChapterCount()));
  hasMoreChapters = computed(() => this.chapters().length > this.visibleChapterCount());
  hasExternalChapters = computed(() => this.chapters().some((chapter) => chapter.isExternal));

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const mangaId = params.get('mangaId');
      if (!mangaId) return;
      const parsed = parseSourceEntityId(mangaId);
      this.sourceId.set(parsed?.sourceId || 'mangadex');
      this.loadData(mangaId);
    });
  }

  sourceLabel() {
    const source = this.sourceId();
    if (source === 'mangadex') return 'MangaDex';
    if (source === 'weebcentral') return 'WeebCentral';
    if (source === 'asura') return 'Asura';
    return source;
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
    this.selectedLanguage.set(language || 'all');
    const mangaId = this.detail()?.id;
    if (mangaId) {
      this.loadChapters(mangaId);
    }
  }

  private loadChapters(mangaId: string) {
    this.isChaptersLoading.set(true);
    const language = this.selectedLanguage();
    const params = language && language !== 'all' ? `?language=${encodeURIComponent(language)}` : '';
    const parsed = parseSourceEntityId(mangaId);
    const encodedMangaId = encodeURIComponent(mangaId);
    const endpoint = parsed
      ? `/api/v1/books/manga/source/${encodeURIComponent(parsed.sourceId)}/${encodedMangaId}/chapters${params}`
      : `/api/v1/books/manga/${mangaId}/chapters${params}`;
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
    this.isSimilarLoading.set(true);
    const parsed = parseSourceEntityId(mangaId);
    const encodedMangaId = encodeURIComponent(mangaId);
    const detailEndpoint = parsed
      ? `/api/v1/books/manga/source/${encodeURIComponent(parsed.sourceId)}/${encodedMangaId}`
      : `/api/v1/books/manga/${mangaId}`;
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

    const similarEndpoint = parsed
      ? `/api/v1/books/manga/source/${encodeURIComponent(parsed.sourceId)}/${encodedMangaId}/similar?limit=6`
      : `/api/v1/books/manga/${mangaId}/similar?limit=6`;
    this.http.get<{ status: string; data: MangaSummary[] }>(similarEndpoint).subscribe({
      next: (response) => {
        this.similar.set(response.data);
        this.isSimilarLoading.set(false);
      },
      error: () => this.isSimilarLoading.set(false),
    });

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
}
