import { Component, inject, input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Book } from '@naijaspride/types';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { BookOfflineService } from '../../../../core/services/book-offline.service';
import { LibraryService } from '../../../../core/services/library.service';
import { AuthService } from '../../../../core/auth/auth.service';

@Component({
  selector: 'app-book-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, MatButtonModule, MatCardModule, MatChipsModule],
  template: `
    @if (book(); as book) {
      <div class="container mx-auto px-4 py-12 books-theme">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <!-- Book Cover -->
          <div class="md:col-span-1">
            <div class="sticky top-24">
              @if (book.coverUrl) {
                <mat-card class="np-cover-card">
                  <div class="np-cover-media">
                    <img
                      [src]="book.coverUrl"
                      [alt]="book.title"
                      loading="lazy"
                      decoding="async"
                      referrerpolicy="no-referrer"
                    >
                  </div>
                </mat-card>
              } @else {
                <mat-card class="np-cover-card">
                  <div class="np-cover-media">
                    <div class="absolute inset-0 flex items-center justify-center text-6xl">📚</div>
                  </div>
                </mat-card>
              }
              
              @if (book.downloadUrl) {
                <div class="mt-6 grid gap-2">
                  @if (isReadableInApp(book)) {
                    <a
                      [routerLink]="['/books/read', book.slug]"
                      mat-flat-button
                      color="primary"
                      class="w-full"
                    >
                      Read Now
                    </a>
                  }

                  <a
                    [href]="book.downloadUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    mat-stroked-button
                    color="primary"
                    class="w-full"
                  >
                    Download {{ book.format || 'PDF' }}
                    @if (book.fileSize) {
                      <span class="text-sm font-normal block mt-1">
                        {{ formatFileSize(book.fileSize) }}
                      </span>
                    }
                  </a>

                  @if (isEpubBooksSource(book) && sourceUrl(book)) {
                    <a
                      [href]="sourceUrl(book)"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-center text-xs text-[#8a756e] hover:text-[#24181b] dark:text-gray-400 dark:hover:text-white"
                    >
                      View on epubBooks
                    </a>
                  }
                </div>
              }

              <!-- Offline save -->
              @if (bookOffline.isSupported && isReadableInApp(book)) {
                <div class="mt-3">
                  @if (bookOffline.isAvailable(book.id)) {
                    <button
                      mat-stroked-button
                      type="button"
                      color="warn"
                      class="w-full"
                      (click)="removeOffline(book)"
                    >
                      Remove Offline Copy
                    </button>
                  } @else if (bookOffline.getStatus(book.id) === 'downloading') {
                    <div class="text-xs text-center text-[var(--text-muted)] py-1">
                      Downloading… {{ bookOffline.getProgress(book.id) }}%
                    </div>
                    <div class="h-1 w-full bg-[#d9c4b7] dark:bg-white/10 rounded overflow-hidden">
                      <div class="h-full bg-cinema-500 transition-all" [style.width.%]="bookOffline.getProgress(book.id)"></div>
                    </div>
                  } @else {
                    <button
                      mat-stroked-button
                      type="button"
                      color="primary"
                      class="w-full"
                      (click)="saveOffline(book)"
                    >
                      Save for Offline
                      @if (bookOffline.getStatus(book.id) === 'error') {
                        <span class="ml-1 text-red-400 text-xs">(retry)</span>
                      }
                    </button>
                  }
                </div>
              }

              <!-- Add to favorites -->
              @if (auth.currentUser()) {
                <div class="mt-2">
                  <button
                    mat-stroked-button
                    type="button"
                    [color]="library.isFavoriteBook(book.id) ? 'warn' : 'primary'"
                    class="w-full"
                    (click)="toggleFavorite(book)"
                  >
                    {{ library.isFavoriteBook(book.id) ? '★ Favorited' : '☆ Add to Favorites' }}
                  </button>
                </div>
              }
            </div>
          </div>
          
          <!-- Book Details -->
          <div class="md:col-span-2">
            <a routerLink="/books" class="text-[#8a756e] hover:text-[#24181b] dark:text-gray-400 dark:hover:text-white transition-colors mb-4 inline-block">
              ← Back to Library
            </a>
            
            <h1 class="text-3xl md:text-4xl font-serif text-[#24181b] dark:text-white mb-2">{{ book.title }}</h1>
            <p class="text-xl text-[#8a756e] dark:text-gray-400 mb-6">by {{ book.author }}</p>
            
            <div class="flex flex-wrap gap-4 mb-8 text-sm text-[#8a756e] dark:text-gray-400">
              @if (book.year) {
                <span>{{ book.year }}</span>
              }
              @if (book.publisher) {
                <span>• {{ book.publisher }}</span>
              }
              @if (book.pageCount) {
                <span>• {{ book.pageCount }} pages</span>
              }
              @if (book.language) {
                <span>• {{ book.language }}</span>
              }
            </div>
            
            @if (book.genre?.length) {
              <mat-card class="np-surface-card mb-8 p-4">
                <p class="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Genres</p>
                <mat-chip-set class="mt-2" aria-label="Book genres">
                  @for (genre of book.genre; track genre) {
                    <mat-chip>{{ genre }}</mat-chip>
                  }
                </mat-chip-set>
              </mat-card>
            }
            
            @if (book.description) {
              <mat-card class="np-surface-card p-6">
                <p class="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Description</p>
                <p class="mt-2 text-[var(--text-secondary)] leading-relaxed">{{ book.description }}</p>
              </mat-card>
            }
            
            @if (book.isbn) {
              <div class="mt-6 text-[#8a756e] dark:text-gray-500 text-sm">
                ISBN: {{ book.isbn }}
              </div>
            }
          </div>
        </div>
      </div>
    } @else {
      <div class="container mx-auto px-4 py-24 text-center text-[#8a756e] dark:text-gray-400">
        <p>Loading...</p>
      </div>
    }
  `
})
export class BookDetailComponent implements OnInit {
  slug = input.required<string>();
  private http = inject(HttpClient);
  bookOffline = inject(BookOfflineService);
  library = inject(LibraryService);
  auth = inject(AuthService);

