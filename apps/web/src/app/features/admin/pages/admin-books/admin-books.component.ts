import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Book } from '@naijaspride/types';

type UploadUrlResponse = {
  status: string;
  data: {
    uploadUrl: string;
    storageKey: string;
    downloadUrl: string;
  };
};

@Component({
  selector: 'app-admin-books',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <section class="rounded-xl border border-[#dcc5b8] bg-[#fffdf8] dark:border-[#2d1a21] dark:bg-[#140d11]">
        <div class="border-b border-[#dcc5b8] p-6 dark:border-[#2d1a21]">
          <h2 class="text-xl font-bold text-[#24181b] dark:text-white">Upload Book / Comic</h2>
          <p class="mt-1 text-sm text-[#7b6660] dark:text-[#9f7d73]">Upload EPUB/PDF files, then publish metadata to the library.</p>
        </div>

        <div class="space-y-5 p-6">
          <div class="rounded-lg border border-[#d6b87a]/40 bg-[#fff7f0] p-4 dark:border-[#5f1327]/40 dark:bg-[#1b1014]">
            <label class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#7b6660] dark:text-[#9f7d73]">File Upload</label>
            <input
              type="file"
              (change)="onFileSelected($event)"
              accept=".pdf,.epub,.mobi,.azw,.azw3,.txt,.doc,.docx"
              class="w-full rounded-lg border border-[#dcc5b8] bg-white px-3 py-2 text-sm text-[#24181b] dark:border-[#5f1327] dark:bg-[#120a0d] dark:text-[#f7eee7]"
            >

            @if (selectedFileName()) {
              <p class="mt-2 text-xs text-[#7b6660] dark:text-[#b59c95]">Selected: {{ selectedFileName() }}</p>
            }

            <button
              type="button"
              (click)="uploadSelectedFile()"
              [disabled]="!selectedFile() || isUploadingFile()"
              class="mt-3 rounded-lg bg-cinema-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cinema-400 disabled:opacity-50"
            >
              {{ isUploadingFile() ? 'Uploading...' : 'Upload File' }}
            </button>

            @if (fileUploadMessage()) {
              <p class="mt-2 text-xs text-emerald-400">{{ fileUploadMessage() }}</p>
            }
            @if (fileUploadError()) {
              <p class="mt-2 text-xs text-red-400">{{ fileUploadError() }}</p>
            }
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs text-[#7b6660] dark:text-[#9f7d73]">Type</label>
              <select [(ngModel)]="kind" class="w-full rounded-lg border border-[#dcc5b8] bg-white px-3 py-2 text-sm text-[#24181b] dark:border-[#5f1327] dark:bg-[#120a0d] dark:text-[#f7eee7]">
                <option value="book">Book</option>
                <option value="comic">Comic</option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-xs text-[#7b6660] dark:text-[#9f7d73]">Year</label>
              <input [(ngModel)]="year" type="number" class="w-full rounded-lg border border-[#dcc5b8] bg-white px-3 py-2 text-sm text-[#24181b] dark:border-[#5f1327] dark:bg-[#120a0d] dark:text-[#f7eee7]">
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs text-[#7b6660] dark:text-[#9f7d73]">Title</label>
              <input [(ngModel)]="title" type="text" class="w-full rounded-lg border border-[#dcc5b8] bg-white px-3 py-2 text-sm text-[#24181b] dark:border-[#5f1327] dark:bg-[#120a0d] dark:text-[#f7eee7]">
            </div>
            <div>
              <label class="mb-1 block text-xs text-[#7b6660] dark:text-[#9f7d73]">Author</label>
              <input [(ngModel)]="author" type="text" class="w-full rounded-lg border border-[#dcc5b8] bg-white px-3 py-2 text-sm text-[#24181b] dark:border-[#5f1327] dark:bg-[#120a0d] dark:text-[#f7eee7]">
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs text-[#7b6660] dark:text-[#9f7d73]">Format</label>
              <input [(ngModel)]="format" type="text" class="w-full rounded-lg border border-[#dcc5b8] bg-white px-3 py-2 text-sm text-[#24181b] dark:border-[#5f1327] dark:bg-[#120a0d] dark:text-[#f7eee7]">
            </div>
            <div>
              <label class="mb-1 block text-xs text-[#7b6660] dark:text-[#9f7d73]">Language</label>
              <input [(ngModel)]="language" type="text" class="w-full rounded-lg border border-[#dcc5b8] bg-white px-3 py-2 text-sm text-[#24181b] dark:border-[#5f1327] dark:bg-[#120a0d] dark:text-[#f7eee7]">
            </div>
          </div>

          <div>
            <label class="mb-1 block text-xs text-[#7b6660] dark:text-[#9f7d73]">Genres (comma separated)</label>
            <input [(ngModel)]="genreInput" type="text" placeholder="Fiction, Classic" class="w-full rounded-lg border border-[#dcc5b8] bg-white px-3 py-2 text-sm text-[#24181b] dark:border-[#5f1327] dark:bg-[#120a0d] dark:text-[#f7eee7]">
          </div>

          <div>
            <label class="mb-1 block text-xs text-[#7b6660] dark:text-[#9f7d73]">Description</label>
            <textarea [(ngModel)]="description" rows="4" class="w-full rounded-lg border border-[#dcc5b8] bg-white px-3 py-2 text-sm text-[#24181b] dark:border-[#5f1327] dark:bg-[#120a0d] dark:text-[#f7eee7]"></textarea>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs text-[#7b6660] dark:text-[#9f7d73]">Cover URL (optional)</label>
              <input [(ngModel)]="coverUrl" type="url" class="w-full rounded-lg border border-[#dcc5b8] bg-white px-3 py-2 text-sm text-[#24181b] dark:border-[#5f1327] dark:bg-[#120a0d] dark:text-[#f7eee7]">
            </div>
            <div>
              <label class="mb-1 block text-xs text-[#7b6660] dark:text-[#9f7d73]">Download URL</label>
              <input [(ngModel)]="downloadUrl" type="text" class="w-full rounded-lg border border-[#dcc5b8] bg-white px-3 py-2 text-sm text-[#24181b] dark:border-[#5f1327] dark:bg-[#120a0d] dark:text-[#f7eee7]">
            </div>
          </div>

          <button
            type="button"
            (click)="createBook()"
            [disabled]="isCreatingBook()"
            class="rounded-lg bg-[#800020] px-5 py-3 text-sm font-semibold text-white hover:bg-[#660019] disabled:opacity-50"
          >
            {{ isCreatingBook() ? 'Saving...' : 'Publish to Library' }}
          </button>

          @if (createMessage()) {
            <p class="text-sm text-emerald-400">{{ createMessage() }}</p>
          }
          @if (createError()) {
            <p class="text-sm text-red-400">{{ createError() }}</p>
          }
        </div>
      </section>

      <section class="rounded-xl border border-[#dcc5b8] bg-[#fffdf8] dark:border-[#2d1a21] dark:bg-[#140d11]">
        <div class="border-b border-[#dcc5b8] p-6 flex items-center justify-between dark:border-[#2d1a21]">
          <h3 class="text-lg font-semibold text-[#24181b] dark:text-white">Recent Library Entries</h3>
          <button type="button" (click)="loadBooks()" class="text-xs text-[#5f1327] hover:text-[#24181b] dark:text-[#d6b87a] dark:hover:text-white">Refresh</button>
        </div>
        <div class="p-6">
          @if (isLoadingBooks()) {
            <p class="text-sm text-[#7b6660] dark:text-[#9f7d73]">Loading books...</p>
          } @else if (books().length === 0) {
            <p class="text-sm text-[#7b6660] dark:text-[#9f7d73]">No books found.</p>
          } @else {
            <div class="space-y-3">
              @for (book of books(); track book.id) {
                <article class="rounded-lg border border-[#dcc5b8] bg-[#fff7f0] p-3 dark:border-[#2d1a21] dark:bg-[#1b1014]">
                  <p class="text-sm font-semibold text-[#24181b] dark:text-white line-clamp-2">{{ book.title }}</p>
                  <p class="mt-1 text-xs text-[#7b6660] dark:text-[#b59c95]">{{ book.author }} • {{ book.year }}</p>
                  <p class="mt-1 text-[11px] text-[#8a756e] dark:text-[#9f7d73] line-clamp-1">{{ book.genre.join(', ') }}</p>
                </article>
              }
            </div>
          }
        </div>
      </section>
    </div>
  `,
})
export class AdminBooksComponent {
  private readonly http = inject(HttpClient);

  books = signal<Book[]>([]);
  isLoadingBooks = signal(false);

  selectedFile = signal<File | null>(null);
  selectedFileName = signal('');
  isUploadingFile = signal(false);
  fileUploadMessage = signal('');
  fileUploadError = signal('');

  isCreatingBook = signal(false);
  createMessage = signal('');
  createError = signal('');

  kind: 'book' | 'comic' = 'book';
  title = '';
  author = '';
  year = new Date().getFullYear();
  description = '';
  format = 'PDF';
  language = 'English';
  genreInput = 'General';
  coverUrl = '';
  downloadUrl = '';
  fileSize?: number;

  constructor() {
    this.loadBooks();
  }

  loadBooks() {
    this.isLoadingBooks.set(true);
    this.http.get<{ status: string; data: Book[] }>('/api/v1/books?page=1&limit=25').subscribe({
      next: (response) => {
        this.books.set(response.data || []);
        this.isLoadingBooks.set(false);
      },
      error: () => {
        this.isLoadingBooks.set(false);
      },
    });
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    this.selectedFile.set(file);
    this.selectedFileName.set(file?.name || '');
    this.fileUploadError.set('');
    this.fileUploadMessage.set('');

    if (file) {
      this.fileSize = file.size;
      const inferredFormat = this.inferFormatFromFileName(file.name);
      if (inferredFormat) this.format = inferredFormat;
      if (!this.title.trim()) {
        this.title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
      }
    }
  }

  uploadSelectedFile() {
    const file = this.selectedFile();
    if (!file) return;

    this.isUploadingFile.set(true);
    this.fileUploadError.set('');
    this.fileUploadMessage.set('');

    const contentType = file.type || this.inferMimeType(file.name);

    this.http
      .post<UploadUrlResponse>('/api/v1/books/upload-url', {
        fileName: file.name,
        contentType,
      })
      .subscribe({
        next: async (response) => {
          try {
            const uploadResult = await fetch(response.data.uploadUrl, {
              method: 'PUT',
              headers: {
                'Content-Type': contentType,
              },
              body: file,
            });

            if (!uploadResult.ok) {
              throw new Error(`Upload failed with status ${uploadResult.status}`);
            }

            this.downloadUrl = response.data.downloadUrl;
            this.fileUploadMessage.set('File uploaded successfully. You can now publish this entry.');
            this.isUploadingFile.set(false);
          } catch (error) {
            this.fileUploadError.set(error instanceof Error ? error.message : 'Upload failed');
            this.isUploadingFile.set(false);
          }
        },
        error: (error) => {
          this.fileUploadError.set(error?.error?.message || 'Failed to get upload URL');
          this.isUploadingFile.set(false);
        },
      });
  }

  createBook() {
    this.createMessage.set('');
    this.createError.set('');

    if (!this.title.trim() || !this.author.trim() || !this.downloadUrl.trim()) {
      this.createError.set('Title, author, and download URL are required.');
      return;
    }

    const genres = this.genreInput
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (this.kind === 'comic' && !genres.includes('Comic')) {
      genres.unshift('Comic');
    }

    this.isCreatingBook.set(true);
    this.http
      .post<{ status: string; data: Book }>('/api/v1/books', {
        title: this.title.trim(),
        author: this.author.trim(),
        description: this.description.trim() || undefined,
        year: this.year,
        coverUrl: this.coverUrl.trim() || undefined,
        downloadUrl: this.downloadUrl.trim(),
        fileSize: this.fileSize,
        format: this.format.trim() || 'PDF',
        genre: genres.length > 0 ? genres : [this.kind === 'comic' ? 'Comic' : 'General'],
        kind: this.kind,
        language: this.language.trim() || 'English',
      })
      .subscribe({
        next: () => {
          this.createMessage.set(`Published "${this.title}" successfully.`);
          this.isCreatingBook.set(false);
          this.loadBooks();
        },
        error: (error) => {
          this.createError.set(error?.error?.message || 'Failed to create book');
          this.isCreatingBook.set(false);
        },
      });
  }

  private inferFormatFromFileName(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase();
    if (!extension) return '';
    if (extension === 'epub') return 'EPUB';
    if (extension === 'pdf') return 'PDF';
    if (extension === 'mobi') return 'MOBI';
    if (extension === 'txt') return 'TXT';
    if (extension === 'doc' || extension === 'docx') return 'DOC';
    return extension.toUpperCase();
  }

  private inferMimeType(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'epub':
        return 'application/epub+zip';
      case 'pdf':
        return 'application/pdf';
      case 'mobi':
        return 'application/x-mobipocket-ebook';
      case 'txt':
        return 'text/plain';
      case 'doc':
        return 'application/msword';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      default:
        return 'application/octet-stream';
    }
  }
}
