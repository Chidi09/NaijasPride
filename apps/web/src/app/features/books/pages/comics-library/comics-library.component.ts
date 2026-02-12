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
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Search comics</mat-label>
            <input matInput [(ngModel)]="query" (keyup.enter)="search()" placeholder="Search comics by title..." />
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
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          @for (i of [1,2,3,4,5,6,7,8,9,10,11,12]; track i) {
            <div class="bg-[#e5d2c6] dark:bg-cinema-800 rounded aspect-[2/3] animate-pulse"></div>
          }
        </div>
      } @else {
        @if (searchResults().length > 0) {
          <section>
            <h2 class="mb-4 text-xl font-serif text-[#24181b] dark:text-white">Search Results</h2>
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              @for (comic of searchResults(); track comic.id) {
                <a [routerLink]="['/books/comics', toRouteParam(comic.id)]" class="group">
                  <div class="bg-[#f1e5dd] dark:bg-cinema-800 rounded overflow-hidden transition-transform group-hover:scale-105">
                    <div class="aspect-[2/3] relative">
                      @if (comic.coverUrl) {
                        <img [src]="comic.coverUrl" [alt]="comic.title" referrerpolicy="no-referrer" class="absolute inset-0 h-full w-full object-cover">
                      } @else {
                        <div class="h-full w-full bg-[#dcc4b8] dark:bg-cinema-700 flex items-center justify-center">
                          <span class="text-2xl">📖</span>
                        </div>
                      }
                    </div>
                    <div class="p-3">
                      <h3 class="text-[#24181b] dark:text-white text-sm font-medium line-clamp-2">{{ comic.title }}</h3>
                      @if (comic.latestChapter) {
                        <p class="text-[#9a6d1f] dark:text-[#d6b87a] text-xs mt-1">Latest: {{ comic.latestChapter }}</p>
                      }
                    </div>
                  </div>
                </a>
              }
            </div>
          </section>
        } @else {
          <section class="space-y-10">
            <div>
              <h2 class="mb-4 text-xl font-serif text-[#24181b] dark:text-white">Trending Comics</h2>
              <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                @for (comic of discoverTrending(); track comic.id) {
                  <a [routerLink]="['/books/comics', toRouteParam(comic.id)]" class="group">
                    <div class="bg-[#f1e5dd] dark:bg-cinema-800 rounded overflow-hidden transition-transform group-hover:scale-105">
                      <div class="aspect-[2/3] relative">
                        @if (comic.coverUrl) {
                          <img [src]="comic.coverUrl" [alt]="comic.title" referrerpolicy="no-referrer" class="absolute inset-0 h-full w-full object-cover">
                        } @else {
                          <div class="h-full w-full bg-[#dcc4b8] dark:bg-cinema-700 flex items-center justify-center">
                            <span class="text-2xl">📖</span>
                          </div>
                        }
                      </div>
                      <div class="p-3">
                        <h3 class="text-[#24181b] dark:text-white text-sm font-medium line-clamp-2">{{ comic.title }}</h3>
                        @if (comic.latestChapter) {
                          <p class="text-[#9a6d1f] dark:text-[#d6b87a] text-xs mt-1">Latest: {{ comic.latestChapter }}</p>
                        }
                      </div>
                    </div>
                  </a>
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