  book = signal<Book | null>(null);
  isLoading = signal(true);

  ngOnInit() {
    this.loadBook();
  }

  private loadBook() {
    this.isLoading.set(true);
    this.http.get<{ status: string; data: Book }>(`/api/v1/books/${this.slug()}`)
      .subscribe({
        next: (response) => {
          this.book.set(response.data);
          this.isLoading.set(false);
          // Load favorite state
          if (this.auth.currentUser()) {
            this.library.checkBookFavorite(response.data.id).catch(() => {/* ignore */});
          }
        },
        error: (error) => {
          console.error('Error loading book:', error);
          this.book.set(null);
          this.isLoading.set(false);
        }
      });
  }

  saveOffline(book: Book) {
    const apiFileUrl = `/api/v1/books/${encodeURIComponent(book.slug)}/file?disposition=inline`;
    this.bookOffline.download({
      bookId: book.id,
      bookTitle: book.title,
      bookSlug: book.slug,
      author: book.author,
      format: book.format,
      apiFileUrl,
      coverUrl: book.coverUrl ?? undefined,
      fileSizeBytes: book.fileSize ?? undefined,
    }).catch(console.error);
  }

  removeOffline(book: Book) {
    this.bookOffline.remove(book.id).catch(console.error);
  }

  toggleFavorite(book: Book) {
    this.library.toggleBookFavorite(book.id).catch(console.error);
  }

  isEpubBook(book: Book): boolean {
    return (book.format || '').trim().toLowerCase() === 'epub';
  }

  isReadableInApp(book: Book): boolean {
    const format = (book.format || '').trim().toLowerCase();
    return format === 'epub' || format === 'pdf';
  }

  isEpubBooksSource(book: Book): boolean {
    return (book.publisher || '').trim().toLowerCase() === 'epubbooks' || book.slug.toLowerCase().startsWith('epubbooks-');
  }

  sourceUrl(book: Book): string | null {
    const slug = book.slug.toLowerCase();
    if (!slug.startsWith('epubbooks-')) return null;
    const externalSlug = book.slug.slice('epubbooks-'.length);
    return `https://www.epubbooks.com/book/${externalSlug}`;
  }
  
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
