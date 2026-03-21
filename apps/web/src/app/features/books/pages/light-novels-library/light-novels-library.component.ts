import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient, HttpParams } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { PaginatorComponent } from '../../../../shared/components/paginator/paginator.component';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

type LightNovelVolume = {
  id: string;
  title: string;
  slug: string;
  author: string;
  year: number;
  coverUrl: string | null;
  format: string;
  downloadUrl: string | null;
  fileSize: number | null;
  publisher: string | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  volumeNumber: number | null;
};

type LightNovelSeries = {
  seriesKey: string;
  seriesTitle: string;
  totalVolumes: number;
  latestYear: number;
  coverUrl: string | null;
  volumes: LightNovelVolume[];
};

type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

type BookProgressResponse = {
  status: string;
  data?: {
    page?: number;
  } | null;
};

@Component({
  selector: 'app-light-novels-library',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatCardModule, MatButtonModule, PaginatorComponent],
  template: `
    <div class="mx-auto w-full max-w-6xl px-3 py-6 sm:px-4 sm:py-8 books-theme">
      <div class="mb-6 rounded-3xl border border-[#e6d7cc] bg-[linear-gradient(135deg,#fff9f6_0%,#fff3ec_40%,#fde9de_100%)] p-4 shadow-sm dark:border-cinema-700 dark:bg-[linear-gradient(135deg,#161116_0%,#20151b_40%,#2c1821_100%)] sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-[11px] uppercase tracking-[0.24em] text-[#8a756e] dark:text-gray-400">Library</p>
            <h1 class="mt-1 text-2xl font-serif text-[#24181b] dark:text-white sm:text-3xl">Light Novels</h1>
            <p class="mt-2 max-w-2xl text-sm text-[#7d6660] dark:text-gray-300">
              Read by series, jump between volumes, and continue your story without leaving NaijasPride.
            </p>
          </div>

          <div class="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <a mat-stroked-button color="primary" routerLink="/books">Hub</a>
            <a mat-stroked-button color="primary" routerLink="/books/all">Books</a>
            <a mat-stroked-button color="primary" routerLink="/books/comics">Comics</a>
            <a mat-stroked-button color="primary" routerLink="/books/manga">Manga</a>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input
            [(ngModel)]="searchQuery"
            (keyup.enter)="applySearch()"
            type="text"
            placeholder="Search series, title, or volume"
            class="h-11 rounded-xl border border-[#d8c2b8] bg-white/80 px-4 text-[#24181b] outline-none transition focus:border-[#800020] dark:border-cinema-700 dark:bg-cinema-900/80 dark:text-white"
          >
          <button mat-flat-button color="primary" class="h-11" (click)="applySearch()">Search</button>
          @if (searchQuery.trim() || appliedQuery) {
            <button mat-stroked-button color="primary" class="h-11" (click)="clearSearch()">Clear</button>
          }
        </div>
      </div>

      @if (isLoading()) {
        <div class="grid gap-4 sm:grid-cols-2">
          @for (i of [1,2,3,4]; track i) {
            <mat-card class="np-surface-card animate-pulse p-4">
              <div class="h-6 w-2/5 rounded bg-[#e5d2c6] dark:bg-cinema-800"></div>
              <div class="mt-3 h-4 w-4/5 rounded bg-[#e5d2c6] dark:bg-cinema-800"></div>
              <div class="mt-3 h-4 w-3/5 rounded bg-[#e5d2c6] dark:bg-cinema-800"></div>
            </mat-card>
          }
        </div>
      }

      @if (!isLoading() && series().length === 0) {
        <div class="rounded-2xl border border-dashed border-[#d4bcb1] bg-white/70 px-4 py-16 text-center text-[#8a756e] dark:border-cinema-700 dark:bg-cinema-900/50 dark:text-gray-400">
          <span class="text-5xl">📚</span>
          <p class="mt-4 text-lg font-serif text-[#24181b] dark:text-white">No light novel series found.</p>
          <p class="text-[#9a857d] dark:text-gray-500">Try a different search keyword or run the Elsci import again.</p>
        </div>
      }

      @if (!isLoading() && series().length > 0) {
        <div class="grid gap-4 sm:gap-5 lg:grid-cols-2">
          @for (item of series(); track item.seriesKey) {
            <mat-card class="overflow-hidden rounded-2xl border border-[#ecdcd3] bg-[var(--bg-card)] shadow-sm dark:border-cinema-800">
              <div class="flex gap-0">
                <!-- Fixed-size cover — never stretches with volume list height -->
                <div class="relative h-48 w-32 flex-shrink-0 overflow-hidden bg-[#d9c4b7] dark:bg-cinema-900">
                  @if (item.coverUrl) {
                    <img [src]="item.coverUrl" [alt]="item.seriesTitle" class="h-full w-full object-cover" loading="lazy" referrerpolicy="no-referrer">
                  } @else {
                    <div class="flex h-full w-full items-center justify-center text-4xl">📘</div>
                  }

                  <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-white/85">
                    Series
                  </div>

                  @if (getSeriesProgress(item.volumes); as progress) {
                    <div class="absolute inset-x-0 bottom-0 h-1 bg-black/55">
                      <div class="h-full bg-[#8a1c1c] transition-all duration-300" [style.width.%]="progress"></div>
                    </div>
                  }
                </div>

                <div class="min-w-0 flex-1 p-3 sm:p-4">
                  <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <h2 class="text-lg font-serif leading-tight text-[#24181b] dark:text-white sm:text-xl">{{ item.seriesTitle }}</h2>
                    <p class="text-xs uppercase tracking-[0.14em] text-[#8a756e] dark:text-gray-400">
                      {{ item.totalVolumes }} Volumes • {{ item.latestYear }}
                    </p>
                  </div>

                  <p class="mt-1 text-xs uppercase tracking-[0.12em] text-[#8a756e] dark:text-gray-400">
                    {{ seriesAuthor(item) }}
                  </p>

                  @if (seriesBlurb(item); as blurb) {
                    <p class="mt-2 line-clamp-2 text-sm text-[#6f5952] dark:text-gray-300">{{ blurb }}</p>
                  }

                  <div class="mt-3 grid gap-2">
                    @for (volume of visibleVolumes(item); track volume.id) {
                      <div class="group relative overflow-hidden rounded-lg border border-[#e6d7cc] dark:border-cinema-800 transition hover:border-[#800020]">
                        <div class="flex items-center gap-2 px-3 py-2">
                          <a
                            [routerLink]="['/books/novel', volume.slug]"
                            class="min-w-0 flex-1 flex items-center gap-1"
                          >
                            <span class="truncate text-sm text-[#24181b] dark:text-white">
                              @if (volume.volumeNumber !== null) {
                                <strong class="font-semibold">Vol {{ volume.volumeNumber }}:</strong>
                              }
                              {{ volume.title }}
                            </span>
                            <span class="shrink-0 text-xs text-[#8a756e] dark:text-gray-400 ml-1">{{ volume.year }}</span>
                          </a>

                          <!-- Action buttons -->
                          <div class="shrink-0 flex items-center gap-1">
                            <a
                              [routerLink]="['/books/novel', volume.slug, 'read']"
                              class="inline-flex items-center gap-1 rounded-md bg-[#800020] px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-[#a3213a]"
                              title="Read online"
                            >
                              Read
                            </a>
                            @if (volume.downloadUrl) {
                              <a
                                [href]="volume.downloadUrl"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="inline-flex items-center gap-1 rounded-md border border-[#d4bcb1] px-2.5 py-1 text-[11px] font-semibold text-[#6f5952] transition hover:border-[#800020] hover:text-[#800020] dark:border-cinema-700 dark:text-gray-400 dark:hover:border-[#800020] dark:hover:text-white"
                                title="Download EPUB"
                              >
                                ↓
                              </a>
                            }
                          </div>
                        </div>

                        @if (getBookProgress(volume.slug); as progress) {
                          <div class="absolute inset-x-0 bottom-0 h-1 bg-black/25">
                            <div class="h-full bg-[#8a1c1c] transition-all duration-300" [style.width.%]="progress"></div>
                          </div>
                        }
                      </div>
                    }

                    @if (item.volumes.length > 3) {
                      <button
                        type="button"
                        class="mt-1 rounded-lg border border-dashed border-[#d4bcb1] px-3 py-1.5 text-xs text-[#8a756e] transition hover:border-[#800020] hover:text-[#800020] dark:border-cinema-700 dark:text-gray-400 dark:hover:border-[#800020]"
                        (click)="toggleExpand(item.seriesKey)"
                      >
                        {{ isExpanded(item.seriesKey) ? 'Show less' : 'Show all ' + item.volumes.length + ' volumes' }}
                      </button>
                    }
                  </div>
                </div>
              </div>
            </mat-card>
          }
        </div>

        @if (meta()) {
          <app-paginator
            [currentPage]="meta()!.page"
            [totalPages]="meta()!.totalPages"
            (pageChange)="onPageChange($event)"
          />
        }
      }
    </div>
  `,
})
export class LightNovelsLibraryComponent {
  private http = inject(HttpClient);

