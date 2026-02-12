import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

type ComicSummary = {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  status: string | null;
  latestChapter: string | null;
};

type DiscoverResponse = {
  status: string;
  data: {
    trending: ComicSummary[];
    recentlyUpdated: ComicSummary[];
    newTitles: ComicSummary[];
  };
};

type SearchResponse = {
  status: string;
  data: ComicSummary[];
};

@Component({
  selector: 'app-comics-library',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule],
  template: `
    <div class="container mx-auto px-4 py-10 books-theme">
      <div class="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="font-['Cinzel'] text-3xl text-[#24181b] dark:text-white">Comics Library</h1>
          <p class="mt-2 text-sm text-[#8a756e] dark:text-gray-400">
            Powered by ReadComicsOnline.ru. Explore trending western comics and graphic novels.
          </p>
        </div>
        <div class="flex gap-2">
          <a mat-stroked-button color="primary" routerLink="/books/manga">Manga</a>
          <a mat-stroked-button color="primary" routerLink="/books">Back to Hub</a>
        </div>
      </div>

      <mat-card class="mb-8 p-4" style="background: var(--bg-card); border: 1px solid var(--border-color);">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
          <mat-form-field
            appearance="fill"
            floatLabel="never"
            subscriptSizing="dynamic"
            class="np-search-field w-full"
          >
            <span matPrefix class="np-search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="7"></circle>
                <path d="M21 21l-4.3-4.3"></path>
              </svg>
            </span>
            <input
              matInput
              [(ngModel)]="query"
              (keyup.enter)="search()"
              aria-label="Search comics"
              placeholder="Search comics"
            />
          </mat-form-field>
          <button mat-flat-button color="primary" (click)="search()" [disabled]="isSearching()">{{ isSearching() ? 'Searching...' : 'Search' }}</button>
          <button mat-stroked-button color="primary" type="button" (click)="clearSearch()">Clear</button>
        </div>
      </mat-card>

      @if (error()) {
        <div class="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
          {{ error() }}
        </div>
      }

      @if (isLoadingDiscover() || isSearching()) {
        <div class="np-cover-grid">
          @for (i of [1,2,3,4,5,6,7,8,9,10,11,12]; track i) {
            <mat-card class="np-cover-card animate-pulse">
              <div class="np-cover-media"></div>
              <div class="np-cover-body">
                <div class="h-4 rounded bg-[#e5d2c6] dark:bg-cinema-800"></div>
                <div class="mt-2 h-3 w-2/3 rounded bg-[#e5d2c6] dark:bg-cinema-800"></div>
              </div>
            </mat-card>
          }
        </div>
      } @else {
        @if (searchResults().length > 0) {
          <section>
            <h2 class="mb-4 text-xl font-serif text-[#24181b] dark:text-white">Search Results</h2>
            <div class="np-cover-grid">
              @for (comic of searchResults(); track comic.id) {
                <mat-card class="np-cover-card">
                  <a [routerLink]="['/books/comics', toRouteParam(comic.id)]" class="np-cover-link">
                    <div class="np-cover-media">
                      @if (comic.coverUrl) {
                        <img [src]="comic.coverUrl" [alt]="comic.title" loading="lazy" decoding="async" referrerpolicy="no-referrer">
                      } @else {
                        <div class="absolute inset-0 flex items-center justify-center text-4xl">📖</div>
                      }
                    </div>
                    <div class="np-cover-body">
                      <div class="np-cover-title">{{ comic.title }}</div>
                      <div class="np-cover-meta">
                        @if (comic.latestChapter) { Latest: {{ comic.latestChapter }} • }
                        Comics
                      </div>
                    </div>
                  </a>
                </mat-card>
              }
            </div>
          </section>
        } @else {
          <section class="space-y-10">
            <div>
              <h2 class="mb-4 text-xl font-serif text-[#24181b] dark:text-white">Trending Comics</h2>
              <div class="np-cover-grid">
                @for (comic of discoverTrending(); track comic.id) {
                  <mat-card class="np-cover-card">
                    <a [routerLink]="['/books/comics', toRouteParam(comic.id)]" class="np-cover-link">
                      <div class="np-cover-media">
                        @if (comic.coverUrl) {
                          <img [src]="comic.coverUrl" [alt]="comic.title" loading="lazy" decoding="async" referrerpolicy="no-referrer">
                        } @else {
                          <div class="absolute inset-0 flex items-center justify-center text-4xl">📖</div>
                        }
                      </div>
                      <div class="np-cover-body">
                        <div class="np-cover-title">{{ comic.title }}</div>
                        <div class="np-cover-meta">
                          @if (comic.latestChapter) { Latest: {{ comic.latestChapter }} • }
                          Trending
                        </div>
                      </div>
                    </a>
                  </mat-card>
                }
              </div>
            </div>
          </section>
        }
      }
    </div>
  `,
})
export class ComicsLibraryComponent {
  private readonly http = inject(HttpClient);
  private readonly sourceId = 'readcomicsonline';

  query = '';
  error = signal<string | null>(null);
  isLoadingDiscover = signal(true);
  isSearching = signal(false);
  discoverTrending = signal<ComicSummary[]>([]);
  searchResults = signal<ComicSummary[]>([]);

  constructor() {
    this.loadDiscover();
  }

  loadDiscover() {
    this.error.set(null);
    this.isLoadingDiscover.set(true);
    const endpoint = `/api/v1/books/manga/source/${encodeURIComponent(this.sourceId)}/discover?limit=24`;
    this.http.get<DiscoverResponse>(endpoint).subscribe({
      next: (response) => {
        this.discoverTrending.set(response.data.trending || []);
        this.isLoadingDiscover.set(false);
      },
      error: () => {
        this.error.set('Unable to load comics right now. Please try again.');
        this.isLoadingDiscover.set(false);
      },
    });
  }

  search() {
    const normalized = this.query.trim();
    if (!normalized) {
      this.searchResults.set([]);
      return;
    }

    this.error.set(null);
    this.isSearching.set(true);
    const endpoint = `/api/v1/books/manga/source/${encodeURIComponent(this.sourceId)}/search?q=${encodeURIComponent(normalized)}&limit=30`;
    this.http.get<SearchResponse>(endpoint).subscribe({
      next: (response) => {
        this.searchResults.set(response.data || []);
        this.isSearching.set(false);
      },
      error: () => {
        this.error.set('Comic search failed. Please try again.');
        this.isSearching.set(false);
      },
    });
  }

  clearSearch() {
    this.query = '';
    this.searchResults.set([]);
  }

  toRouteParam(value: string) {
    return value;
  }
}
