import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient, HttpParams } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { PaginatorComponent } from '../../../../shared/components/paginator/paginator.component';

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

@Component({
  selector: 'app-light-novels-library',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatCardModule, MatButtonModule, PaginatorComponent],
  template: `
    <div class="container mx-auto px-4 py-12 books-theme">
      <div class="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 class="text-3xl font-serif text-[#24181b] dark:text-white">Light Novels</h1>
          <p class="text-[#8a756e] dark:text-gray-400 mt-2">
            Grouped by series and sorted by volume number.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <a mat-stroked-button color="primary" routerLink="/books">Hub</a>
          <a mat-stroked-button color="primary" routerLink="/books/all">Books</a>
          <a mat-stroked-button color="primary" routerLink="/books/comics">Comics</a>
          <a mat-stroked-button color="primary" routerLink="/books/manga">Manga</a>
        </div>
      </div>

      <div class="mb-6 flex flex-col sm:flex-row gap-3">
        <input
          [(ngModel)]="searchQuery"
          (keyup.enter)="applySearch()"
          type="text"
          placeholder="Search series or title"
          class="flex-1 rounded-lg border border-[#d8c2b8] dark:border-cinema-700 bg-white dark:bg-cinema-900 px-4 py-2 text-[#24181b] dark:text-white outline-none"
        >
        <button mat-flat-button color="primary" (click)="applySearch()">Search</button>
      </div>

      @if (isLoading()) {
        <div class="grid gap-4">
          @for (i of [1,2,3]; track i) {
            <mat-card class="np-surface-card p-4 animate-pulse">
              <div class="h-6 w-2/5 rounded bg-[#e5d2c6] dark:bg-cinema-800"></div>
              <div class="mt-4 h-4 w-3/4 rounded bg-[#e5d2c6] dark:bg-cinema-800"></div>
            </mat-card>
          }
        </div>
      }

      @if (!isLoading() && series().length === 0) {
        <div class="text-center py-24 text-[#8a756e] dark:text-gray-400">
          <span class="text-6xl">📚</span>
          <p class="text-lg font-serif text-[#24181b] dark:text-white mt-4">No light novel series found.</p>
          <p class="text-[#9a857d] dark:text-gray-500">Try a different search or run Elsci import again.</p>
        </div>
      }

      @if (!isLoading() && series().length > 0) {
        <div class="space-y-4">
          @for (item of series(); track item.seriesKey) {
            <mat-card class="np-surface-card p-4">
              <div class="flex gap-4 items-start">
                <div class="w-20 h-28 rounded overflow-hidden bg-[#d9c4b7] dark:bg-cinema-800 shrink-0">
                  @if (item.coverUrl) {
                    <img [src]="item.coverUrl" [alt]="item.seriesTitle" class="w-full h-full object-cover" loading="lazy">
                  } @else {
                    <div class="w-full h-full flex items-center justify-center text-2xl">📘</div>
                  }
                </div>

                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <h2 class="text-xl font-serif text-[#24181b] dark:text-white">{{ item.seriesTitle }}</h2>
                    <p class="text-xs text-[#8a756e] dark:text-gray-400 uppercase tracking-wide">
                      {{ item.totalVolumes }} volumes • Latest {{ item.latestYear }}
                    </p>
                  </div>

                  <div class="mt-3 grid gap-2">
                    @for (volume of item.volumes; track volume.id) {
                      <a
                        [routerLink]="['/books', volume.slug]"
                        class="rounded border border-[#e6d7cc] dark:border-cinema-800 px-3 py-2 hover:border-[#800020] transition flex items-center justify-between gap-2"
                      >
                        <span class="text-sm text-[#24181b] dark:text-white truncate">
                          @if (volume.volumeNumber !== null) {
                            <strong>Vol {{ volume.volumeNumber }}:</strong>
                          }
                          {{ volume.title }}
                        </span>
                        <span class="text-xs text-[#8a756e] dark:text-gray-400">{{ volume.year }}</span>
                      </a>
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

  page = signal(1);
  searchQuery = '';
  private appliedQuery = '';

  constructor() {
    this.loadSeries();
  }

  applySearch() {
    this.appliedQuery = this.searchQuery.trim();
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
          this.meta.set(response.meta || null);
          this.isLoading.set(false);
        },
        error: (error) => {
          console.error('Error loading light novel series:', error);
          this.series.set([]);
          this.meta.set(null);
          this.isLoading.set(false);
        },
      });
  }
}