  series = signal<LightNovelSeries[]>([]);
  meta = signal<PaginationMeta | null>(null);
  isLoading = signal(true);
  bookProgressBySlug = signal<Record<string, number>>({});
  expandedSeries = signal<Set<string>>(new Set());

  page = signal(1);
  searchQuery = '';
  appliedQuery = '';

  constructor() {
    this.loadSeries();
  }

  applySearch() {
    this.appliedQuery = this.searchQuery.trim();
    this.page.set(1);
    this.loadSeries();
  }

  clearSearch() {
    this.searchQuery = '';
    this.appliedQuery = '';
    this.page.set(1);
    this.loadSeries();
  }

  onPageChange(nextPage: number) {
    this.page.set(nextPage);
    this.loadSeries();
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  private loadSeries() {
    this.isLoading.set(true);

    let params = new HttpParams()
      .set('page', String(this.page()))
      .set('limit', '10');

    if (this.appliedQuery) {
      params = params.set('q', this.appliedQuery);
    }

    this.http
      .get<{ status: string; data: LightNovelSeries[]; meta: PaginationMeta }>('/api/v1/books/light-novels', { params })
      .subscribe({
        next: (response) => {
          this.series.set(response.data || []);
          const slugs = (response.data || []).flatMap((entry) => entry.volumes.map((volume) => volume.slug));
          this.loadBookProgress(slugs);
          this.meta.set(response.meta || null);
          this.isLoading.set(false);
        },
        error: (error) => {
          console.error('Error loading light novel series:', error);
          this.series.set([]);
          this.bookProgressBySlug.set({});
          this.meta.set(null);
          this.isLoading.set(false);
        },
      });
  }

  toggleExpand(seriesKey: string) {
    const current = new Set(this.expandedSeries());
    if (current.has(seriesKey)) {
      current.delete(seriesKey);
    } else {
      current.add(seriesKey);
    }
    this.expandedSeries.set(current);
  }

  private firstVolume(series: LightNovelSeries): LightNovelVolume | undefined {
    if (!series.volumes?.length) return undefined;
    return [...series.volumes].sort((a, b) => {
      const av = a.volumeNumber ?? Number.MAX_SAFE_INTEGER;
      const bv = b.volumeNumber ?? Number.MAX_SAFE_INTEGER;
      if (av !== bv) return av - bv;
      return a.title.localeCompare(b.title);
    })[0];
  }

  seriesAuthor(series: LightNovelSeries): string {
    const author = this.firstVolume(series)?.author?.trim();
    if (!author || author.toLowerCase() === 'unknown' || author.toLowerCase() === 'unknown author') {
      return 'Author unavailable';
    }
    return author;
  }

  seriesBlurb(series: LightNovelSeries): string {
    const raw = this.firstVolume(series)?.description?.trim() || '';
    if (!raw) return '';
    const cleaned = raw
      .replace(/(?:^|\n)\s*series\s*:[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*volume\s*:[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*source file\s*:[^\n]*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned;
  }

  isExpanded(seriesKey: string): boolean {
    return this.expandedSeries().has(seriesKey);
  }

  visibleVolumes(item: LightNovelSeries): LightNovelVolume[] {
    if (this.isExpanded(item.seriesKey) || item.volumes.length <= 3) {
      return item.volumes;
    }
    return item.volumes.slice(0, 3);
  }

  getBookProgress(slug?: string): number | null {
    if (!slug) return null;
    const value = this.bookProgressBySlug()[slug];
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return null;
    return Math.max(0, Math.min(100, value));
  }

  getSeriesProgress(volumes: LightNovelVolume[]): number | null {
    let max = 0;
    for (const volume of volumes) {
      const progress = this.getBookProgress(volume.slug) ?? 0;
      if (progress > max) {
        max = progress;
      }
    }
    return max > 0 ? max : null;
  }

  private loadBookProgress(slugs: string[]) {
    const uniqueSlugs = Array.from(new Set(slugs.filter(Boolean))).slice(0, 80);
    if (uniqueSlugs.length === 0) {
      this.bookProgressBySlug.set({});
      return;
    }

    const requests = uniqueSlugs.map((slug) =>
      this.http
        .get<BookProgressResponse>(`/api/v1/books/progress/${encodeURIComponent(slug)}`)
        .pipe(
          map((response) => {
            const page = response?.data?.page ?? 0;
            return { slug, percentage: Math.max(0, Math.min(100, page)) };
          }),
          catchError(() => of({ slug, percentage: 0 })),
        ),
    );

    forkJoin(requests).subscribe((entries) => {
      const next: Record<string, number> = {};
      for (const entry of entries) {
        if (entry.percentage > 0) {
          next[entry.slug] = entry.percentage;
        }
      }
      this.bookProgressBySlug.set(next);
    });
  }
}
