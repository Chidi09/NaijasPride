/**
 * BookOfflineService
 *
 * Saves a full book file (PDF or EPUB) for offline reading in the PWA.
 *
 * Books are served by the API at: GET /api/v1/books/:slug/file
 * We fetch that endpoint as a Blob and store it in Cache Storage under:
 *   /offline/book/<bookId>/file
 *
 * The Service Worker intercepts these URLs and serves them from cache.
 * epub.js / pdfjs-dist fetch the file URL via XHR / fetch — the SW
 * transparently serves the offline blob, so the readers work unchanged.
 *
 * Server record: POST /api/v1/library/books/offline (authenticated)
 */

import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

// ─── Constants ────────────────────────────────────────────────────────────────

const BOOK_CACHE      = 'np-books-v1';
const BOOK_META_DB    = 'np_book_offline_v1';
const BOOK_META_STORE = 'books';
const BOOK_URL_PREFIX = '/offline/book/';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BookDLStatus = 'idle' | 'downloading' | 'complete' | 'error';

export interface BookOfflineMeta {
  /** bookId */
  id: string;
  bookId: string;
  bookTitle: string;
  bookSlug: string;
  author: string;
  format: string;
  coverUrl?: string;
  status: BookDLStatus;
  progress: number;
  fileSizeBytes: number;
  savedAt: number;
  error?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class BookOfflineService {
  private http = inject(HttpClient);

  private _books = signal<Map<string, BookOfflineMeta>>(new Map());
  readonly books = computed(() => [...this._books().values()]);

  private _dbPromise: Promise<IDBDatabase> | null = null;

  get isSupported(): boolean {
    return typeof caches !== 'undefined' && typeof indexedDB !== 'undefined';
  }

  constructor() {
    if (this.isSupported) this._loadFromDb();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  isAvailable(bookId: string): boolean {
    return this._books().get(bookId)?.status === 'complete';
  }

  getStatus(bookId: string): BookDLStatus {
    return this._books().get(bookId)?.status ?? 'idle';
  }

  getProgress(bookId: string): number {
    return this._books().get(bookId)?.progress ?? 0;
  }

  /**
   * Returns the virtual URL that maps to the cached blob via the Service Worker.
   * Use this as the `fileUrl` for epub.js / pdfjs when offline.
   */
  getOfflineFileUrl(bookId: string): string {
    return `${BOOK_URL_PREFIX}${bookId}/file`;
  }

  /**
   * Download the book file from the API and cache it.
   * @param apiFileUrl  The URL returned by the API, e.g. /api/v1/books/slug/file
   */
  async download(params: {
    bookId: string;
    bookTitle: string;
    bookSlug: string;
    author: string;
    format: string;
    apiFileUrl: string;
    coverUrl?: string;
    fileSizeBytes?: number;
  }): Promise<void> {
    if (!this.isSupported) throw new Error('Offline storage not supported');

    const { bookId } = params;
    const existing = this._books().get(bookId);
    if (existing?.status === 'downloading') return;
    if (existing?.status === 'complete') return;

    const meta: BookOfflineMeta = {
      id: bookId,
      bookId,
      bookTitle: params.bookTitle,
      bookSlug: params.bookSlug,
      author: params.author,
      format: params.format,
      coverUrl: params.coverUrl,
      status: 'downloading',
      progress: 0,
      fileSizeBytes: params.fileSizeBytes ?? 0,
      savedAt: Date.now(),
    };
    this._update(meta);

    try {
      const response = await fetch(params.apiFileUrl, { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);
      const total = contentLength || params.fileSizeBytes || 0;

      // Stream with progress
      const reader = response.body?.getReader();
      if (!reader) throw new Error('ReadableStream not supported');

      const chunks: Uint8Array[] = [];
      let downloaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          downloaded += value.length;
          meta.progress = total > 0 ? Math.round((downloaded / total) * 100) : 0;
          meta.fileSizeBytes = downloaded;
          this._update({ ...meta });
        }
      }

      const mimeType = params.format.toLowerCase() === 'pdf' ? 'application/pdf' : 'application/epub+zip';
      const blob = new Blob(chunks, { type: mimeType });

      const cache = await caches.open(BOOK_CACHE);
      const cacheKey = this.getOfflineFileUrl(bookId);
      await cache.put(cacheKey, new Response(blob, {
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(blob.size),
          'Content-Disposition': `inline; filename="${params.bookSlug}.${params.format.toLowerCase()}"`,
        },
      }));

      const done: BookOfflineMeta = { ...meta, status: 'complete', progress: 100, fileSizeBytes: blob.size, savedAt: Date.now() };
      this._update(done);

      // Record on server
      firstValueFrom(this.http.post('/api/v1/library/books/offline', {
        bookId,
        format: params.format,
        fileSizeBytes: blob.size,
      })).catch(console.error);

    } catch (err) {
      this._update({ ...meta, status: 'error', error: err instanceof Error ? err.message : 'Download failed' });
      throw err;
    }
  }

  async remove(bookId: string): Promise<void> {
    try {
      const cache = await caches.open(BOOK_CACHE);
      await cache.delete(this.getOfflineFileUrl(bookId));
    } catch { /* ignore */ }

    const db = await this._openDb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(BOOK_META_STORE, 'readwrite');
      tx.objectStore(BOOK_META_STORE).delete(bookId);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });

    const map = new Map(this._books());
    map.delete(bookId);
    this._books.set(map);

    firstValueFrom(this.http.delete(`/api/v1/library/books/offline/${bookId}`))
      .catch(console.error);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private _update(meta: BookOfflineMeta): void {
    const map = new Map(this._books());
    map.set(meta.id, { ...meta });
    this._books.set(map);
    this._persist(meta).catch(console.error);
  }

  private async _persist(meta: BookOfflineMeta): Promise<void> {
    const db = await this._openDb();
    return new Promise((res, rej) => {
      const tx = db.transaction(BOOK_META_STORE, 'readwrite');
      tx.objectStore(BOOK_META_STORE).put(meta);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  private async _loadFromDb() {
    try {
      const db = await this._openDb();
      const all = await new Promise<BookOfflineMeta[]>((res, rej) => {
        const tx = db.transaction(BOOK_META_STORE, 'readonly');
        const req = tx.objectStore(BOOK_META_STORE).getAll();
        req.onsuccess = () => res(req.result as BookOfflineMeta[]);
        req.onerror = () => rej(req.error);
      });
      const map = new Map<string, BookOfflineMeta>();
      for (const item of all) {
        if (item.status === 'downloading') {
          item.status = 'error';
          item.error = 'Download interrupted. Tap to retry.';
        }
        map.set(item.id, item);
      }
      this._books.set(map);
    } catch (err) {
      console.warn('[BookOffline] Failed to load IndexedDB:', err);
    }
  }

  private _openDb(): Promise<IDBDatabase> {
    if (this._dbPromise) return this._dbPromise;
    this._dbPromise = new Promise((res, rej) => {
      const req = indexedDB.open(BOOK_META_DB, 1);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(BOOK_META_STORE)) {
          db.createObjectStore(BOOK_META_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => res((e.target as IDBOpenDBRequest).result);
      req.onerror = (e) => {
        this._dbPromise = null;
        rej((e.target as IDBOpenDBRequest).error);
      };
    });
    return this._dbPromise;
  }
}
